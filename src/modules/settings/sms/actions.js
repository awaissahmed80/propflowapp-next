"use server"

import { z } from "zod"
import { logActivity } from "@/server/tenants/activity"
import { openSecret, sealSecret } from "@/server/secret-box"
import { writeSettings } from "@/modules/portal/server/setup"
import { INTEGRATION_OFF, integrationOn } from "@/server/integrations"
import { SMS_KEY, newWebhookToken, readSms, sendSms } from "@/server/sms"
import { SMS_PROVIDERS } from "@/modules/integrations/sms/providers"
import { SMS_MAX } from "@/modules/integrations/sms/text"
import { SAMPLE, mergeAutomation, render, templateByKey, templateText } from "@/modules/integrations/sms/templates"
import { previewSmsAutomation, readAutomation, runSmsAutomation, writeAutomation } from "@/server/sms-automation"
import { settingsPage } from "../context"

// Settings › Integrations › SMS gateway: the workspace's own provider account (it pays its
// provider). Needs setup rights. The API key is sealed and never sent back to the browser; leaving
// it empty when editing keeps the saved one. A test SMS proves it works (verifiedAt).

async function smsAction({ evenIfOff = false } = {}) {
  const ctx = await settingsPage("/settings/integrations")
  if (!ctx.canEdit) return { error: "Only the owner or an administrator can change the SMS gateway." }
  if (!evenIfOff && !(await integrationOn(ctx.tenant.id, "sms"))) return { error: INTEGRATION_OFF }
  return { ctx, site: { db: ctx.db, tenant: ctx.tenant }, by: ctx.session.user.id }
}

const schema = z.object({
  provider: z.enum(Object.keys(SMS_PROVIDERS)),
  apiKey: z.string().trim().max(200).optional().default(""),
  // Approved sender names are short brand names (masks) or a number
  sender: z
    .string()
    .trim()
    .max(20, "A sender name is at most 20 characters.")
    .regex(/^[A-Za-z0-9 .&-]*$/, "Use letters, numbers, spaces, dots, & or -.")
    .optional()
    .default(""),
})

// → { ok } | { error } | { fieldErrors }
export async function saveSmsGateway(input) {
  const { ctx, error, by } = await smsAction()
  if (error) return { error }
  const parsed = schema.safeParse(input ?? {})
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  const current = await readSms(ctx.db)
  const sameProvider = current?.provider === v.provider
  if (!v.apiKey && !(sameProvider && openSecret(current?.apiKey))) return { fieldErrors: { apiKey: "Paste the API key from your provider." } }
  const changed = !current || !sameProvider || Boolean(v.apiKey) || current.sender !== v.sender
  await writeSettings(
    ctx.tenant,
    {
      [SMS_KEY]: {
        provider: v.provider,
        apiKey: v.apiKey ? sealSecret(v.apiKey) : current.apiKey,
        sender: v.sender,
        webhookToken: current?.webhookToken ?? newWebhookToken(),
        connectedAt: current?.connectedAt ?? new Date().toISOString(),
        connectedBy: current?.connectedBy ?? by,
        // A new key or sender needs a fresh test
        verifiedAt: changed ? null : (current?.verifiedAt ?? null),
      },
    },
    by,
  )
  await logActivity(ctx.db, {
    type: "settings",
    action: current ? "sms.updated" : "sms.connected",
    actorUserId: by,
    summary: `${current ? "changed" : "connected"} the SMS gateway (${SMS_PROVIDERS[v.provider].name}${v.sender ? `, sender ${v.sender}` : ""})`,
  })
  return { ok: true }
}

// Send a test SMS (to someone's own phone) → { ok } | { error }
export async function sendTestSms({ to, text } = {}) {
  const { ctx, site, error, by } = await smsAction()
  if (error) return { error }
  const message = String(text ?? "").trim() || `Test from PropFlow: ${ctx.tenant.name} can now send SMS.`
  const r = await sendSms(site, { to, text: message, kind: "test", by })
  if (r.error) return { error: r.error }
  const s = await readSms(ctx.db)
  if (s && !s.verifiedAt) await writeSettings(ctx.tenant, { [SMS_KEY]: { ...s, verifiedAt: new Date().toISOString() } }, by)
  return { ok: true }
}

// New delivery-report address (the old one stops working)
export async function newSmsWebhook() {
  const { ctx, error, by } = await smsAction()
  if (error) return { error }
  const s = await readSms(ctx.db)
  if (!s) return { error: "Connect an SMS gateway first." }
  await writeSettings(ctx.tenant, { [SMS_KEY]: { ...s, webhookToken: newWebhookToken() } }, by)
  return { ok: true }
}

// Forget the account (the message log stays)
export async function disconnectSmsGateway() {
  const { ctx, error, by } = await smsAction({ evenIfOff: true })
  if (error) return { error }
  await writeSettings(ctx.tenant, { [SMS_KEY]: null }, by)
  await logActivity(ctx.db, { type: "settings", action: "sms.disconnected", actorUserId: by, summary: "disconnected the SMS gateway" })
  return { ok: true }
}

// ---------- automatic messages and templates ----------

// Switch automatic messages on or off / change their days → { ok } | { error }
//   patch: { before: { on, days }, due: { on }, overdue: { on, days }, receipt: { on } } (any part)
export async function saveSmsAutomation(patch = {}) {
  const { ctx, error, by } = await smsAction()
  if (error) return { error }
  const current = await readAutomation(ctx.db)
  const next = mergeAutomation({
    ...current,
    before: { ...current.before, ...(patch.before ?? {}) },
    due: { ...current.due, ...(patch.due ?? {}) },
    overdue: { ...current.overdue, ...(patch.overdue ?? {}) },
    // Receipts cleared before it was switched on aren't messaged
    receipt: patch.receipt ? { on: Boolean(patch.receipt.on), since: patch.receipt.on ? (current.receipt.on ? current.receipt.since : new Date().toISOString()) : null } : current.receipt,
  })
  await writeAutomation(ctx.db, next, by)
  return { ok: true }
}

// A template's language and text (empty text: back to the default) → { ok } | { error } | { fieldErrors }
export async function saveSmsTemplate(key, { lang = "en", body = "" } = {}) {
  const { ctx, error, by } = await smsAction()
  if (error) return { error }
  if (!templateByKey(key)) return { error: "Unknown template." }
  const text = String(body ?? "").trim()
  if (text.length > SMS_MAX) return { fieldErrors: { body: `At most ${SMS_MAX} characters.` } }
  const current = await readAutomation(ctx.db)
  const templates = { ...current.templates, [key]: { lang: lang === "ur" ? "ur" : "en", body: text } }
  await writeAutomation(ctx.db, { ...current, templates }, by)
  return { ok: true }
}

// Send one template, filled with sample values, to a phone → { ok } | { error }
export async function sendTemplateTest(key, to) {
  const { ctx, site, error, by } = await smsAction()
  if (error) return { error }
  if (!templateByKey(key)) return { error: "Unknown template." }
  const { body } = templateText(await readAutomation(ctx.db), key)
  const r = await sendSms(site, { to, text: render(body, { ...SAMPLE, company: ctx.tenant.name }), kind: "test", by })
  return r.error ? { error: r.error } : { ok: true }
}

// What the next run would send (nothing is sent) → { ok, preview }
export async function previewSmsAutomationNow() {
  const { site, error } = await smsAction()
  if (error) return { error }
  return { ok: true, preview: await previewSmsAutomation(site) }
}

// Send what's due now (today's reminders, cleared payments) → { ok, reminders, receipts } | { error }
export async function runSmsAutomationNow() {
  const { site, error, by } = await smsAction()
  if (error) return { error }
  const r = await runSmsAutomation(site, { force: true, by })
  if (r.skipped) return { error: r.skipped }
  return { ok: true, ...r }
}
