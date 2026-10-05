import "server-only"
import { assetUrl } from "@/server/assets"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { listMembers, peopleByIds } from "@/modules/users/server/queries"
import { contactsContext, scoped as contactsScoped } from "@/modules/contacts/server/context"
import { scoped } from "./context"
import { priceIndex, scoreLead, scoringActivities } from "./scoring"
import { crmSettings } from "./settings"
import { canTagLead } from "./tagging"

// Reads for CRM. Leads only ever come through scoped(), so people see what their role allows.

export const CRM_LISTS = [
  "lead-status",
  "lead-priority",
  "lead-source",
  "loss-reason",
  "activity-type",
  "activity-outcome",
  "follow-up",
  "quick-reply",
  "unit-type",
  "area-unit",
  "city",
  "booking-stage",
  "booking-status",
  "contact-type",
]
export const crmLists = (ctx) => getLookups(ctx.db, CRM_LISTS)

const person = (p) => (p ? { id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null } : null)

// What scoring needs, once per request (null when the workspace has scoring switched off)
async function scoringKit(ctx) {
  const rules = await crmSettings(ctx.db)
  if (!rules.scoring) return null
  const [index, lists] = await Promise.all([priceIndex(ctx.db), getLookups(ctx.db, ["activity-type", "activity-outcome"])])
  return { rules, index, lists }
}

function shapeLead(l, { people, projects, next, score = null, tags = [] }) {
  return {
    code: l.code,
    name: l.name,
    phone: l.phone,
    whatsapp: Boolean(l.whatsapp),
    email: l.email,
    city: l.city,
    overseas: Boolean(l.overseas),
    source: l.source,
    status: l.status,
    priority: l.priority,
    lossReason: l.lossReason,
    interest: {
      project: projects.get(l.projectId) ?? null,
      unitType: l.unitType,
      sizeValue: l.sizeValue == null ? null : Number(l.sizeValue),
      sizeUnit: l.sizeUnit,
      budgetMin: l.budgetMin == null ? null : Number(l.budgetMin),
      budgetMax: l.budgetMax == null ? null : Number(l.budgetMax),
      paymentPlan: l.paymentPlan,
      purpose: l.purpose,
    },
    notes: l.notes ?? "",
    agent: person(people.get(l.assignedTo)),
    next: next ? { at: next.at, type: next.type } : null,
    createdAt: l.createdAt,
    firstContactAt: l.firstContactAt ?? null,
    lastContactAt: l.lastContactAt,
    closedAt: l.closedAt,
    archivedAt: l.archivedAt ?? null,
    // Tagged on it besides the agent (they see it too)
    tags: tags.map((id) => person(people.get(id))).filter(Boolean),
    archivedBy: l.archivedAt ? person(people.get(l.archivedBy)) : null,
    score,
  }
}

async function projectsById(ctx) {
  const rows = await live(ctx.db, "projects").select("id", "code", "name", "color")
  return new Map(rows.map((p) => [p.id, { code: p.code, name: p.name, color: p.color }]))
}

// Every lead this person may see, newest first, with its next planned follow-up
export async function listLeads(ctx) {
  const leads = await scoped(ctx, live(ctx.db, "leads")).orderBy("createdAt", "desc").limit(5000)
  const ids = leads.map((l) => l.id)
  const allTags = ids.length ? await live(ctx.db, "leadTags").whereIn("leadId", ids).select("leadId", "userId") : []
  const [people, projects, planned, kit] = await Promise.all([
    peopleByIds([...leads.flatMap((l) => [l.assignedTo, l.archivedBy]), ...allTags.map((t) => t.userId)]),
    projectsById(ctx),
    ids.length ? live(ctx.db, "leadActivities").whereIn("leadId", ids).where({ status: "planned" }).orderBy("at").select("leadId", "at", "type") : [],
    scoringKit(ctx),
  ])
  const next = new Map()
  for (const a of planned) if (!next.has(a.leadId)) next.set(a.leadId, a)
  // The list only needs the number and grade
  const acts = kit ? await scoringActivities(ctx.db, ids, kit.rules.engagementDays) : null
  const brief = (l) => {
    if (!kit) return null
    const s = scoreLead(l, acts.get(l.id), kit)
    return { value: s.value, grade: s.grade, label: s.label }
  }
  const tagsOf = new Map()
  for (const t of allTags) tagsOf.set(t.leadId, [...(tagsOf.get(t.leadId) ?? []), t.userId])
  return leads.map((l) => shapeLead(l, { people, projects, next: next.get(l.id), score: brief(l), tags: tagsOf.get(l.id) }))
}

// One lead (if this person may see it) with its activities, newest first; planned ones apart
export async function getLead(ctx, code) {
  const l = await scoped(ctx, live(ctx.db, "leads"))
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
  if (!l) return null
  const [activities, projects, kit] = await Promise.all([live(ctx.db, "leadActivities").where({ leadId: l.id }).orderBy("at", "desc").orderBy("id", "desc"), projectsById(ctx), scoringKit(ctx)])
  const score = kit ? scoreLead(l, (await scoringActivities(ctx.db, [l.id], kit.rules.engagementDays)).get(l.id), kit) : null
  const tags = (await live(ctx.db, "leadTags").where({ leadId: l.id }).orderBy("id").select("userId")).map((t) => t.userId)
  const people = await peopleByIds([l.assignedTo, l.archivedBy, l.createdBy, ...tags, ...activities.map((a) => a.by)])
  // Voice notes recorded with activities (assets, served by /api/workspace/files/[code])
  const voices = activities.length
    ? await live(ctx.db, "assets")
        .where({ ownerType: "lead-activity", collection: "voice" })
        .whereIn(
          "ownerId",
          activities.map((a) => a.id),
        )
        .select("ownerId", "code", "mime")
    : []
  // The booking made when it was closed as won (Close deal), if any
  const booking = await ctx
    .db("bookings as b")
    .whereNull("b.deletedAt")
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .where({ "b.leadId": l.id })
    .whereNotIn("b.status", ["cancelled", "refunded"])
    .orderBy("b.id", "desc")
    .first(
      "b.id",
      "b.code",
      "b.kind",
      "b.stage",
      "b.status",
      "b.agreedPrice",
      "b.tokenAmount",
      "b.tokenDueDate",
      "b.schedule",
      "b.installments",
      "b.firstDueDate",
      "b.bookedAt",
      "u.number as unitNumber",
      "u.code as unitCode",
      "p.name as projectName",
    )
  const installments = booking ? await ctx.db("bookingInstallments").where({ bookingId: booking.id }).orderBy("number").select("number", "dueDate", "amount", "status") : []
  const voiceOf = new Map(voices.map((v) => [v.ownerId, { url: assetUrl(v.code), mime: v.mime }]))
  const planned = activities.filter((a) => a.status === "planned").sort((a, b) => a.at - b.at)
  const shapeActivity = (a) => ({
    id: a.id,
    type: a.type,
    status: a.status,
    at: a.at,
    doneAt: a.doneAt,
    outcome: a.outcome,
    notes: a.notes ?? "",
    by: person(people.get(a.by)),
    project: a.projectId ? (projects.get(a.projectId) ?? null) : null,
    voice: voiceOf.get(a.id) ?? null,
  })
  return {
    ...shapeLead(l, { people, projects, next: planned[0], score, tags }),
    createdBy: person(people.get(l.createdBy)),
    canTag: canTagLead(ctx, l),
    planned: planned.map(shapeActivity),
    // When it actually happened (a completed follow-up keeps its planned time in `at`), newest
    // first, whatever the type; ties keep the order they were recorded in
    booking: booking
      ? {
          code: booking.code,
          kind: booking.kind,
          stage: booking.stage,
          status: booking.status,
          agreedPrice: Number(booking.agreedPrice),
          tokenAmount: booking.tokenAmount == null ? null : Number(booking.tokenAmount),
          tokenDueDate: booking.tokenDueDate ?? null,
          schedule: booking.schedule,
          installments: booking.installments,
          firstDueDate: booking.firstDueDate,
          bookedAt: booking.bookedAt,
          unit: { code: booking.unitCode, number: booking.unitNumber },
          project: booking.projectName,
          dues: installments.map((d) => ({ number: d.number, dueDate: d.dueDate, amount: Number(d.amount), status: d.status })),
        }
      : null,
    history: activities
      .filter((a) => a.status !== "planned")
      .sort((x, y) => new Date(y.doneAt ?? y.at) - new Date(x.doneAt ?? x.at) || y.id - x.id)
      .map(shapeActivity),
  }
}

// People leads can be given to: active workspace members (not dealer logins)
export async function assignableAgents(ctx) {
  const members = await listMembers(ctx)
  return members
    .filter((m) => m.status === "active" && !m.dealerId)
    .map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl ?? null, teamId: m.teamId ?? null, team: m.team?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Projects a lead can be interested in
export const crmProjects = (ctx) => live(ctx.db, "projects").orderBy("name").select("code", "name", "color")

// Follow-ups and site visits are planned activities on leads (the Follow-ups and Site visits
// pages are views of them). Only open leads in the pipeline (not archived) this person may see.
//   kind: "follow-ups" (calls, messages…: everything but visits and meetings) | "site-visits" |
//   "meetings". Done and missed ones from the last 30 days come too (shown as Done; the show-up
//   rate), only those that were planned first, not activities logged as they happened.
const BY_DAY = { "site-visits": "site-visit", meetings: "meeting" }
export async function plannedWork(ctx, kind) {
  const type = BY_DAY[kind]
  const since = new Date(Date.now() - 30 * 86_400_000)
  const rows = await scoped(ctx, ctx.db("leadActivities as a").join("leads as l", "l.id", "a.leadId"), "l")
    .whereNull("a.deletedAt")
    .whereNull("l.deletedAt")
    .whereNull("l.archivedAt")
    .where((q) => (type ? q.where("a.type", type) : q.whereNotIn("a.type", Object.values(BY_DAY))))
    .whereNot("a.type", "system")
    .where((q) =>
      q
        .where((p) => p.where("a.status", "planned").whereNotIn("l.status", ["booked", "lost"]))
        // Planned earlier, done later (one logged on the spot is created as it's done)
        .orWhere((p) => p.whereIn("a.status", ["done", "missed"]).where("a.doneAt", ">=", since).whereRaw("TIMESTAMPDIFF(SECOND, a.created_at, a.done_at) > 60")),
    )
    .orderBy("a.at")
    .limit(2000)
    .select(
      "a.id",
      "a.type",
      "a.status",
      "a.at",
      "a.doneAt",
      "a.outcome",
      "a.notes",
      "a.by",
      "a.projectId",
      "l.code",
      "l.name",
      "l.phone",
      "l.whatsapp",
      "l.priority",
      "l.projectId as leadProjectId",
      "l.unitType",
      "l.sizeValue",
      "l.sizeUnit",
    )
  const [people, projects] = await Promise.all([peopleByIds(rows.map((r) => r.by)), projectsById(ctx)])
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    at: r.at,
    doneAt: r.doneAt,
    outcome: r.outcome,
    notes: r.notes ?? "",
    by: person(people.get(r.by)),
    project: projects.get(r.projectId ?? r.leadProjectId) ?? null,
    lead: {
      code: r.code,
      name: r.name,
      phone: r.phone,
      whatsapp: Boolean(r.whatsapp),
      priority: r.priority,
      interest: { project: projects.get(r.leadProjectId) ?? null, unitType: r.unitType, sizeValue: r.sizeValue == null ? null : Number(r.sizeValue), sizeUnit: r.sizeUnit },
    },
  }))
}

// CRM › Contacts: the contacts (central contacts table) behind the leads this person may see,
// with their enquiries. The Contacts app is the full directory (customers, owners, dealers…).
export async function leadContacts(ctx) {
  const rows = await scoped(ctx, ctx.db("leads as l").whereNull("l.deletedAt"), "l")
    .join("contactLinks as k", (j) => j.on("k.linkableId", "l.id").andOnVal("k.linkableType", "lead"))
    .whereNull("k.deletedAt")
    .join("contacts as c", "c.id", "k.contactId")
    .whereNull("c.deletedAt")
    .orderBy("l.createdAt", "desc")
    .limit(10000)
    .select(
      "c.id as contactId",
      "c.code as contactCode",
      "c.name as contactName",
      "c.phone",
      "c.whatsapp",
      "c.email",
      "c.city",
      "c.overseas",
      "l.code",
      "l.status",
      "l.projectId",
      "l.assignedTo",
      "l.createdAt",
      "l.lastContactAt",
      "l.archivedAt",
    )
  const [people, projects, roles] = await Promise.all([
    peopleByIds(rows.map((r) => r.assignedTo)),
    projectsById(ctx),
    contactRoles(
      ctx,
      rows.map((r) => r.contactId),
    ),
  ])
  const byContact = new Map()
  for (const r of rows) {
    // Newest enquiry first, so the first one seen gives the latest status and agent
    const c = byContact.get(r.contactId) ?? {
      code: r.contactCode,
      name: r.contactName,
      phone: r.phone,
      whatsapp: Boolean(r.whatsapp),
      email: r.email,
      city: r.city,
      overseas: Boolean(r.overseas),
      types: roles.get(r.contactId) ?? ["lead"],
      latest: { code: r.code, status: r.status, archived: Boolean(r.archivedAt) },
      agent: person(people.get(r.assignedTo)),
      leads: 0,
      open: 0,
      booked: 0,
      projects: [],
      firstAt: r.createdAt,
      lastContactAt: null,
    }
    c.leads++
    if (!r.archivedAt && !["booked", "lost"].includes(r.status)) c.open++
    if (r.status === "booked") c.booked++
    const p = projects.get(r.projectId)?.name
    if (p && !c.projects.includes(p)) c.projects.push(p)
    if (new Date(r.createdAt) < new Date(c.firstAt)) c.firstAt = r.createdAt
    if (r.lastContactAt && (!c.lastContactAt || new Date(r.lastContactAt) > new Date(c.lastContactAt))) c.lastContactAt = r.lastContactAt
    byContact.set(r.contactId, c)
  }
  return [...byContact.values()]
}

// What each contact is to the business (contact-type values from their links), by contact id
async function contactRoles(ctx, ids) {
  const unique = [...new Set(ids)]
  const rows = unique.length ? await ctx.db("contactLinks").whereIn("contactId", unique).whereNull("deletedAt").distinct("contactId", "role") : []
  const out = new Map()
  for (const r of rows) out.set(r.contactId, [...(out.get(r.contactId) ?? []), r.role])
  return out
}

// One contact (by code, e.g. CT-00012) as CRM sees it: who they are, what they are to the
// business, their enquiries, bookings, how much contact there's been and the latest activity.
// null unless at least one of their leads is this person's to see.
export async function contactDetail(ctx, code) {
  const contact = await live(ctx.db, "contacts")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
  if (!contact) return null
  const links = await ctx.db("contactLinks").where({ contactId: contact.id }).whereNull("deletedAt").select("linkableType", "linkableId", "role")
  const leadIds = links.filter((k) => k.linkableType === "lead").map((k) => k.linkableId)
  if (!leadIds.length) return null
  const [all, visibleRows] = await Promise.all([live(ctx.db, "leads").whereIn("id", leadIds).orderBy("createdAt", "desc"), scoped(ctx, live(ctx.db, "leads")).whereIn("id", leadIds).select("id")])
  const visible = new Set(visibleRows.map((r) => r.id))
  const mine = all.filter((l) => visible.has(l.id))
  if (!mine.length) return null
  const ids = mine.map((l) => l.id)
  const dealerIds = links.filter((k) => k.linkableType === "dealer").map((k) => k.linkableId)
  const [people, projects, activity, bookings, dealers] = await Promise.all([
    peopleByIds(mine.map((l) => l.assignedTo)),
    projectsById(ctx),
    live(ctx.db, "leadActivities").whereIn("leadId", ids).whereNot({ type: "system" }).orderBy("at", "desc").select("id", "leadId", "type", "status", "at", "doneAt", "outcome", "notes", "by"),
    ctx
      .db("bookings as b")
      .whereNull("b.deletedAt")
      .join("units as u", "u.id", "b.unitId")
      .join("projects as p", "p.id", "b.projectId")
      .whereIn("b.leadId", ids)
      .orderBy("b.bookedAt", "desc")
      .select("b.code", "b.leadId", "b.kind", "b.stage", "b.status", "b.agreedPrice", "b.bookedAt", "u.number as unitNumber", "p.name as projectName"),
    dealerIds.length ? live(ctx.db, "dealers").whereIn("id", dealerIds).select("code", "name", "isActive") : [],
  ])
  const [byPeople, contacts] = await Promise.all([peopleByIds(activity.map((a) => a.by)), contactsContext()])
  // The full contact page (Contacts app), when this person can open it
  const full = contacts.can("view") && Boolean(await contactsScoped(contacts, live(ctx.db, "contacts")).where("contacts.id", contact.id).first("contacts.id"))
  const codeOf = new Map(mine.map((l) => [l.id, l.code]))
  const done = activity.filter((a) => a.status === "done")
  const count = (type) => done.filter((a) => a.type === type).length
  const last = done.reduce((t, a) => Math.max(t, new Date(a.doneAt ?? a.at).getTime()), 0)
  return {
    code: contact.code,
    kind: contact.kind,
    name: contact.name,
    phone: contact.phone,
    whatsapp: Boolean(contact.whatsapp),
    email: contact.email,
    cnic: contacts.cnic(contact.cnic),
    city: contact.city,
    overseas: Boolean(contact.overseas),
    address: contact.address,
    company: contact.company,
    designation: contact.designation,
    notes: contact.notes ?? "",
    since: contact.createdAt,
    fullHref: full ? `/contacts/${contact.code.toLowerCase()}` : null,
    types: [...new Set(links.map((k) => k.role))],
    sources: [...new Set(mine.map((l) => l.source).filter(Boolean))],
    dealers: dealers.map((d) => ({ code: d.code, name: d.name, active: Boolean(d.isActive) })),
    hidden: all.length - mine.length,
    enquiries: mine.map((l) => ({
      code: l.code,
      status: l.status,
      priority: l.priority,
      source: l.source,
      archived: Boolean(l.archivedAt),
      agent: person(people.get(l.assignedTo)),
      createdAt: l.createdAt,
      closedAt: l.closedAt,
      interest: {
        project: projects.get(l.projectId) ?? null,
        unitType: l.unitType,
        sizeValue: l.sizeValue == null ? null : Number(l.sizeValue),
        sizeUnit: l.sizeUnit,
        budgetMin: l.budgetMin == null ? null : Number(l.budgetMin),
        budgetMax: l.budgetMax == null ? null : Number(l.budgetMax),
      },
    })),
    bookings: bookings.map((b) => ({
      code: b.code,
      lead: codeOf.get(b.leadId),
      kind: b.kind,
      stage: b.stage,
      status: b.status,
      agreedPrice: Number(b.agreedPrice),
      bookedAt: b.bookedAt,
      unit: b.unitNumber,
      project: b.projectName,
    })),
    contact: {
      calls: count("call"),
      whatsapp: count("whatsapp"),
      meetings: count("meeting"),
      visits: count("site-visit"),
      emails: count("email"),
      missed: activity.filter((a) => a.status === "missed").length,
      planned: activity.filter((a) => a.status === "planned").length,
      lastAt: last ? new Date(last) : null,
    },
    recent: done.slice(0, 15).map((a) => ({ id: a.id, lead: codeOf.get(a.leadId), type: a.type, at: a.doneAt ?? a.at, outcome: a.outcome, notes: a.notes ?? "", by: person(byPeople.get(a.by)) })),
  }
}
