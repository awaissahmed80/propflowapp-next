import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { getLookups } from "@/modules/lookups/server"
import { ensureContact, linkContact } from "@/modules/contacts/server/links"
import { assignableAgents } from "@/modules/crm/server/queries"
import { candidates, listRules, nextAfter, pickByRules } from "@/modules/crm/server/assignment"
import { parseBudget } from "@/modules/campaigns/constants"
import * as V from "../values"

// Leads import. Each row becomes a lead like one added by hand (contact matched by mobile or
// linked, "Imported" on its timeline), assigned as the importer chose:
//   assign: { mode: "agent", agentId } | { mode: "rule", ruleId } (that rule's people in turn)
//         | { mode: "rules" } (CRM assignment rules, then round robin) | { mode: "round-robin" }
//         | { mode: "none" }; an "Agent" column, when mapped, wins for its rows.
// A row matches an existing lead with the same Old ID, or an open lead on the same mobile.
// "update" fills the lead's empty fields and adds the file's notes.

const CLOSED = ["booked", "lost"]
const AREA = { marla: "marla", marlas: "marla", kanal: "kanal", kanals: "kanal", sqft: "sqft", sqyd: "sqyd", acre: "acre", acres: "acre" }

// "10 Marla" · "1 kanal" · "1,600 sq ft" · "12" (marla) → { sizeValue, sizeUnit }
function parseSize(v) {
  if (V.isEmpty(v)) return null
  const m = String(v)
    .toLowerCase()
    .replace(/,/g, "")
    .match(/(\d+(?:\.\d+)?)\s*(marlas?|kanals?|sq\.?\s?ft|sqft|sq\.?\s?yd|sqyd|acres?)?/)
  if (!m) return { error: `“${v}” isn't a size (e.g. 10 Marla)` }
  return { value: { sizeValue: Number(m[1]), sizeUnit: AREA[(m[2] ?? "marla").replace(/[.\s]/g, "")] ?? "marla" } }
}

export const leadsImporter = {
  key: "leads",
  async prepare(ctx, options = {}) {
    const [lists, projects, agents, rules] = await Promise.all([
      getLookups(ctx.db, ["lead-source", "lead-status", "lead-priority", "unit-type", "activity-type"]),
      live(ctx.db, "projects").select("id", "code", "name"),
      assignableAgents(ctx),
      listRules(ctx.db),
    ])
    const assign = options.assign ?? { mode: "rules" }
    const rule = assign.mode === "rule" ? rules.find((r) => r.id === Number(assign.ruleId)) : null
    return {
      ctx,
      lists,
      projects,
      agents,
      assign,
      rule,
      ruleCandidates: rule ? candidates(rule, agents) : [],
      last: rule?.lastAssignedId ?? null,
      seen: new Set(), // mobiles and old ids earlier in this file
      fileName: options.fileName ?? null,
    }
  },

  async check(prep, r) {
    const errors = []
    const warnings = []
    const take = (res, field, { warn = false } = {}) => {
      if (!res) return null
      if (res.error) {
        ;(warn ? warnings : errors).push(`${field}: ${res.error}${warn ? " (left empty)" : ""}`)
        return null
      }
      return res.value
    }
    const name = take(V.text(r.name, 120), "Name")
    const phone = take(V.phone(r.phone), "Mobile")
    if (!name) errors.push("Name is empty")
    if (!phone && !errors.some((e) => e.startsWith("Mobile"))) errors.push("Mobile is empty")
    const size = take(parseSize(r.size), "Size", { warn: true })
    const budget = V.isEmpty(r.budget) ? null : parseBudget(r.budget)
    if (budget && budget.min == null && budget.max == null) warnings.push(`Budget: “${r.budget}” wasn't understood (left empty)`)
    let projectId = null
    if (!V.isEmpty(r.project)) {
      const key = String(r.project).trim().toLowerCase()
      projectId = prep.projects.find((p) => p.code.toLowerCase() === key || p.name.toLowerCase() === key)?.id ?? null
      if (!projectId) warnings.push(`Project: “${r.project}” isn't one of your projects (left empty)`)
    }
    let assignedTo
    if (!V.isEmpty(r.assignedTo)) {
      const key = String(r.assignedTo).trim().toLowerCase()
      assignedTo = prep.agents.find((a) => a.name.toLowerCase() === key || a.email?.toLowerCase() === key)?.id
      if (!assignedTo) warnings.push(`Agent: “${r.assignedTo}” isn't an active agent (assigned as chosen instead)`)
    }
    const status = take(V.lookup(prep.lists["lead-status"], r.status, "lead status"), "Status", { warn: true })
    const next = take(V.datetime(r.nextFollowUp), "Next follow-up", { warn: true })
    const data = {
      name,
      phone,
      email: take(V.email(r.email), "Email", { warn: true }),
      city: take(V.text(r.city, 80), "City"),
      source: take(V.lookup(prep.lists["lead-source"], r.source, "lead source"), "Source", { warn: true }),
      status: status ?? "new",
      priority: take(V.lookup(prep.lists["lead-priority"], r.priority, "temperature"), "Temperature", { warn: true }),
      projectId,
      unitType: take(V.lookup(prep.lists["unit-type"], r.unitType, "property type"), "Property type", { warn: true }),
      sizeValue: size?.sizeValue ?? null,
      sizeUnit: size?.sizeUnit ?? null,
      budgetMin: budget?.min ?? null,
      budgetMax: budget?.max ?? null,
      paymentPlan: V.isEmpty(r.paymentPlan) ? null : /cash|full|lump/i.test(r.paymentPlan) ? "cash" : "installments",
      notes: take(V.text(r.notes, 4000), "Notes"),
      createdAt: take(V.datetime(r.createdAt), "Lead date", { warn: true }),
      importRef: take(V.text(r.oldId, 60), "Old ID"),
      assignedTo,
      followUp: next
        ? { at: next, type: take(V.lookup(prep.lists["activity-type"], r.followUpType, "activity type"), "Follow-up type", { warn: true }) ?? "call", notes: take(V.text(r.followUpNote, 500), "Follow-up note") }
        : null,
    }
    // Twice in the same file
    if (phone && prep.seen.has(`p:${phone}`) && !CLOSED.includes(data.status)) warnings.push("The same mobile is on an earlier row")
    return { data, errors, warnings, label: [name, phone].filter(Boolean).join(" · ") || "(empty row)" }
  },

  async match(prep, d) {
    const { db } = prep.ctx
    if (d.importRef) {
      const byRef = await live(db, "leads").where({ importRef: d.importRef }).first("id", "code")
      if (byRef) return byRef
    }
    if (CLOSED.includes(d.status)) return null
    return live(db, "leads").where({ phone: d.phone }).whereNotIn("status", CLOSED).whereNull("archivedAt").first("id", "code")
  },

  remember(prep, d) {
    if (d?.phone) prep.seen.add(`p:${d.phone}`)
  },

  // Who gets this lead
  async assignee(prep, row) {
    if (row.assignedTo) return row.assignedTo
    const a = prep.assign
    if (a.mode === "agent") return prep.agents.some((x) => x.id === Number(a.agentId)) ? Number(a.agentId) : null
    if (a.mode === "none") return null
    if (a.mode === "rule") {
      const next = nextAfter(prep.ruleCandidates, prep.last, null)
      prep.last = next ?? prep.last
      return next
    }
    if (a.mode === "rules") {
      const hit = await pickByRules(prep.ctx, row)
      if (hit) return hit.userId
    }
    // Round robin among every agent, in turn from this import's own counter
    const ids = prep.agents.map((x) => x.id).sort((x, y) => x - y)
    const next = nextAfter(ids, prep.rr ?? null, null)
    prep.rr = next
    return next
  },

  async create(prep, d) {
    const { ctx } = prep
    const uid = ctx.user.id
    const overseas = d.phone ? !d.phone.startsWith("+92") : false
    const row = {
      name: d.name,
      phone: d.phone,
      whatsapp: true,
      email: d.email,
      city: d.city,
      overseas,
      source: d.source,
      projectId: d.projectId,
      unitType: d.unitType,
      sizeValue: d.sizeValue,
      sizeUnit: d.sizeUnit,
      budgetMin: d.budgetMin,
      budgetMax: d.budgetMax,
      paymentPlan: d.paymentPlan,
    }
    const assignedTo = await this.assignee(prep, row)
    const at = d.createdAt && d.createdAt < new Date() ? d.createdAt : new Date()
    await ctx.db.transaction(async (trx) => {
      const code = await nextCode(trx, "lead", {}, at)
      const team = assignedTo ? ((await live(trx, "members").where({ userId: assignedTo }).first("teamId"))?.teamId ?? null) : null
      const [id] = await trx("leads").insert({
        ...row,
        code,
        status: d.status,
        ...(d.priority ? { priority: d.priority } : {}),
        notes: d.notes,
        assignedTo,
        teamId: team,
        importRef: d.importRef,
        closedAt: CLOSED.includes(d.status) ? at : null,
        createdAt: at,
        createdBy: uid,
      })
      await linkContact(trx, await ensureContact(trx, row, uid), { type: "lead", id, role: "lead" }, uid)
      await trx("leadActivities").insert({
        leadId: id,
        type: "system",
        status: "done",
        at: new Date(),
        doneAt: new Date(),
        by: uid,
        notes: `Imported${prep.fileName ? ` from ${prep.fileName}` : ""}${d.importRef ? ` (old ID ${d.importRef})` : ""}`,
        createdBy: uid,
      })
      if (d.followUp && !CLOSED.includes(d.status))
        await trx("leadActivities").insert({
          leadId: id,
          type: d.followUp.type,
          status: d.followUp.at < new Date() ? "missed" : "planned",
          at: d.followUp.at,
          by: assignedTo ?? uid,
          notes: d.followUp.notes,
          createdBy: uid,
        })
    })
  },

  // Fill the lead's empty fields; the file's notes are added to its notes
  async update(prep, existing, d) {
    const { db } = prep.ctx
    const lead = await db("leads").where({ id: existing.id }).first()
    const patch = {}
    for (const k of ["email", "city", "source", "projectId", "unitType", "sizeValue", "sizeUnit", "budgetMin", "budgetMax", "paymentPlan", "importRef"])
      if ((lead[k] == null || lead[k] === "") && d[k] != null) patch[k] = d[k]
    if (d.notes && !(lead.notes ?? "").includes(d.notes)) patch.notes = [lead.notes, d.notes].filter(Boolean).join("\n").slice(0, 4000)
    if (!Object.keys(patch).length) return false
    await db("leads")
      .where({ id: existing.id })
      .update({ ...patch, updatedAt: new Date(), updatedBy: prep.ctx.user.id })
    return true
  },

  async finish(prep) {
    // A rule's rotation carries on from where the import stopped
    if (prep.rule && prep.last) await prep.ctx.db("leadAssignmentRules").where({ id: prep.rule.id }).update({ lastAssignedId: prep.last })
  },
}
