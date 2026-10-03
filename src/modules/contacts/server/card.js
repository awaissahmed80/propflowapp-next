"use server"

import { live } from "@/server/db/records"
import { peopleByIds } from "@/modules/users/server/queries"
import { crmContext, scoped as crmScoped } from "@/modules/crm/server/context"
import { salesContext, scoped as salesScoped } from "@/modules/operations/server/context"
import { contactOf } from "./links"

// The contact card: one person, the same everywhere they appear (a lead's header, a booking's
// buyer…). Who they are, how to reach them, how much contact there's been, and what they have
// with the workspace: leads (CRM) and bookings (Sales). Each list shows only what this person's
// role may see in that app; the rest is counted, not shown.
//   from: { contact: "CT-00001" } | { lead: "LD-00012" } | { booking: "BK-2026-000003" }
//   → { card } | { error }
export async function loadContactCard(from = {}) {
  const [crm, sales] = await Promise.all([crmContext(), salesContext()])
  const db = crm.db
  const canCrm = crm.can("view")
  const canSales = sales.can("view")
  const upper = (v) => String(v ?? "").toUpperCase()

  // Which contact, reached through a record this person may see
  let contactId = null
  let current = null
  if (from.lead) {
    if (!canCrm) return { error: "Your role can't see leads." }
    const lead = await crmScoped(crm, live(db, "leads"))
      .where({ code: upper(from.lead) })
      .first("id", "code")
    if (!lead) return { error: "That lead was removed or isn't yours to see." }
    contactId = await contactOf(db, "lead", lead.id)
    current = { lead: lead.code }
  } else if (from.booking) {
    if (!canSales) return { error: "Your role can't see bookings." }
    const b = await salesScoped(sales, live(db, "bookings"))
      .where({ code: upper(from.booking) })
      .first("id", "code", "contactId")
    if (!b) return { error: "That booking was removed or isn't yours to see." }
    contactId = b.contactId ?? (await contactOf(db, "booking", b.id))
    current = { booking: b.code }
  } else if (from.contact) {
    if (!canCrm && !canSales) return { error: "Your role can't see contacts." }
    contactId =
      (
        await live(db, "contacts")
          .where({ code: upper(from.contact) })
          .first("id")
      )?.id ?? null
  }
  if (!contactId) return { error: "No contact is linked yet." }
  const c = await live(db, "contacts").where({ id: contactId }).first("id", "code", "name", "phone", "whatsapp", "email", "city", "overseas", "createdAt")
  if (!c) return { error: "That contact was removed." }

  // Their leads: linked to the contact, or older ones with the same mobile
  const linkedLeads = (await db("contactLinks").where({ contactId, linkableType: "lead" }).whereNull("deletedAt").select("linkableId")).map((r) => r.linkableId)
  const allLeads = await live(db, "leads")
    .where((q) => {
      q.whereIn("id", linkedLeads.length ? linkedLeads : [0])
      if (c.phone) q.orWhere({ phone: c.phone })
    })
    .orderBy("createdAt", "desc")
    .select("id", "code", "status", "source", "projectId", "assignedTo", "createdAt")
  const seenLeads = canCrm
    ? new Set(
        (
          await crmScoped(crm, live(db, "leads"))
            .whereIn("id", allLeads.length ? allLeads.map((l) => l.id) : [0])
            .select("id")
        ).map((r) => r.id),
      )
    : new Set()
  const leads = allLeads.filter((l) => seenLeads.has(l.id))

  const allBookings = await db("bookings as b")
    .whereNull("b.deletedAt")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("units as u", "u.id", "b.unitId")
    .where("b.contactId", contactId)
    .orderBy("b.bookedAt", "desc")
    .select("b.id", "b.code", "b.stage", "b.status", "b.netPrice", "b.bookedAt", "p.name as project", "u.number as unit")
  const seenBookings = canSales
    ? new Set(
        (
          await salesScoped(sales, live(db, "bookings"))
            .whereIn("id", allBookings.length ? allBookings.map((b) => b.id) : [0])
            .select("id")
        ).map((r) => r.id),
      )
    : new Set()
  const bookings = allBookings.filter((b) => seenBookings.has(b.id))

  const leadIds = leads.map((l) => l.id)
  const [projects, people, activity, dealer] = await Promise.all([
    leads.some((l) => l.projectId)
      ? db("projects")
          .whereIn("id", [...new Set(leads.map((l) => l.projectId).filter(Boolean))])
          .select("id", "name")
      : [],
    peopleByIds(leads.map((l) => l.assignedTo)),
    leadIds.length ? live(db, "leadActivities").whereIn("leadId", leadIds).whereNot({ type: "system" }).select("type", "status", "at", "doneAt") : [],
    c.phone ? live(db, "dealers").where({ phone: c.phone }).first("name", "isActive") : null,
  ])
  const done = activity.filter((a) => a.status === "done")
  const count = (type) => done.filter((a) => a.type === type).length
  const last = done.reduce((t, a) => Math.max(t, new Date(a.doneAt ?? a.at).getTime()), 0)

  return {
    card: {
      code: c.code,
      name: c.name,
      phone: c.phone,
      whatsapp: Boolean(c.whatsapp),
      email: c.email,
      city: c.city,
      overseas: Boolean(c.overseas),
      since: c.createdAt,
      dealer: dealer ? { name: dealer.name, active: Boolean(dealer.isActive) } : null,
      touches: {
        calls: count("call"),
        whatsapp: count("whatsapp"),
        meetings: count("meeting"),
        visits: count("site-visit"),
        lastAt: last ? new Date(last) : null,
      },
      leads: leads.map((l) => ({
        code: l.code,
        current: l.code === current?.lead,
        status: l.status,
        source: l.source,
        project: projects.find((p) => p.id === l.projectId)?.name ?? null,
        agent: people.get(l.assignedTo)?.name ?? null,
        createdAt: l.createdAt,
      })),
      hiddenLeads: canCrm ? allLeads.length - leads.length : 0,
      bookings: bookings.map((b) => ({ code: b.code, current: b.code === current?.booking, stage: b.stage, status: b.status, net: Number(b.netPrice ?? 0), project: b.project, unit: b.unit, bookedAt: b.bookedAt })),
      hiddenBookings: canSales ? allBookings.length - bookings.length : 0,
    },
  }
}
