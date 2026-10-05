import "server-only"
import { live } from "@/server/db/records"
import { crmContext, scoped as crmScoped } from "@/modules/crm/server/context"
import { guessTarget } from "@/modules/campaigns/server/meta"
import { mergeMetaSettings } from "@/modules/campaigns/meta/settings"
import { LEAD_SOURCES, appsScript } from "./sources"
import { sourceSettings, sourceUrl } from "./server"

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
const STANDARD = ["FULL_NAME", "FIRST_NAME", "LAST_NAME", "PHONE", "EMAIL", "CITY"]

// One lead source's card and Configure modal (Google Ads lead forms, Google Forms): whether it's
// set up, its address and key (only for people who can change it), lead settings, its forms with
// how each is set up, and the latest leads (names only for leads this person can see in CRM).
export async function leadSourceOverview(ctx, source, { canEdit }) {
  const [settings, forms, log, totals, synced] = await Promise.all([
    sourceSettings(ctx.db, source),
    ctx
      .db("externalForms as e")
      .leftJoin("leadForms as f", "f.id", "e.leadFormId")
      .where("e.source", source)
      .orderBy("e.name")
      .select("e.externalId", "e.name", "e.questions", "e.lastLeadAt", "f.code", "f.status", "f.campaignId", "f.projectId", "f.settings", "f.fields"),
    ctx
      .db("externalLeads as l")
      .leftJoin("externalForms as e", (j) => j.on("e.externalId", "l.formExternalId").andOn("e.source", "l.source"))
      .where("l.source", source)
      .orderBy("l.receivedAt", "desc")
      .limit(40)
      .select("l.id", "l.status", "l.error", "l.isTest", "l.leadId", "l.receivedAt", "l.fieldData", "e.name as formName"),
    ctx
      .db("externalLeads")
      .where({ source })
      .where("receivedAt", ">=", new Date(Date.now() - 30 * DAY))
      .groupBy("formExternalId", "status")
      .select("formExternalId", "status")
      .count({ n: "id" }),
    ctx.db("externalLeads").where({ source, isTest: false }).whereIn("status", ["created", "duplicate"]).count({ n: "id" }).max({ last: "processedAt" }).first(),
  ])
  const defaults = settings ?? mergeMetaSettings(null)
  const campaignById = new Map((await live(ctx.db, "campaigns").select("id", "code", "name")).map((c) => [c.id, c]))
  const projectById = new Map((await live(ctx.db, "projects").select("id", "code", "name")).map((p) => [p.id, p]))
  const leadIds = log.map((l) => l.leadId).filter(Boolean)
  const crm = await crmContext()
  const leads = leadIds.length && crm.can("view") ? await crmScoped(crm, live(ctx.db, "leads")).whereIn("id", leadIds).select("id", "code", "name") : []
  const leadById = new Map(leads.map((l) => [l.id, l]))
  const count = (formId, status) => Number(totals.find((t) => t.formExternalId === formId && t.status === status)?.n ?? 0)
  const sentName = (fd) => {
    const v = (key) => fd.find((f) => f.name === key)?.values?.[0]
    return v("FULL_NAME") || v("full_name") || [v("FIRST_NAME"), v("LAST_NAME")].filter(Boolean).join(" ") || null
  }
  const configured = Boolean(settings?.key)
  const url = sourceUrl(ctx.tenant, source)

  return {
    source,
    name: LEAD_SOURCES[source].name,
    canEdit,
    configured,
    // The address and key only for people who can change the source
    url: canEdit && configured ? url : null,
    key: canEdit && configured ? settings.key : null,
    script: canEdit && configured && source === "google-forms" ? appsScript({ url, key: settings.key }) : null,
    settings: { owner: defaults.owner, stage: defaults.stage, notify: defaults.notify, dedupeEmail: defaults.dedupeEmail, noteSource: defaults.noteSource },
    stats: { leads: Number(synced?.n ?? 0), lastAt: synced?.last ?? null },
    forms: forms
      .filter((f) => f.externalId !== "propflow-test" || f.code)
      .map((f) => {
        const s = json(f.settings, {})
        const fields = json(f.fields, [])
        const questions = json(f.questions, [])
        const campaign = campaignById.get(f.campaignId)
        const project = projectById.get(f.projectId)
        return {
          externalId: f.externalId,
          name: f.name,
          lastLeadAt: f.lastLeadAt,
          paused: f.status === "paused",
          campaign: campaign ? { code: campaign.code, name: campaign.name } : null,
          project: project ? { code: project.code, name: project.name } : null,
          assignTo: f.code ? (s.assignTo ?? "round-robin") : defaults.owner,
          channel: s.channel ?? "",
          questions: questions.filter((q) => !STANDARD.includes(q.type)).map((q) => ({ key: q.key, label: q.label, target: fields.find((x) => x.id === q.key)?.mapTo ?? guessTarget(q.label) })),
          standard: questions.filter((q) => STANDARD.includes(q.type)).map((q) => q.label),
          last30: { created: count(f.externalId, "created"), duplicate: count(f.externalId, "duplicate"), failed: count(f.externalId, "failed") + count(f.externalId, "paused") },
        }
      }),
    log: log.map((l) => {
      const lead = leadById.get(l.leadId)
      return {
        id: l.id,
        status: l.status,
        error: l.error,
        isTest: Boolean(l.isTest),
        receivedAt: l.receivedAt,
        formName: l.formName,
        lead: lead ? { code: lead.code, name: lead.name } : l.leadId ? { code: null, name: "Lead with another agent" } : null,
        sentBy: l.leadId ? null : sentName(json(l.fieldData, [])),
      }
    }),
  }
}
