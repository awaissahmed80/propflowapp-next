import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { listMembers, peopleByIds } from "@/modules/users/server/queries"
import { scoped } from "./context"

// Reads for CRM. Leads only ever come through scoped(), so people see what their role allows.

export const CRM_LISTS = ["lead-status", "lead-priority", "lead-source", "loss-reason", "activity-type", "unit-type", "area-unit", "city"]
export const crmLists = (ctx) => getLookups(ctx.db, CRM_LISTS)

const person = (p) => (p ? { id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null } : null)

function shapeLead(l, { people, projects, next }) {
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
    lastContactAt: l.lastContactAt,
    closedAt: l.closedAt,
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
  const [people, projects, planned] = await Promise.all([
    peopleByIds(leads.map((l) => l.assignedTo)),
    projectsById(ctx),
    ids.length ? live(ctx.db, "leadActivities").whereIn("leadId", ids).where({ status: "planned" }).orderBy("at").select("leadId", "at", "type") : [],
  ])
  const next = new Map()
  for (const a of planned) if (!next.has(a.leadId)) next.set(a.leadId, a)
  return leads.map((l) => shapeLead(l, { people, projects, next: next.get(l.id) }))
}

// One lead (if this person may see it) with its activities, newest first; planned ones apart
export async function getLead(ctx, code) {
  const l = await scoped(ctx, live(ctx.db, "leads"))
    .where({ code: String(code ?? "").toUpperCase() })
    .first()
  if (!l) return null
  const [activities, projects] = await Promise.all([live(ctx.db, "leadActivities").where({ leadId: l.id }).orderBy("at", "desc").orderBy("id", "desc"), projectsById(ctx)])
  const people = await peopleByIds([l.assignedTo, ...activities.map((a) => a.by)])
  const planned = activities.filter((a) => a.status === "planned").sort((a, b) => a.at - b.at)
  const shapeActivity = (a) => ({ id: a.id, type: a.type, status: a.status, at: a.at, doneAt: a.doneAt, outcome: a.outcome, notes: a.notes ?? "", by: person(people.get(a.by)), project: a.projectId ? (projects.get(a.projectId) ?? null) : null })
  return {
    ...shapeLead(l, { people, projects, next: planned[0] }),
    planned: planned.map(shapeActivity),
    history: activities.filter((a) => a.status !== "planned").map(shapeActivity),
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
