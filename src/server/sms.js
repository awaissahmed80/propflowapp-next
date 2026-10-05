import "server-only"
import crypto from "node:crypto"
import { normalizePhone } from "@/lib/phone"
import { siteUrl } from "@/lib/sites"
import { openSecret } from "@/server/secret-box"
import { INTEGRATION_OFF, integrationOn } from "@/server/integrations"
import { SMS_PROVIDERS } from "@/modules/integrations/sms/providers"
import { SMS_MAX, smsParts } from "@/modules/integrations/sms/text"

// A workspace's SMS gateway (Settings › Integrations › SMS gateway): its own provider account,
// kept in its settings under "sms" (the API key sealed with ENCRYPTION_KEY), and every message
// sent through it logged in sms_messages with its delivery report.
//   { provider: "veevo", apiKey (sealed), sender, webhookToken, connectedAt, connectedBy }

export const SMS_KEY = "sms"

export async function readSms(db) {
  const row = await db("settings").where({ key: SMS_KEY }).first("value")
  const v = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value
  return v?.provider ? v : null
}

export const newWebhookToken = () => crypto.randomBytes(18).toString("base64url")

// Where the provider sends delivery reports for this workspace (set in the provider's dashboard)
export const smsWebhookUrl = (tenant, s) => (s?.webhookToken ? siteUrl("portal", `/api/sms/dlr/${String(tenant.code).toLowerCase()}/${s.webhookToken}`) : null)

// Send one SMS and log it → { ok, id } | { error, code }
//   site: { db, tenant } · kind: transactional | promotional | test
//   subject: { type: "booking", id } the record it's about · template: the automatic message it is
//   (installment-before, receipt…) · by: who sent it (null: PropFlow did)
export async function sendSms(site, { to, text, kind = "transactional", subject = null, template = null, by = null }) {
  if (!(await integrationOn(site.tenant.id, "sms"))) return { error: INTEGRATION_OFF }
  const s = await readSms(site.db)
  const driver = s && SMS_PROVIDERS[s.provider]
  const apiKey = s && openSecret(s.apiKey)
  if (!driver || !apiKey) return { error: "Connect an SMS gateway first (Settings › Integrations)." }
  const phone = normalizePhone(to)
  if (!phone) return { error: "Enter a mobile number, e.g. 0300 1234567.", code: "INVALID_NUMBER" }
  const body = String(text ?? "").trim()
  if (!body) return { error: "Write a message.", code: "SMS_TEXT_MISSING" }
  if (body.length > SMS_MAX) return { error: `The message is too long (${SMS_MAX} characters at most).`, code: "CONTENT_TOO_LONG" }
  const { parts, unicode } = smsParts(body)
  const [id] = await site.db("smsMessages").insert({ toPhone: phone, body, parts, unicode, kind, provider: driver.key, subjectType: subject?.type ?? null, subjectId: subject?.id ?? null, template, sentBy: by })
  const r = await driver.send({ apiKey, sender: s.sender, to: phone, text: body })
  await site
    .db("smsMessages")
    .where({ id })
    .update(
      r.ok
        ? { status: "sent", providerMessageId: r.messageId || null, cost: r.cost, network: r.network?.slice(0, 40) ?? null, sentAt: new Date() }
        : { status: "failed", errorCode: r.code?.slice(0, 40) ?? null, error: r.error?.slice(0, 300) ?? null },
    )
  return r.ok ? { ok: true, id } : { error: r.error, code: r.code }
}

// A delivery report from the provider → updated or not
export async function receiveDlr(db, provider, payload) {
  const driver = SMS_PROVIDERS[provider]
  const d = driver?.dlr(payload)
  if (!d) return false
  const patch =
    d.status === "delivered" ? { status: "delivered", deliveredAt: new Date(), errorCode: null, error: null } : d.status === "failed" ? { status: "failed", errorCode: d.code, error: "Not delivered to the phone." } : null
  if (!patch) return false
  const n = await db("smsMessages").where({ provider, providerMessageId: d.messageId }).whereNot({ status: "delivered" }).update(patch)
  return n > 0
}

// For the card and its Configure modal: the account (never the key), 30-day totals, latest messages
export async function smsOverview(site) {
  const s = await readSms(site.db)
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [totals, log] = await Promise.all([
    site.db("smsMessages").where("createdAt", ">=", since).groupBy("status").select("status").count({ n: "id" }).sum({ parts: "parts", cost: "cost" }),
    site.db("smsMessages").orderBy("id", "desc").limit(40).select("id", "toPhone", "body", "parts", "unicode", "kind", "status", "error", "cost", "createdAt", "deliveredAt"),
  ])
  const sum = (key, status) => totals.filter((t) => !status || t.status === status).reduce((a, t) => a + Number(t[key] ?? 0), 0)
  return {
    connected: Boolean(s),
    provider: s?.provider ?? null,
    providerName: s ? (SMS_PROVIDERS[s.provider]?.name ?? s.provider) : null,
    sender: s?.sender ?? "",
    keyOk: Boolean(s && openSecret(s.apiKey)),
    webhookUrl: smsWebhookUrl(site.tenant, s),
    connectedAt: s?.connectedAt ?? null,
    verifiedAt: s?.verifiedAt ?? null, // a test SMS went through
    last30: { sent: sum("n"), delivered: sum("n", "delivered"), failed: sum("n", "failed"), parts: sum("parts"), cost: Math.round(sum("cost") * 100) / 100 },
    lastAt: log[0]?.createdAt ?? null,
    log,
  }
}
