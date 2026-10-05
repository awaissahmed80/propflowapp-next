"use server"

import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { INTEGRATION_OFF, integrationOn } from "@/server/integrations"
import { campaignsAction } from "@/modules/campaigns/server/context"
import { MAP_TARGETS } from "@/modules/campaigns/server/meta"
import { mergeMetaSettings } from "@/modules/campaigns/meta/settings"
import { getLookups } from "@/modules/lookups/server"
import { LEAD_SOURCES } from "./sources"
import { linkExternalForm, newSourceKey, receiveExternal, retryExternal, sourceSettings, writeSourceSettings } from "./server"

// Google Ads lead forms and Google Forms (Settings › Integrations): set the source up (its key),
// lead settings, each form's campaign / project / owner / questions, retry, test lead, disconnect.
// Need Campaigns › edit, the plan feature (lead ads for Google Ads, lead forms for Google Forms) and
// the integration on for the workspace; disconnecting works even when it's off.

const FEATURE = { "google-ads": "lead-ads", "google-forms": "lead-forms" }

async function sourceAction(source, { evenIfOff = false } = {}) {
  const src = LEAD_SOURCES[source]
  if (!src) return { error: "Unknown lead source." }
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  if (!ctx.has(FEATURE[source])) return { error: "This isn't part of the workspace's plan." }
  if (!evenIfOff && !(await integrationOn(ctx.tenant.id, src.integration))) return { error: INTEGRATION_OFF }
  return { ctx, src, site: { db: ctx.db, tenant: ctx.tenant }, by: ctx.user.id }
}

// Turn the source on: make its key (kept if there is one) → { ok }
export async function setUpLeadSource(source) {
  const { ctx, src, error, by } = await sourceAction(source)
  if (error) return { error }
  const current = await sourceSettings(ctx.db, source)
  if (current?.key) return { ok: true }
  await writeSourceSettings(ctx.db, source, { ...mergeMetaSettings(current), key: newSourceKey() }, by)
  await logActivity(ctx.db, { type: "campaigns", action: `${source}.connected`, actorUserId: by, summary: `set up ${src.name}` })
  return { ok: true }
}

// A new key: the old one stops working (Google Ads and every installed script need the new one)
export async function newLeadSourceKey(source) {
  const { ctx, error, by } = await sourceAction(source)
  if (error) return { error }
  const current = await sourceSettings(ctx.db, source)
  if (!current?.key) return { error: "Set it up first." }
  await writeSourceSettings(ctx.db, source, { ...current, key: newSourceKey() }, by)
  return { ok: true }
}

// Stop accepting leads from it (forms, leads and the log stay)
export async function disconnectLeadSource(source) {
  const { ctx, src, error, by } = await sourceAction(source, { evenIfOff: true })
  if (error) return { error }
  const current = await sourceSettings(ctx.db, source)
  if (current) await writeSourceSettings(ctx.db, source, { ...current, key: null }, by)
  await logActivity(ctx.db, { type: "campaigns", action: `${source}.disconnected`, actorUserId: by, summary: `disconnected ${src.name}` })
  return { ok: true }
}

// Lead settings (default owner, starting status, notify, dedupe by email, note source) → { ok }
export async function saveLeadSourceSettings(source, patch = {}) {
  const { ctx, error, by } = await sourceAction(source)
  if (error) return { error }
  const current = await sourceSettings(ctx.db, source)
  const next = mergeMetaSettings({ ...current, ...patch })
  const statuses = (await getLookups(ctx.db, ["lead-status"]))["lead-status"].filter((x) => !["booked", "lost"].includes(x.value))
  if (!statuses.some((x) => x.value === next.stage)) return { error: "Choose an open lead status." }
  if (
    next.owner &&
    next.owner !== "round-robin" &&
    !(await live(ctx.db, "members")
      .where({ userId: Number(next.owner) })
      .first("id"))
  )
    return { error: "That person isn't in the workspace any more." }
  await writeSourceSettings(
    ctx.db,
    source,
    { owner: next.owner, stage: next.stage, notify: Boolean(next.notify), dedupeEmail: Boolean(next.dedupeEmail), noteSource: Boolean(next.noteSource), key: current?.key ?? null },
    by,
  )
  return { ok: true }
}

const TARGETS = MAP_TARGETS.map((t) => t.value)
const byCode = async (ctx, table, code) =>
  code
    ? live(ctx.db, table)
        .where({ code: String(code).toUpperCase() })
        .first("id", ...(table === "campaigns" ? ["projectId"] : []))
    : null

// One form's settings → { ok } | { error } | { fieldErrors }
//   { name, campaign, project (codes), assignTo, mapping, paused, channel (Google Forms) }
export async function saveExternalForm(source, externalId, input = {}) {
  const { ctx, error, by } = await sourceAction(source)
  if (error) return { error }
  const row = await ctx
    .db("externalForms")
    .where({ source, externalId: String(externalId) })
    .first()
  if (!row) return { error: "That form isn't known yet. It appears after its first lead." }
  const name = String(input.name ?? row.name).trim()
  if (name.length < 2) return { fieldErrors: { name: "Give the form a name." } }
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
  let channel = null
  if (source === "google-forms" && input.channel) {
    const sources = (await getLookups(ctx.db, ["lead-source"]))["lead-source"]
    if (!sources.some((x) => x.value === input.channel)) return { fieldErrors: { channel: "Choose a lead source." } }
    channel = input.channel
  }
  const mapping = Object.fromEntries(Object.entries(input.mapping ?? {}).filter(([, t]) => TARGETS.includes(t)))
  const questions = typeof row.questions === "string" ? JSON.parse(row.questions) : (row.questions ?? [])
  await linkExternalForm(
    ctx,
    source,
    { formId: row.externalId, formName: row.name, questions },
    { name, campaignId: c?.id ?? null, projectId: p?.id ?? c?.projectId ?? null, assignTo, mapping, paused: Boolean(input.paused), channel: source === "google-forms" ? channel : undefined },
    by,
  )
  await logActivity(ctx.db, { type: "campaigns", action: `${source}.form_saved`, actorUserId: by, summary: `set up the ${LEAD_SOURCES[source].short} form “${name}”` })
  return { ok: true }
}

// → { ok, status } | { error }
export async function retryExternalLead(source, id) {
  const { site, error, by } = await sourceAction(source)
  if (error) return { error }
  try {
    const r = await retryExternal(site, source, Number(id), by)
    return r.status === "failed" || r.status === "paused" ? { error: r.error ?? "Still couldn't add it." } : { ok: true, status: r.status }
  } catch (err) {
    return { error: err.message }
  }
}

// A made-up lead through the real road, on a "PropFlow test form" → { ok, code } | { error }
export async function sendExternalTestLead(source) {
  const { site, error, by } = await sourceAction(source)
  if (error) return { error }
  const phone = `+92300${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`
  const r = await receiveExternal(
    site,
    source,
    {
      id: `test-${Date.now()}`,
      formId: "propflow-test",
      formName: "PropFlow test form",
      questions: [
        { key: "full_name", label: "Full name", type: "FULL_NAME" },
        { key: "phone_number", label: "Phone number", type: "PHONE" },
      ],
      fieldData: [
        { name: "full_name", values: [`Test Lead (${LEAD_SOURCES[source].short})`] },
        { name: "phone_number", values: [phone] },
      ],
      meta: null,
      isTest: true,
    },
    { by },
  )
  return r.status === "created" || r.status === "duplicate" ? { ok: true, code: r.code } : { error: r.error ?? "The test lead didn't go through." }
}
