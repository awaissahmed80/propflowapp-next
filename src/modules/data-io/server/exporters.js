import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { peopleByIds } from "@/modules/users/server/queries"
import { scoped as crmScoped } from "@/modules/crm/server/context"
import { scoped as contactsScoped } from "@/modules/contacts/server/context"
import { scoped as hrScoped } from "@/modules/hr/server/context"
import { SALARY_PARTS } from "@/modules/hr/constants"
import { formatPkPhone } from "@/lib/phone"
import { maskCnic } from "@/lib/cnic"

// Export: everything this person may see, as { headers, rows } (text and numbers) for the browser
// to write as Excel or CSV. Column headings match the import's, so an export can be edited and
// imported back. Leads follow CRM reach, contacts mask CNICs without contacts.cnic, employees show
// pay only with hr.salaries.

export const MAX_EXPORT_ROWS = 50_000

const label = (list, v) => list.find((x) => x.value === v)?.label ?? v ?? ""
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "")
const pkTime = (d) => (d ? new Date(new Date(d).getTime() + 5 * 3_600_000).toISOString().slice(0, 16).replace("T", " ") : "")
const size = (v, u) => (v == null ? "" : `${Number(v)} ${u === "sqft" ? "sq ft" : (u ?? "")}`.trim())
const budget = (min, max) => (min == null && max == null ? "" : [min, max].filter((x) => x != null).join(" - "))

export const exporters = {
  async leads(ctx) {
    const [lists, rows, projects] = await Promise.all([
      getLookups(ctx.db, ["lead-source", "lead-status", "lead-priority", "unit-type"]),
      crmScoped(ctx, live(ctx.db, "leads")).orderBy("leads.id", "desc").limit(MAX_EXPORT_ROWS).select("leads.*"),
      live(ctx.db, "projects").select("id", "name"),
    ])
    const people = await peopleByIds(rows.map((r) => r.assignedTo))
    return {
      headers: ["Lead code", "Old ID", "Name", "Mobile", "Email", "City", "Source", "Status", "Temperature", "Project", "Property type", "Size", "Budget", "Payment plan", "Agent", "Notes", "Lead date", "Last contact"],
      rows: rows.map((l) => [
        l.code,
        l.importRef ?? "",
        l.name,
        formatPkPhone(l.phone),
        l.email ?? "",
        l.city ?? "",
        label(lists["lead-source"], l.source),
        label(lists["lead-status"], l.status),
        label(lists["lead-priority"], l.priority),
        projects.find((p) => p.id === l.projectId)?.name ?? "",
        label(lists["unit-type"], l.unitType),
        size(l.sizeValue, l.sizeUnit),
        budget(l.budgetMin, l.budgetMax),
        l.paymentPlan === "cash" ? "Cash" : l.paymentPlan === "installments" ? "Installments" : "",
        people.get(l.assignedTo)?.name ?? "",
        l.notes ?? "",
        day(l.createdAt),
        pkTime(l.lastContactAt),
      ]),
    }
  },

  async activities(ctx) {
    const [lists, rows] = await Promise.all([
      getLookups(ctx.db, ["activity-type", "activity-outcome"]),
      crmScoped(ctx, live(ctx.db, "leads"))
        .join("leadActivities as a", "a.leadId", "leads.id")
        .whereNot("a.type", "system")
        .orderBy("a.at", "desc")
        .limit(MAX_EXPORT_ROWS)
        .select("leads.code", "a.type", "a.at", "a.status", "a.outcome", "a.notes", "a.by"),
    ])
    const people = await peopleByIds(rows.map((r) => r.by))
    return {
      headers: ["Lead", "Type", "Date & time", "Done or planned", "Outcome", "Notes", "By"],
      rows: rows.map((a) => [
        a.code,
        label(lists["activity-type"], a.type),
        pkTime(a.at),
        a.status === "done" ? "Done" : a.status === "missed" ? "Missed" : "Planned",
        label(lists["activity-outcome"], a.outcome),
        a.notes ?? "",
        people.get(a.by)?.name ?? "",
      ]),
    }
  },

  async contacts(ctx) {
    const [types, rows] = await Promise.all([getLookups(ctx.db, ["contact-type"]), contactsScoped(ctx, live(ctx.db, "contacts")).orderBy("contacts.id", "desc").limit(MAX_EXPORT_ROWS).select("contacts.*")])
    const links = rows.length
      ? await live(ctx.db, "contactLinks")
          .whereIn(
            "contactId",
            rows.map((r) => r.id),
          )
          .distinct("contactId", "role")
      : []
    return {
      headers: ["Contact code", "Name", "Mobile", "CNIC", "Email", "Contact type", "Person or company", "Company", "Designation", "Relation (S/O, D/O, W/O)", "Father / husband name", "City", "Address", "Notes"],
      rows: rows.map((c) => [
        c.code,
        c.name,
        formatPkPhone(c.phone),
        ctx.cnic(c.cnic) ?? "",
        c.email ?? "",
        [...new Set(links.filter((l) => l.contactId === c.id).map((l) => label(types["contact-type"], l.role)))].join(", "),
        c.kind === "company" ? "Company" : "Person",
        c.company ?? "",
        c.designation ?? "",
        c.guardianRelation ?? "",
        c.guardianName ?? "",
        c.city ?? "",
        c.address ?? "",
        c.notes ?? "",
      ]),
    }
  },

  async units(ctx) {
    const [lists, rows] = await Promise.all([
      getLookups(ctx.db, ["unit-type", "feature"]),
      ctx
        .db("units as u")
        .whereNull("u.deletedAt")
        .join("projects as p", "p.id", "u.projectId")
        .join("projectPhases as ph", "ph.id", "u.phaseId")
        .join("projectBlocks as b", "b.id", "u.blockId")
        .orderBy(["p.code", "ph.id", "b.name", "u.number"])
        .limit(MAX_EXPORT_ROWS)
        .select(
          "u.code",
          "p.code as project",
          "ph.name as phase",
          "b.name as block",
          "u.number",
          "u.type",
          "u.sizeValue",
          "u.sizeUnit",
          "u.baseRate",
          "u.price",
          "u.features",
          "u.street",
          "u.floor",
          "u.bedrooms",
          "u.status",
        ),
    ])
    return {
      headers: ["Unit code", "Project", "Phase", "Block", "Unit number", "Type", "Size", "Base rate", "Price", "Features", "Street", "Floor", "Bedrooms", "Status"],
      rows: rows.map((u) => {
        const feats = typeof u.features === "string" ? JSON.parse(u.features || "[]") : (u.features ?? [])
        return [
          u.code,
          u.project,
          u.phase,
          u.block,
          u.number,
          label(lists["unit-type"], u.type),
          size(u.sizeValue, u.sizeUnit),
          Number(u.baseRate ?? 0),
          Number(u.price ?? 0),
          feats.map((f) => label(lists.feature, f)).join(", "),
          u.street ?? "",
          u.floor ?? "",
          u.bedrooms ?? "",
          u.status,
        ]
      }),
    }
  },

  async employees(ctx) {
    const pay = Boolean(ctx.grant?.("hr.salaries"))
    const [lists, rows] = await Promise.all([
      getLookups(ctx.db, ["designation", "department", "employment-type"]),
      hrScoped(ctx, live(ctx.db, "employees")).orderBy("employees.code").limit(MAX_EXPORT_ROWS).select("employees.*"),
    ])
    return {
      headers: [
        "Employee code",
        "Name",
        "Joining date",
        "CNIC",
        "Mobile",
        "Email",
        "Designation",
        "Department",
        "Employment type",
        "Gender",
        "Status",
        ...(pay ? ["Pay by", "Bank", "Account title", "IBAN", ...SALARY_PARTS.map((p) => (p.key === "basic" ? "Basic salary" : p.label))] : []),
      ],
      rows: rows.map((e) => {
        const salary = typeof e.salary === "string" ? JSON.parse(e.salary || "{}") : (e.salary ?? {})
        return [
          e.code,
          e.name,
          day(e.joinedOn),
          maskCnic(e.cnic, Boolean(ctx.grant?.("contacts.cnic"))) ?? "",
          formatPkPhone(e.phone),
          e.email ?? "",
          label(lists.designation, e.designation),
          label(lists.department, e.department),
          label(lists["employment-type"], e.employmentType),
          e.gender ? e.gender[0].toUpperCase() + e.gender.slice(1) : "",
          e.status === "left" ? "Left" : "Active",
          ...(pay ? [e.payMethod === "cash" ? "Cash" : "Bank", e.bankName ?? "", e.accountTitle ?? "", e.iban ?? "", ...SALARY_PARTS.map((p) => Number(salary[p.key] ?? 0))] : []),
        ]
      }),
    }
  },
}
