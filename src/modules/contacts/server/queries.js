import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { peopleByIds } from "@/modules/users/server/queries"
import { crmContext, scoped as crmScoped } from "@/modules/crm/server/context"
import { salesContext, scoped as salesScoped } from "@/modules/operations/server/context"
import { servicesContext, scoped as servicesScoped } from "@/modules/estate/server/context"
import { financeContext } from "@/modules/finance/server/context"
import { hrContext, scoped as hrScoped } from "@/modules/hr/server/context"
import { usersContext } from "@/modules/users/server/context"
import { duplicateGroups, needsKyc } from "../review"
import { scoped } from "./context"

// Reads for Contacts. Every contact comes through scoped(), so people only see the directory their
// role allows; CNICs come out through ctx.cnic() (masked without contacts.cnic).

const DAY = 86_400_000
const person = (p) => (p ? { id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null } : null)
const upper = (v) => String(v ?? "").toUpperCase()
const ids = (rows) => (rows.length ? rows : [0])

// Everyone this person may see, with what they are to the business (types from their links),
// their lead counts and bookings. Newest first.
//   → [{ id, code, kind, name, phone, whatsapp, email, cnic (masked), rawCnic, hasCnic, city,
//        overseas, company, designation, createdAt, types, leads: { total, open }, bookings }]
async function directory(ctx) {
  const db = ctx.db
  const rows = await scoped(ctx, live(db, "contacts"))
    .orderBy("contacts.createdAt", "desc")
    .orderBy("contacts.id", "desc")
    .limit(20000)
    .select(
      "contacts.id",
      "contacts.code",
      "contacts.kind",
      "contacts.name",
      "contacts.phone",
      "contacts.whatsapp",
      "contacts.email",
      "contacts.cnic",
      "contacts.city",
      "contacts.overseas",
      "contacts.company",
      "contacts.designation",
      "contacts.createdAt",
    )
  const [roles, leads, bookings] = await Promise.all([
    live(db, "contactLinks").distinct("contactId", "role"),
    db("contactLinks as k")
      .join("leads as l", (j) => j.on("l.id", "k.linkableId").andOnVal("k.linkableType", "lead"))
      .whereNull("k.deletedAt")
      .whereNull("l.deletedAt")
      .groupBy("k.contactId")
      .select("k.contactId", db.raw("COUNT(*) AS total"), db.raw("SUM(CASE WHEN l.archived_at IS NULL AND l.status NOT IN ('booked', 'lost') THEN 1 ELSE 0 END) AS open")),
    live(db, "bookings").whereNotNull("contactId").groupBy("contactId").select("contactId").count({ n: "*" }),
  ])
  const typesOf = new Map()
  for (const r of roles) typesOf.set(r.contactId, [...(typesOf.get(r.contactId) ?? []), r.role])
  const leadsOf = new Map(leads.map((r) => [r.contactId, { total: Number(r.total), open: Number(r.open ?? 0) }]))
  const bookingsOf = new Map(bookings.map((r) => [r.contactId, Number(r.n)]))
  return rows.map((c) => ({
    id: c.id,
    code: c.code,
    kind: c.kind,
    name: c.name,
    phone: c.phone,
    whatsapp: Boolean(c.whatsapp),
    email: c.email,
    cnic: ctx.cnic(c.cnic),
    rawCnic: c.cnic,
    hasCnic: Boolean(c.cnic),
    city: c.city,
    overseas: Boolean(c.overseas),
    company: c.company,
    designation: c.designation,
    createdAt: c.createdAt,
    types: typesOf.get(c.id) ?? [],
    leads: leadsOf.get(c.id) ?? { total: 0, open: 0 },
    bookings: bookingsOf.get(c.id) ?? 0,
  }))
}

// What the browser gets for a row (no ids, no full CNIC)
const row = ({ id, rawCnic, ...c }) => c

// The Overview page: tiles, by type, recently added, by city and repeat enquirers
export async function contactsOverview(ctx) {
  const all = await directory(ctx)
  const now = Date.now()
  const since = (days) => all.filter((c) => now - new Date(c.createdAt).getTime() < days * DAY).length
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const byType = new Map()
  for (const c of all) for (const t of new Set(c.types)) byType.set(t, (byType.get(t) ?? 0) + 1)
  const byCity = new Map()
  for (const c of all) {
    const k = c.city || ""
    byCity.set(k, (byCity.get(k) ?? 0) + 1)
  }
  const repeat = all.filter((c) => c.leads.total > 1).sort((a, b) => b.leads.total - a.leads.total || b.leads.open - a.leads.open)
  const dupes = ctx.has("review") ? duplicateGroups(all.map((c) => ({ id: c.id, name: c.name, phone: c.phone, cnic: c.rawCnic }))) : []
  return {
    total: all.length,
    multi: all.filter((c) => new Set(c.types).size > 1).length,
    month: all.filter((c) => new Date(c.createdAt) >= monthStart).length,
    week: since(7),
    customers: byType.get("customer") ?? 0,
    missingCnic: all.filter(needsKyc).length,
    duplicates: dupes.length,
    types: [...byType.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    cities: [...byCity.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    recent: all.slice(0, 7).map(row),
    repeat: repeat.slice(0, 8).map(row),
    repeatCount: repeat.length,
  }
}

// A list view: "all" | "type:<role>" | "missing-cnic"
export async function contactsList(ctx, view = "all") {
  const all = await directory(ctx)
  let rows = all
  if (view.startsWith("type:")) {
    const type = view.slice(5)
    rows = all.filter((c) => c.types.includes(type))
  } else if (view === "missing-cnic") rows = all.filter(needsKyc)
  return { rows: rows.map(row), total: all.length }
}

// Possible duplicates: groups of contacts that share a CNIC, mobile or name (titles aside), the
// strongest matches first → [{ key, reasons, contacts }]
export async function contactDuplicates(ctx) {
  const all = await directory(ctx)
  const byId = new Map(all.map((c) => [c.id, c]))
  const rank = (g) => (g.reasons.includes("cnic") ? 0 : g.reasons.includes("phone") ? 1 : 2)
  return duplicateGroups(all.map((c) => ({ id: c.id, name: c.name, phone: c.phone, cnic: c.rawCnic })))
    .map((g) => {
      const contacts = g.ids.map((id) => byId.get(id)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      return { key: contacts.map((c) => c.code).join(":"), reasons: g.reasons, contacts: contacts.map(row) }
    })
    .sort((a, b) => rank(a) - rank(b) || a.contacts[0].name.localeCompare(b.contacts[0].name))
}

// Lists the contact page needs besides the layout's (contact types, cities)
export const DETAIL_LISTS = ["lead-status", "lead-priority", "lead-source", "unit-type", "activity-type", "activity-outcome", "booking-stage", "booking-status", "service-request-type", "service-status"]
export const detailLists = (ctx) => getLookups(ctx.db, DETAIL_LISTS)

// One contact (by code, e.g. CT-00012) with everything linked to them across the apps this person
// can open: leads, bookings, Estate Management requests, payment requests, dealer firm, employee
// record and workspace login, plus one timeline of what happened. null when it isn't theirs to see.
export async function contactDetail(ctx, code) {
  const db = ctx.db
  const c = await scoped(ctx, live(db, "contacts")).where("contacts.code", upper(code)).first("contacts.*")
  if (!c) return null
  const [links, crm, sales, estate, finance, hr, users] = await Promise.all([
    live(db, "contactLinks").where({ contactId: c.id }).select("linkableType", "linkableId", "role"),
    crmContext(),
    salesContext(),
    servicesContext(),
    financeContext(),
    hrContext(),
    usersContext(),
  ])
  const linked = (type) => links.filter((k) => k.linkableType === type).map((k) => k.linkableId)
  const see = { crm: crm.can("view"), sales: sales.can("view"), estate: estate.can("view"), finance: finance.can("view") && finance.has("collections"), hr: hr.can("view"), users: users.can("view") }

  // Leads (CRM): every linked lead counts; only the ones this person may open are listed
  const leadIds = linked("lead")
  const allLeads = leadIds.length ? await live(db, "leads").whereIn("id", leadIds).orderBy("createdAt", "desc") : []
  const visibleLeads = see.crm && allLeads.length ? new Set((await crmScoped(crm, live(db, "leads")).whereIn("id", leadIds).select("id")).map((r) => r.id)) : new Set()
  const leads = allLeads.filter((l) => visibleLeads.has(l.id))

  // Bookings (Operations): theirs as the buyer, or linked to them
  const allBookings = await db("bookings as b")
    .whereNull("b.deletedAt")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("units as u", "u.id", "b.unitId")
    .where((q) => q.where("b.contactId", c.id).orWhereIn("b.id", ids(linked("booking"))))
    .orderBy("b.bookedAt", "desc")
    .select("b.id", "b.code", "b.kind", "b.stage", "b.status", "b.agreedPrice", "b.netPrice", "b.bookedAt", "p.name as project", "u.number as unit")
  const visibleBookings =
    see.sales && allBookings.length
      ? new Set(
          (
            await salesScoped(sales, live(db, "bookings"))
              .whereIn(
                "id",
                allBookings.map((b) => b.id),
              )
              .select("id")
          ).map((r) => r.id),
        )
      : new Set()
  const bookings = allBookings.filter((b) => visibleBookings.has(b.id))

  // Estate Management requests made by them
  const allRequests = await live(db, "serviceRequests").where({ contactId: c.id }).orderBy("createdAt", "desc").select("id", "code", "type", "status", "subject", "createdAt", "closedAt")
  const visibleRequests =
    see.estate && allRequests.length
      ? new Set(
          (
            await servicesScoped(estate, live(db, "serviceRequests"))
              .whereIn(
                "id",
                allRequests.map((r) => r.id),
              )
              .select("id")
          ).map((r) => r.id),
        )
      : new Set()
  const requests = allRequests.filter((r) => visibleRequests.has(r.id))

  const employeeIds = linked("employee")
  const memberIds = linked("member")
  const dealerIds = linked("dealer")
  const [paymentRequests, dealers, employees, members, projects, leadPeople] = await Promise.all([
    see.finance ? live(db, "paymentRequests").where({ contactId: c.id }).orderBy("issuedOn", "desc").select("code", "status", "total", "issuedOn", "dueOn") : [],
    dealerIds.length ? live(db, "dealers").whereIn("id", dealerIds).select("code", "name", "isActive") : [],
    see.hr
      ? hrScoped(hr, live(db, "employees"))
          .where((q) => q.where("employees.contactId", c.id).orWhereIn("employees.id", ids(employeeIds)))
          .select("employees.code", "employees.name", "employees.designation", "employees.status")
      : [],
    memberIds.length ? live(db, "members").whereIn("id", memberIds).select("code", "userId") : [],
    leads.some((l) => l.projectId)
      ? db("projects")
          .whereIn("id", [...new Set(leads.map((l) => l.projectId).filter(Boolean))])
          .select("id", "code", "name")
      : [],
    peopleByIds(leads.map((l) => l.assignedTo)),
  ])
  const accounts = await peopleByIds(members.map((m) => m.userId))
  const projectOf = new Map(projects.map((p) => [p.id, { code: p.code, name: p.name }]))

  // One timeline: lead activities, booking activities and request events, newest first
  const LIMIT = 40
  const [leadActs, bookingActs, requestEvents] = await Promise.all([
    leads.length
      ? live(db, "leadActivities")
          .whereIn(
            "leadId",
            leads.map((l) => l.id),
          )
          .whereNot({ type: "system" })
          .where({ status: "done" })
          .orderBy("at", "desc")
          .limit(LIMIT)
          .select("id", "leadId", "type", "at", "doneAt", "outcome", "notes", "by")
      : [],
    bookings.length
      ? live(db, "bookingActivities")
          .whereIn(
            "bookingId",
            bookings.map((b) => b.id),
          )
          .orderBy("at", "desc")
          .limit(LIMIT)
          .select("id", "bookingId", "type", "event", "notes", "at", "by")
      : [],
    requests.length
      ? db("serviceRequestEvents")
          .whereIn(
            "requestId",
            requests.map((r) => r.id),
          )
          .orderBy("at", "desc")
          .limit(LIMIT)
          .select("id", "requestId", "kind", "text", "at", "by")
      : [],
  ])
  const leadCode = new Map(leads.map((l) => [l.id, l.code]))
  const bookingCode = new Map(bookings.map((b) => [b.id, b.code]))
  const requestCode = new Map(requests.map((r) => [r.id, r.code]))
  const timeline = [
    ...leadActs.map((a) => ({ key: `l${a.id}`, app: "crm", type: a.type, outcome: a.outcome, at: a.doneAt ?? a.at, text: a.notes ?? "", by: a.by, ref: leadCode.get(a.leadId) })),
    ...bookingActs.map((a) => ({ key: `b${a.id}`, app: "operations", type: a.type, event: a.event, at: a.at, text: a.notes ?? "", by: a.by, ref: bookingCode.get(a.bookingId) })),
    ...requestEvents.map((e) => ({ key: `r${e.id}`, app: "estate", type: e.kind, at: e.at, text: e.text ?? "", by: e.by, ref: requestCode.get(e.requestId) })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, LIMIT)
  const byPeople = await peopleByIds(timeline.map((t) => t.by))

  return {
    code: c.code,
    kind: c.kind,
    name: c.name,
    phone: c.phone,
    whatsapp: Boolean(c.whatsapp),
    email: c.email,
    cnic: ctx.cnic(c.cnic),
    city: c.city,
    overseas: Boolean(c.overseas),
    address: c.address,
    company: c.company,
    designation: c.designation,
    guardianRelation: c.guardianRelation,
    guardianName: c.guardianName,
    notes: c.notes ?? "",
    createdAt: c.createdAt,
    types: [...new Set(links.map((k) => k.role))],
    // Types set by hand (the rest come from their leads, bookings and other records)
    ownTypes: [...new Set(links.filter((k) => k.linkableType === "contact").map((k) => k.role))],
    linkedTypes: [...new Set(links.filter((k) => k.linkableType !== "contact").map((k) => k.role))],
    see,
    leads: leads.map((l) => ({
      code: l.code,
      status: l.status,
      priority: l.priority,
      source: l.source,
      archived: Boolean(l.archivedAt),
      agent: person(leadPeople.get(l.assignedTo)),
      createdAt: l.createdAt,
      interest: {
        project: projectOf.get(l.projectId) ?? null,
        unitType: l.unitType,
        sizeValue: l.sizeValue == null ? null : Number(l.sizeValue),
        sizeUnit: l.sizeUnit,
        budgetMin: l.budgetMin == null ? null : Number(l.budgetMin),
        budgetMax: l.budgetMax == null ? null : Number(l.budgetMax),
      },
    })),
    hiddenLeads: allLeads.length - leads.length,
    bookings: bookings.map((b) => ({ code: b.code, kind: b.kind, stage: b.stage, status: b.status, price: Number(b.netPrice ?? b.agreedPrice ?? 0), bookedAt: b.bookedAt, project: b.project, unit: b.unit })),
    hiddenBookings: allBookings.length - bookings.length,
    requests: requests.map(({ id, ...r }) => r),
    hiddenRequests: allRequests.length - requests.length,
    paymentRequests: paymentRequests.map((p) => ({ ...p, total: Number(p.total) })),
    dealers: dealers.map((d) => ({ code: d.code, name: d.name, active: Boolean(d.isActive), href: see.users && users.has("dealers") ? "/users/dealers" : null })),
    employees: employees.map((e) => ({ code: e.code, name: e.name, designation: e.designation, status: e.status })),
    logins: members.map((m) => ({ code: m.code, email: accounts.get(m.userId)?.email ?? null, href: see.users ? `/users/people?member=${m.code.toLowerCase()}` : null })),
    timeline: timeline.map(({ by, ...t }) => ({ ...t, by: byPeople.get(by)?.name ?? null })),
  }
}

// The kept contact and the one merged into it, side by side, with what moves (the Merge dialog)
//   → { keep, merge, moves: [{ label, count }], fills: [field label] } | null
export async function mergePreview(ctx, keepCode, mergeCode) {
  const db = ctx.db
  const [keep, merge] = await Promise.all([keepCode, mergeCode].map((code) => scoped(ctx, live(db, "contacts")).where("contacts.code", upper(code)).first("contacts.*")))
  if (!keep || !merge || keep.id === merge.id) return null
  const [links, bookings, requests, payments, employees] = await Promise.all([
    live(db, "contactLinks").where({ contactId: merge.id }).whereNot({ linkableType: "contact" }).groupBy("linkableType").select("linkableType").count({ n: "*" }),
    live(db, "bookings").where({ contactId: merge.id }).count({ n: "*" }).first(),
    live(db, "serviceRequests").where({ contactId: merge.id }).count({ n: "*" }).first(),
    live(db, "paymentRequests").where({ contactId: merge.id }).count({ n: "*" }).first(),
    live(db, "employees").where({ contactId: merge.id }).count({ n: "*" }).first(),
  ])
  const linkCount = Object.fromEntries(links.map((l) => [l.linkableType, Number(l.n)]))
  const moves = [
    { label: "Leads", count: linkCount.lead ?? 0 },
    { label: "Bookings", count: Math.max(Number(bookings.n), linkCount.booking ?? 0) },
    { label: "Estate Management requests", count: Number(requests.n) },
    { label: "Payment requests", count: Number(payments.n) },
    { label: "Dealer firms", count: linkCount.dealer ?? 0 },
    { label: "Employee records", count: Math.max(Number(employees.n), linkCount.employee ?? 0) },
    { label: "Workspace logins", count: linkCount.member ?? 0 },
  ].filter((m) => m.count > 0)
  const fills = Object.entries(MERGE_FIELDS)
    .filter(([k]) => !keep[k] && merge[k])
    .map(([, label]) => label)
  const side = (x) => ({ code: x.code, name: x.name, phone: x.phone, email: x.email, cnic: ctx.cnic(x.cnic), city: x.city, createdAt: x.createdAt })
  return { keep: side(keep), merge: side(merge), moves, fills }
}

// Fields a merge fills on the kept contact when it has none
export const MERGE_FIELDS = { phone: "Mobile", email: "Email", cnic: "CNIC", city: "City", address: "Address", company: "Company", designation: "Designation", guardianName: "Father's / husband's name", notes: "Notes" }
