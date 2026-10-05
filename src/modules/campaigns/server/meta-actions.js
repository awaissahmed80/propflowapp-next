"use server"

import { platformDb } from "@/server/db/connections"
import { INTEGRATION_OFF, integrationOn } from "@/server/integrations"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { MetaError, pageForms, subscribePage, unsubscribePage } from "../meta/graph"
import { campaignsAction } from "./context"
import { META_SETTINGS_KEY, SYNC_OPTIONS, mergeMetaSettings } from "../meta/settings"
import { getLookups } from "@/modules/lookups/server"
import { MAP_TARGETS, metaSettings, disconnectMetaFor, linkForm, pageWithToken, retryLead, sendTestLead, syncForm } from "./meta"

// Campaigns › Integrations › Facebook & Instagram lead ads: switch a Page's leads on or off,
// refresh its forms, set a form up (campaign, project, who gets the leads, what custom questions
// fill), pause it, fetch missed leads, retry a failed one, send a test lead, disconnect.
// All need Campaigns › edit, the lead ads feature and the integration on for the workspace (live
// on the platform, not switched off by PropFlow); disconnecting works even when it's off.

//   facebook: the action changes something on Facebook (Pages on/off, disconnect): not for staff
//   signed in as a member
async function metaAction({ evenIfOff = false, facebook = false } = {}) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  if (!ctx.has("lead-ads")) return { error: "Lead ads aren't part of this workspace's plan." }
  if (facebook && ctx.session.impersonatorUserId) return { error: "Facebook can't be changed while signed in as a member." }
  if (!evenIfOff && !(await integrationOn(ctx.tenant.id, "meta"))) return { error: INTEGRATION_OFF }
  return { ctx, site: { db: ctx.db, tenant: ctx.tenant } }
}

const fbMessage = (err) => (err instanceof MetaError && err.tokenExpired ? "Facebook access ended. Connect Facebook again." : (err?.message ?? "Facebook didn't answer. Try again."))

// Save a Page's lead forms (new ones, renamed ones, new questions) → count
async function refreshForms(ctx, page) {
  const forms = await pageForms(page.pageId, page.token)
  for (const fb of forms) {
    const known = await ctx.db("metaForms").where({ formId: fb.id }).first("id", "leadFormId")
    if (known?.leadFormId) {
      // Keep how custom questions were set up; new questions get a guess
      const lf = await ctx.db("leadForms").where({ id: known.leadFormId }).first("campaignId", "projectId", "status", "settings", "fields")
      const fields = typeof lf?.fields === "string" ? JSON.parse(lf.fields) : (lf?.fields ?? [])
      const settings = typeof lf?.settings === "string" ? JSON.parse(lf.settings) : (lf?.settings ?? {})
      const mapping = Object.fromEntries(fields.filter((f) => f.mapTo != null).map((f) => [f.id, f.mapTo]))
      await linkForm(ctx, page.pageId, fb, { campaignId: lf?.campaignId, projectId: lf?.projectId, assignTo: settings.assignTo, mapping, paused: lf?.status === "paused" }, ctx.user.id)
    } else if (known)
      await ctx
        .db("metaForms")
        .where({ id: known.id })
        .update({ name: fb.name.slice(0, 200), fbStatus: fb.status, questions: JSON.stringify(fb.questions), updatedAt: new Date() })
    else await ctx.db("metaForms").insert({ formId: fb.id, pageId: page.pageId, name: fb.name.slice(0, 200), fbStatus: fb.status, questions: JSON.stringify(fb.questions) })
  }
  return forms.length
}

// Receive a Page's leads (subscribe it to Meta's lead webhook) or stop → { ok, forms } | { error }
export async function setPageLeads(pageId, on) {
  const { ctx, error } = await metaAction({ facebook: true })
  if (error) return { error }
  const page = await pageWithToken(ctx.db, pageId)
  if (!page) return { error: "That Page isn't connected. Connect Facebook again." }
  const routes = platformDb()("metaPages")
  try {
    if (on) {
      const taken = await routes.clone().where({ pageId: page.pageId }).whereNot({ tenantId: ctx.tenant.id }).first("id")
      if (taken) return { error: "This Page already sends its leads to another PropFlow workspace. Switch it off there first." }
      await subscribePage(page.pageId, page.token)
      await routes.clone().insert({ pageId: page.pageId, tenantId: ctx.tenant.id }).onConflict("pageId").merge({ tenantId: ctx.tenant.id, connectedAt: new Date() })
      await ctx.db("metaPages").where({ id: page.id }).update({ subscribedAt: new Date(), lastError: null, updatedAt: new Date(), updatedBy: ctx.user.id })
      const forms = await refreshForms(ctx, page)
      await logActivity(ctx.db, { type: "campaigns", action: "meta.page_on", actorUserId: ctx.user.id, summary: `started receiving lead ads from the Facebook Page ${page.name}` })
      return { ok: true, forms }
    }
    await unsubscribePage(page.pageId, page.token).catch((err) => console.error("Facebook unsubscribe failed:", err.message))
    await routes.clone().where({ pageId: page.pageId, tenantId: ctx.tenant.id }).delete()
    await ctx.db("metaPages").where({ id: page.id }).update({ subscribedAt: null, updatedAt: new Date(), updatedBy: ctx.user.id })
    await logActivity(ctx.db, { type: "campaigns", action: "meta.page_off", actorUserId: ctx.user.id, summary: `stopped receiving lead ads from the Facebook Page ${page.name}` })
    return { ok: true }
  } catch (err) {
    return { error: fbMessage(err) }
  }
}

export async function refreshPageForms(pageId) {
  const { ctx, error } = await metaAction()
  if (error) return { error }
  const page = await pageWithToken(ctx.db, pageId)
  if (!page) return { error: "That Page isn't connected. Connect Facebook again." }
  try {
    return { ok: true, forms: await refreshForms(ctx, page) }
  } catch (err) {
    return { error: fbMessage(err) }
  }
}

const TARGETS = MAP_TARGETS.map((t) => t.value)
const byCode = async (ctx, table, code) =>
  code
    ? live(ctx.db, table)
        .where({ code: String(code).toUpperCase() })
        .first("id", ...(table === "campaigns" ? ["projectId"] : []))
    : null

// Set a Facebook form up → { ok } | { error } | { fieldErrors }
//   { campaign, project (codes), assignTo: "" | "round-robin" | user id, mapping: { key: target }, paused }
export async function saveMetaForm(formId, input = {}) {
  const { ctx, error } = await metaAction()
  if (error) return { error }
  const row = await ctx
    .db("metaForms")
    .where({ formId: String(formId) })
    .first()
  if (!row) return { error: "That form isn't on a connected Page. Refresh the forms." }
  const [c, p] = await Promise.all([byCode(ctx, "campaigns", input.campaign), byCode(ctx, "projects", input.project)])
  if (input.campaign && !c) return { fieldErrors: { campaign: "That campaign was removed." } }
  if (input.project && !p) return { fieldErrors: { project: "That project was removed." } }
  const assignTo = String(input.assignTo ?? "")
  if (
    assignTo &&
    assignTo !== "round-robin" &&
    !(await live(ctx.db, "members")
      .where({ userId: Number(assignTo) })
      .first("id"))
  )
    return { fieldErrors: { assignTo: "That person isn't in the workspace any more." } }
  const mapping = Object.fromEntries(Object.entries(input.mapping ?? {}).filter(([, t]) => TARGETS.includes(t)))
  const questions = typeof row.questions === "string" ? JSON.parse(row.questions) : (row.questions ?? [])
  await linkForm(
    ctx,
    row.pageId,
    { id: row.formId, name: row.name, status: row.fbStatus, questions },
    { campaignId: c?.id ?? null, projectId: p?.id ?? c?.projectId ?? null, assignTo, mapping, paused: Boolean(input.paused) },
    ctx.user.id,
  )
  await logActivity(ctx.db, { type: "campaigns", action: "meta.form_saved", actorUserId: ctx.user.id, summary: `set up the Facebook lead form “${row.name}”` })
  return { ok: true }
}

// → { ok, found, created, duplicate, failed } | { error }
export async function syncMetaForm(formId) {
  const { ctx, site, error } = await metaAction()
  if (error) return { error }
  try {
    return { ok: true, ...(await syncForm(site, formId, ctx.user.id)) }
  } catch (err) {
    return { error: err.message }
  }
}

// → { ok, status } | { error }
export async function retryMetaLead(leadgenId) {
  const { ctx, site, error } = await metaAction()
  if (error) return { error }
  try {
    const r = await retryLead(site, leadgenId, ctx.user.id)
    return r.status === "failed" || r.status === "paused" ? { error: r.error ?? "Still couldn't add it." } : { ok: true, status: r.status }
  } catch (err) {
    return { error: err.message }
  }
}

// → { ok, status, code } | { error }
export async function sendMetaTestLead(formId) {
  const { ctx, site, error } = await metaAction()
  if (error) return { error }
  try {
    const r = await sendTestLead(site, formId, ctx.user.id)
    return r.status === "created" || r.status === "duplicate" ? { ok: true, ...r } : { error: r.error ?? "The test lead didn't go through." }
  } catch (err) {
    return { error: err.message }
  }
}

// Stop all lead ads and forget the Facebook connection (forms, their leads and the log stay)
export async function disconnectMeta() {
  const { ctx, site, error } = await metaAction({ evenIfOff: true, facebook: true })
  if (error) return { error }
  await disconnectMetaFor(site)
  await logActivity(ctx.db, { type: "campaigns", action: "meta.disconnected", actorUserId: ctx.user.id, summary: "disconnected Facebook lead ads" })
  return { ok: true }
}

const CLOSED = ["booked", "lost"]

// Lead settings for every Facebook form (Configure › Lead settings) → { ok, settings } | { error }
export async function saveMetaSettings(input = {}) {
  const { ctx, error } = await metaAction()
  if (error) return { error }
  const next = mergeMetaSettings({ ...(await metaSettings(ctx.db)), ...input })
  if (input.sync != null && !SYNC_OPTIONS.some((o) => o.value === input.sync)) return { error: "Choose how often to check." }
  const statuses = (await getLookups(ctx.db, ["lead-status"]))["lead-status"].filter((x) => !CLOSED.includes(x.value))
  if (!statuses.some((x) => x.value === next.stage)) return { error: "Choose an open lead status." }
  if (
    next.owner &&
    next.owner !== "round-robin" &&
    !(await live(ctx.db, "members")
      .where({ userId: Number(next.owner) })
      .first("id"))
  )
    return { error: "That person isn't in the workspace any more." }
  const clean = { sync: next.sync, owner: next.owner, stage: next.stage, notify: Boolean(next.notify), dedupeEmail: Boolean(next.dedupeEmail), noteSource: Boolean(next.noteSource) }
  await ctx
    .db("settings")
    .insert({ key: META_SETTINGS_KEY, value: JSON.stringify(clean) })
    .onConflict("key")
    .merge({ value: JSON.stringify(clean) })
  return { ok: true, settings: clean }
}

// Link a Facebook form to a campaign from the campaign's Lead ads tab, or unlink it (campaign:
// null). A form nobody set up yet gets the lead settings' defaults. → { ok } | { error }
export async function setMetaFormCampaign(formId, campaignCode) {
  const { ctx, error } = await metaAction()
  if (error) return { error }
  const row = await ctx
    .db("metaForms")
    .where({ formId: String(formId) })
    .first()
  if (!row) return { error: "That Facebook form isn't on a connected Page. Refresh the forms in Integrations." }
  const c = campaignCode ? await byCode(ctx, "campaigns", campaignCode) : null
  if (campaignCode && !c) return { error: "That campaign was removed." }
  if (row.leadFormId) {
    const lf = await ctx.db("leadForms").where({ id: row.leadFormId }).first("projectId")
    // A campaign's project, unless the form already has its own
    await ctx
      .db("leadForms")
      .where({ id: row.leadFormId })
      .update({ campaignId: c?.id ?? null, projectId: lf?.projectId ?? c?.projectId ?? null, updatedAt: new Date(), updatedBy: ctx.user.id })
  } else {
    const questions = typeof row.questions === "string" ? JSON.parse(row.questions) : (row.questions ?? [])
    const { owner } = await metaSettings(ctx.db)
    await linkForm(ctx, row.pageId, { id: row.formId, name: row.name, status: row.fbStatus, questions }, { campaignId: c?.id ?? null, projectId: c?.projectId ?? null, assignTo: owner, mapping: {} }, ctx.user.id)
  }
  await logActivity(ctx.db, {
    type: "campaigns",
    action: "meta.form_campaign",
    actorUserId: ctx.user.id,
    summary: c ? `linked the Facebook lead form “${row.name}” to campaign ${String(campaignCode).toUpperCase()}` : `unlinked the Facebook lead form “${row.name}” from its campaign`,
  })
  return { ok: true }
}
