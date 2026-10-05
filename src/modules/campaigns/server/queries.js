import "server-only"
import { live } from "@/server/db/records"
import { peopleByIds } from "@/modules/users/server/queries"
import { crmContext, scoped as crmScoped } from "@/modules/crm/server/context"
import { displayStatus } from "../constants"

// Reads for Campaigns. Results (leads, contacted, site visits, bookings, cost per lead) come from
// CRM leads attributed to a campaign (leads.campaign_id); counts use every lead, but the lead lists
// only show the ones this person can see in CRM.

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}
const day = (d) => (d ? (typeof d === "string" ? d.slice(0, 10) : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)) : null)
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)

// Campaign leads with what happened to them → [{ id, code, campaignId, formId, source, status, contacted, visited, booked, … }]
async function leadRows(db, where = (q) => q) {
  const leads = await where(live(db, "leads").where((q) => q.whereNotNull("campaignId").orWhereNotNull("formId"))).select(
    "id",
    "code",
    "name",
    "campaignId",
    "formId",
    "landingPageId",
    "source",
    "status",
    "assignedTo",
    "projectId",
    "createdAt",
    "firstContactAt",
  )
  const ids = leads.map((l) => l.id)
  const visits = ids.length ? new Set((await live(db, "leadActivities").whereIn("leadId", ids).where({ type: "site-visit", status: "done" }).select("leadId")).map((a) => a.leadId)) : new Set()
  return leads.map((l) => ({
    ...l,
    contacted: l.status !== "new",
    visited: visits.has(l.id) || ["site-visit", "negotiation", "booked"].includes(l.status),
    booked: l.status === "booked",
    lost: l.status === "lost",
    open: !["booked", "lost"].includes(l.status),
  }))
}

function results(c, rows) {
  const leads = rows.filter((r) => r.campaignId === c.id)
  const spend = sum(c.channels, (ch) => ch.spend)
  const booked = leads.filter((l) => l.booked).length
  return {
    leads: leads.length,
    open: leads.filter((l) => l.open).length,
    contacted: leads.filter((l) => l.contacted).length,
    visits: leads.filter((l) => l.visited).length,
    bookings: booked,
    lost: leads.filter((l) => l.lost).length,
    budget: sum(c.channels, (ch) => ch.budget),
    spend,
    impressions: sum(c.channels, (ch) => ch.impressions),
    clicks: sum(c.channels, (ch) => ch.clicks),
    cpl: leads.length ? Math.round(spend / leads.length) : null,
    cpb: booked ? Math.round(spend / booked) : null,
  }
}

// Actual value for a goal metric
export const goalActual = (metric, r) => ({ leads: r.leads, "site-visits": r.visits, bookings: r.bookings, cpl: r.cpl })[metric] ?? null

async function shapeAll(db, rows) {
  const campaigns = await live(db, "campaigns").orderBy("startDate", "desc").orderBy("id", "desc")
  const [projects, people] = await Promise.all([live(db, "projects").select("id", "code", "name", "color"), peopleByIds(campaigns.map((c) => c.ownerId))])
  return campaigns.map((c) => {
    const base = {
      id: c.id,
      code: c.code,
      name: c.name,
      objective: c.objective,
      status: c.status,
      startDate: day(c.startDate),
      endDate: day(c.endDate),
      audience: c.audience ?? "",
      offer: c.offer ?? "",
      notes: c.notes ?? "",
      channels: json(c.channels, []),
      goals: json(c.goals, []),
      createdAt: c.createdAt,
    }
    const project = projects.find((p) => p.id === c.projectId)
    const owner = people.get(c.ownerId)
    return {
      ...base,
      displayStatus: displayStatus(base),
      project: project ? { code: project.code, name: project.name, color: project.color } : null,
      owner: owner ? { id: owner.id, name: owner.name, avatarUrl: owner.avatarUrl ?? null } : null,
      results: results(base, rows),
    }
  })
}

const strip = ({ id, ...c }) => c // ids stay on the server

export async function listCampaigns(ctx) {
  return (await shapeAll(ctx.db, await leadRows(ctx.db))).map(strip)
}

// Every campaign and its leads, for the overview
export async function campaignActivity(ctx) {
  const rows = await leadRows(ctx.db)
  const campaigns = await shapeAll(ctx.db, rows)
  const byId = new Map(campaigns.map((c) => [c.id, c.code]))
  return {
    campaigns: campaigns.map(strip),
    leads: rows.filter((r) => r.campaignId).map((r) => ({ campaign: byId.get(r.campaignId) ?? null, source: r.source, createdAt: r.createdAt, booked: r.booked, visited: r.visited, contacted: r.contacted })),
  }
}

// One campaign with its leads (the ones visible in CRM), results per channel, and its forms and pages
export async function getCampaign(ctx, code) {
  const c = await live(ctx.db, "campaigns")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id")
  if (!c) return null
  const rows = await leadRows(ctx.db, (q) => q.where({ campaignId: c.id }))
  const [shaped] = (await shapeAll(ctx.db, rows)).filter((x) => x.id === c.id)
  // Which leads this person may open in CRM
  const crm = await crmContext()
  const visible = crm.can("view")
    ? new Set(
        (
          await crmScoped(crm, live(ctx.db, "leads"))
            .whereIn(
              "id",
              rows.map((r) => r.id),
            )
            .select("id")
        ).map((r) => r.id),
      )
    : new Set()
  const people = await peopleByIds(rows.map((r) => r.assignedTo))
  const leads = rows
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((l) => ({
      code: visible.has(l.id) ? l.code : null,
      name: visible.has(l.id) ? l.name : "Lead with another agent",
      source: l.source,
      status: l.status,
      createdAt: l.createdAt,
      booked: l.booked,
      visited: l.visited,
      contacted: l.contacted,
      agent: people.get(l.assignedTo) ? { name: people.get(l.assignedTo).name, avatarUrl: people.get(l.assignedTo).avatarUrl ?? null } : null,
    }))
  const channels = shaped.channels.map((ch) => {
    const own = rows.filter((l) => l.source === ch.channel)
    const booked = own.filter((l) => l.booked).length
    return {
      ...ch,
      leads: own.length,
      visits: own.filter((l) => l.visited).length,
      bookings: booked,
      cpl: own.length ? Math.round((ch.spend || 0) / own.length) : null,
      ctr: ch.impressions ? ch.clicks / ch.impressions : null,
    }
  })
  const [forms, pages] = await Promise.all([
    live(ctx.db, "leadForms").where({ campaignId: c.id }).select("code", "name", "status", "provider"),
    live(ctx.db, "landingPages").where({ campaignId: c.id }).select("code", "name", "slug", "status"),
  ])
  return { ...strip(shaped), leads, channels, forms, pages: pages.map((p) => ({ ...p, url: null })) }
}

// Campaigns a form, page or lead can belong to (newest first) → [{ value: code, label, project }]
export async function campaignOptions(ctx, { drafts = true } = {}) {
  const rows = await live(ctx.db, "campaigns")
    .modify((q) => (drafts ? q : q.whereNot({ status: "draft" })))
    .orderBy("startDate", "desc")
    .select("code", "name", "status", "projectId")
  const projects = await live(ctx.db, "projects").select("id", "code")
  return rows.map((r) => ({ value: r.code, label: r.name, status: r.status, project: projects.find((p) => p.id === r.projectId)?.code ?? null }))
}

export const projectOptions = (ctx) => live(ctx.db, "projects").orderBy("name").select("code", "name", "color")
