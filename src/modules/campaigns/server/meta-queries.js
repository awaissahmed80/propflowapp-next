import "server-only"
import { live } from "@/server/db/records"
import { crmContext, scoped as crmScoped } from "@/modules/crm/server/context"
import { assignableAgents } from "@/modules/crm/server/queries"
import { siteUrl } from "@/lib/sites"
import { metaEnabled, metaRedirectUri } from "../meta/graph"
import { campaignsContext } from "./context"
import { integrationOn, workspaceIntegrations } from "@/server/integrations"
import { smsOverview } from "@/server/sms"
import { readAutomation } from "@/server/sms-automation"
import { TEMPLATES, templateText } from "@/modules/integrations/sms/templates"
import { LEAD_SOURCES } from "@/modules/integrations/leads/sources"
import { leadSourceOverview } from "@/modules/integrations/leads/queries"
import { canSetUp } from "@/modules/portal/server/setup"
import { getLookups } from "@/modules/lookups/server"
import { MAP_TARGETS, guessTarget, metaSettings } from "./meta"
import { campaignOptions, projectOptions } from "./queries"

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}
const DAY = 86_400_000

const sentName = (fieldData) => {
  const v = (key) => fieldData.find((f) => f.name === key)?.values?.[0]
  return v("full_name") || [v("first_name"), v("last_name")].filter(Boolean).join(" ") || null
}

// Campaigns › Integrations › Facebook & Instagram lead ads: the connection, its Pages with their
// lead forms (and how each is set up), and the latest leads Meta sent with what became of them.
// Lead names show only for leads this person can see in CRM.
export async function metaOverview(ctx) {
  const canEdit = ctx.can("edit")
  const [connection, pages, forms, log, totals, synced] = await Promise.all([
    ctx.db("metaConnections").orderBy("id", "desc").first("fbUserName", "tokenExpiresAt", "createdAt", "createdBy"),
    ctx.db("metaPages").orderBy("name").select("pageId", "name", "subscribedAt", "lastError"),
    ctx
      .db("metaForms as m")
      .leftJoin("leadForms as f", "f.id", "m.leadFormId")
      .orderBy("m.name")
      .select("m.formId", "m.pageId", "m.name", "m.fbStatus", "m.questions", "m.lastLeadAt", "m.syncedAt", "f.code", "f.status", "f.campaignId", "f.projectId", "f.settings", "f.fields"),
    ctx
      .db("metaLeads as l")
      .leftJoin("metaForms as m", "m.formId", "l.formId")
      .orderBy("l.receivedAt", "desc")
      .limit(40)
      .select("l.leadgenId", "l.status", "l.error", "l.platform", "l.isTest", "l.leadId", "l.receivedAt", "l.fieldData", "m.name as formName"),
    ctx
      .db("metaLeads")
      .where("receivedAt", ">=", new Date(Date.now() - 30 * DAY))
      .groupBy("formId", "status")
      .select("formId", "status")
      .count({ n: "id" }),
    // For the card: every lead that reached CRM (tests aside), and when the last one did
    ctx.db("metaLeads").whereIn("status", ["created", "duplicate"]).where({ isTest: false }).count({ n: "id" }).max({ last: "processedAt" }).first(),
  ])
  const [campaigns, projects, agents, settings, lists] = await Promise.all([campaignOptions(ctx), projectOptions(ctx), canEdit ? assignableAgents(ctx) : [], metaSettings(ctx.db), getLookups(ctx.db, ["lead-status"])])
  const campaignById = new Map((await live(ctx.db, "campaigns").select("id", "code", "name")).map((c) => [c.id, c]))
  const projectById = new Map((await live(ctx.db, "projects").select("id", "code", "name")).map((p) => [p.id, p]))

  // Lead codes and names, only for leads in this person's CRM reach
  const leadIds = log.map((l) => l.leadId).filter(Boolean)
  const crm = await crmContext()
  const leads = leadIds.length && crm.can("view") ? await crmScoped(crm, live(ctx.db, "leads")).whereIn("id", leadIds).select("id", "code", "name") : []
  const leadById = new Map(leads.map((l) => [l.id, l]))

  const count = (formId, status) => Number(totals.find((t) => t.formId === formId && t.status === status)?.n ?? 0)
  const shapedForms = forms.map((f) => {
    const formSettings = json(f.settings, {})
    const fields = json(f.fields, [])
    const questions = json(f.questions, [])
    const campaign = campaignById.get(f.campaignId)
    const project = projectById.get(f.projectId)
    return {
      formId: f.formId,
      pageId: f.pageId,
      name: f.name,
      fbStatus: f.fbStatus,
      lastLeadAt: f.lastLeadAt,
      syncedAt: f.syncedAt,
      linked: Boolean(f.code),
      paused: f.status === "paused",
      campaign: campaign ? { code: campaign.code, name: campaign.name } : null,
      project: project ? { code: project.code, name: project.name } : null,
      // Not set up yet: what its leads get (the lead settings' default owner)
      assignTo: f.code ? (formSettings.assignTo ?? "round-robin") : settings.owner,
      // Custom questions and what they fill on the lead
      questions: questions
        .filter((q) => !["FULL_NAME", "FIRST_NAME", "LAST_NAME", "PHONE", "EMAIL", "CITY"].includes(q.type))
        .map((q) => ({ key: q.key, label: q.label, target: fields.find((x) => x.id === q.key)?.mapTo ?? guessTarget(q.label) })),
      standard: questions.filter((q) => ["FULL_NAME", "FIRST_NAME", "LAST_NAME", "PHONE", "EMAIL", "CITY"].includes(q.type)).map((q) => q.label),
      last30: { created: count(f.formId, "created"), duplicate: count(f.formId, "duplicate"), failed: count(f.formId, "failed") + count(f.formId, "paused") },
    }
  })

  return {
    enabled: metaEnabled(),
    feature: ctx.has("lead-ads"),
    canEdit,
    connection: connection
      ? {
          name: connection.fbUserName,
          connectedAt: connection.createdAt,
          // The user token lists Pages; Page tokens keep leads coming after it expires
          daysLeft: connection.tokenExpiresAt ? Math.ceil((new Date(connection.tokenExpiresAt) - Date.now()) / DAY) : null,
        }
      : null,
    pages: pages.map((p) => ({ ...p, subscribed: Boolean(p.subscribedAt), forms: shapedForms.filter((f) => f.pageId === p.pageId) })),
    stats: { leads: Number(synced?.n ?? 0), lastAt: synced?.last ?? null },
    settings,
    log: log.map((l) => {
      const lead = leadById.get(l.leadId)
      return {
        leadgenId: l.leadgenId,
        status: l.status,
        error: l.error,
        platform: l.platform,
        isTest: Boolean(l.isTest),
        receivedAt: l.receivedAt,
        formName: l.formName,
        lead: lead ? { code: lead.code, name: lead.name } : l.leadId ? { code: null, name: "Lead with another agent" } : null,
        // Not a CRM lead (failed or waiting): the name they typed on Facebook
        sentBy: l.leadId ? null : sentName(json(l.fieldData, [])),
      }
    }),
    options: {
      campaigns: campaigns.map((c) => ({ value: c.value, label: c.label })),
      projects: projects.map((p) => ({ value: p.code, label: p.name })),
      agents: agents.map((a) => ({ value: String(a.id), label: a.name })),
      targets: MAP_TARGETS,
      stages: lists["lead-status"].filter((x) => !["booked", "lost"].includes(x.value)).map((x) => ({ value: x.value, label: x.label })),
    },
  }
}

// What both Integrations pages (Campaigns and Settings) show → { integrations, meta, sms, setup }. meta is null for
// someone who can't open Campaigns (Settings › Integrations still lists it, as set up elsewhere).
export async function integrationsData() {
  const ctx = await campaignsContext("/settings/integrations")
  const integrations = await workspaceIntegrations(ctx.tenant.id)
  return {
    // For the cards: no secrets, no icons' server data, just what each card shows
    integrations: integrations.map(({ key, status, blocked }) => ({ key, status, blocked })),
    meta: ctx.can("view") && integrations.some((i) => i.key === "meta") ? await metaOverview(ctx) : null,
    // SMS gateway: anyone who sees the page sees it; changing it needs setup rights
    sms: integrations.some((i) => i.key === "sms" && i.status === "live")
      ? { ...(await smsOverview({ db: ctx.db, tenant: ctx.tenant })), automation: await smsAutomationView(ctx.db), canEdit: canSetUp(ctx.permissions) }
      : null,
    // Google Ads lead forms and Google Forms (live ones, for people who can open Campaigns)
    leadSources: await leadSourcesData(ctx, integrations),
    setup: { webhookUrl: siteUrl("portal", "/api/meta/webhook"), redirectUri: metaRedirectUri() },
  }
}

const SOURCE_FEATURE = { "google-ads": "lead-ads", "google-forms": "lead-forms" }

async function leadSourcesData(ctx, integrations) {
  if (!ctx.can("view")) return {}
  const on = Object.values(LEAD_SOURCES).filter((src) => integrations.some((i) => i.key === src.integration && i.status === "live") && ctx.has(SOURCE_FEATURE[src.key]))
  if (!on.length) return {}
  const canEdit = ctx.can("edit")
  const [campaigns, projects, agents, lists] = await Promise.all([campaignOptions(ctx), projectOptions(ctx), canEdit ? assignableAgents(ctx) : [], getLookups(ctx.db, ["lead-status", "lead-source"])])
  const options = {
    campaigns: campaigns.map((c) => ({ value: c.value, label: c.label })),
    projects: projects.map((p) => ({ value: p.code, label: p.name })),
    agents: agents.map((a) => ({ value: String(a.id), label: a.name })),
    targets: MAP_TARGETS,
    stages: lists["lead-status"].filter((x) => !["booked", "lost"].includes(x.value)).map((x) => ({ value: x.value, label: x.label })),
    channels: lists["lead-source"].map((x) => ({ value: x.value, label: x.label })),
  }
  const out = {}
  for (const src of on) out[src.key] = { ...(await leadSourceOverview(ctx, src.key, { canEdit })), options }
  return out
}

// A campaign's Facebook & Instagram lead ads (its "Lead ads" tab): whether Meta can be used here,
// whether Facebook is connected, the Facebook forms feeding this campaign (with leads in the last
// 30 days) and the other forms on Pages receiving leads, which can be linked to it.
export async function campaignMetaForms(ctx, campaignCode) {
  const [on, connection, campaign] = await Promise.all([
    integrationOn(ctx.tenant.id, "meta"),
    ctx.db("metaConnections").first("id"),
    live(ctx.db, "campaigns")
      .where({ code: String(campaignCode).toUpperCase() })
      .first("id"),
  ])
  const available = ctx.has("lead-ads") && metaEnabled() && on
  if (!available || !connection || !campaign) return { available, connected: Boolean(connection), linked: [], others: [] }
  const [forms, counts, campaigns] = await Promise.all([
    ctx
      .db("metaForms as m")
      .join("metaPages as p", "p.pageId", "m.pageId")
      .leftJoin("leadForms as f", "f.id", "m.leadFormId")
      .whereNotNull("p.subscribedAt")
      .orderBy("m.name")
      .select("m.formId", "m.name", "m.fbStatus", "m.lastLeadAt", "p.name as pageName", "f.campaignId"),
    ctx
      .db("metaLeads")
      .whereIn("status", ["created", "duplicate"])
      .where({ isTest: false })
      .where("receivedAt", ">=", new Date(Date.now() - 30 * DAY))
      .groupBy("formId")
      .select("formId")
      .count({ n: "id" }),
    live(ctx.db, "campaigns").select("id", "name"),
  ])
  const shaped = forms.map((f) => ({
    formId: f.formId,
    name: f.name,
    pageName: f.pageName,
    fbStatus: f.fbStatus,
    lastLeadAt: f.lastLeadAt,
    leads30: Number(counts.find((c) => c.formId === f.formId)?.n ?? 0),
    campaignId: f.campaignId,
    campaignName: campaigns.find((c) => c.id === f.campaignId)?.name ?? null,
  }))
  const strip = ({ campaignId, ...f }) => f
  return { available, connected: true, linked: shaped.filter((f) => f.campaignId === campaign.id).map(strip), others: shaped.filter((f) => f.campaignId !== campaign.id).map(strip) }
}

// Automatic SMS for the SMS gateway's Configure modal: what's on, and each template's text
async function smsAutomationView(db) {
  const a = await readAutomation(db)
  return {
    before: a.before,
    due: a.due,
    overdue: a.overdue,
    receipt: { on: a.receipt.on },
    lastReminderDay: a.lastReminderDay,
    templates: TEMPLATES.map((t) => ({ key: t.key, ...templateText(a, t.key), custom: Boolean(a.templates[t.key]?.body?.trim()) })),
  }
}
