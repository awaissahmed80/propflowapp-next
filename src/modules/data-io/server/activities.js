import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { assignableAgents } from "@/modules/crm/server/queries"
import { scoped } from "@/modules/crm/server/context"
import * as V from "../values"

// Lead activities import: history and follow-ups for leads already in PropFlow (import the leads
// first). Each row finds its lead by Old ID (import_ref), lead code or mobile, among the leads this
// person can see. Done rows are history; planned ones are follow-ups (missed when already past).
// "By" names a user; otherwise the lead's agent. An identical activity (same lead, type, time and
// notes) is already there → it matches (skipped, or nothing to update).

const STATUS = { done: "done", completed: "done", complete: "done", yes: "done", pending: "planned", planned: "planned", due: "planned", scheduled: "planned", open: "planned", missed: "missed" }

export const activitiesImporter = {
  key: "activities",
  async prepare(ctx) {
    const [lists, agents] = await Promise.all([getLookups(ctx.db, ["activity-type", "activity-outcome"]), assignableAgents(ctx)])
    return { ctx, lists, agents, leads: new Map() }
  },

  // The lead a row is about (cached per reference)
  async lead(prep, ref) {
    const key = String(ref).trim()
    if (prep.leads.has(key)) return prep.leads.get(key)
    const q = () => scoped(prep.ctx, live(prep.ctx.db, "leads")).select("leads.id", "leads.code", "leads.assignedTo")
    let hit = await q().where("leads.importRef", key).first()
    if (!hit && /^ld-\d+$/i.test(key)) hit = await q().where("leads.code", key.toUpperCase()).first()
    if (!hit) {
      const p = V.phone(key)
      if (p?.value) hit = await q().where("leads.phone", p.value).orderByRaw("leads.status IN ('booked','lost')").orderBy("leads.id", "desc").first()
    }
    prep.leads.set(key, hit ?? null)
    return hit ?? null
  },

  async check(prep, r) {
    const errors = []
    const warnings = []
    const take = (res, field, warn = false) => {
      if (!res) return null
      if (res.error) {
        ;(warn ? warnings : errors).push(`${field}: ${res.error}${warn ? " (left empty)" : ""}`)
        return null
      }
      return res.value
    }
    const lead = V.isEmpty(r.lead) ? null : await this.lead(prep, r.lead)
    if (V.isEmpty(r.lead)) errors.push("Lead is empty")
    else if (!lead) errors.push(`Lead: no lead “${r.lead}” (import the leads first, or it's not yours to see)`)
    const type = take(V.lookup(prep.lists["activity-type"], r.type, "activity type"), "Type")
    if (V.isEmpty(r.type)) errors.push("Type is empty")
    const at = take(V.datetime(r.at), "Date & time")
    if (!at && !errors.some((e) => e.startsWith("Date"))) errors.push("Date & time is empty")
    let status =
      STATUS[
        String(r.status ?? "")
          .trim()
          .toLowerCase()
      ] ?? null
    if (!status) status = at && at > new Date() ? "planned" : "done"
    if (status === "planned" && at && at < new Date()) status = "missed"
    let by = null
    if (!V.isEmpty(r.by)) {
      const key = String(r.by).trim().toLowerCase()
      by = prep.agents.find((a) => a.name.toLowerCase() === key || a.email?.toLowerCase() === key)?.id ?? null
      if (!by) warnings.push(`By: “${r.by}” isn't a user here (the lead's agent instead)`)
    }
    const data = {
      leadId: lead?.id,
      type,
      at,
      status,
      outcome: take(V.lookup(prep.lists["activity-outcome"], r.outcome, "outcome"), "Outcome", true),
      notes: take(V.text(r.notes, 4000), "Notes"),
      by: by ?? lead?.assignedTo ?? prep.ctx.user.id,
    }
    return { data, errors, warnings, label: [lead?.code ?? r.lead, r.type, V.isEmpty(r.at) ? null : String(r.at)].filter(Boolean).join(" · ") }
  },

  async match(prep, d) {
    return prep.ctx
      .db("leadActivities")
      .where({ leadId: d.leadId, type: d.type, at: d.at })
      .where((q) => (d.notes ? q.where({ notes: d.notes }) : q.whereNull("notes")))
      .first("id")
  },

  async create(prep, d) {
    const uid = prep.ctx.user.id
    await prep.ctx.db("leadActivities").insert({ leadId: d.leadId, type: d.type, status: d.status, at: d.at, doneAt: d.status === "done" ? d.at : null, by: d.by, outcome: d.outcome, notes: d.notes, createdBy: uid })
    // The lead's first and last contact follow its done activities
    if (d.status === "done") {
      const leads = () => prep.ctx.db("leads").where({ id: d.leadId })
      await leads()
        .where((q) => q.whereNull("lastContactAt").orWhere("lastContactAt", "<", d.at))
        .update({ lastContactAt: d.at })
      await leads()
        .where((q) => q.whereNull("firstContactAt").orWhere("firstContactAt", ">", d.at))
        .update({ firstContactAt: d.at })
    }
  },

  async update() {
    return false // an identical activity is already there
  },
}
