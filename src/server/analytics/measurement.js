import "server-only"
import crypto from "node:crypto"
import { cookies } from "next/headers"
import { envAnalyticsId } from "@/server/platform-settings"

// Events sent to Google Analytics from the server (Measurement Protocol), for things that must
// be counted even when the visitor's browser blocks analytics: a saved website request is
// `generate_lead`. Needs GA_API_SECRET (GA → Admin → Data streams → your stream → Measurement
// Protocol API secrets). Production only, like the website tag, and never fails the caller.
// Never send names, emails or phone numbers: GA's terms forbid personal data.

// The visitor's GA ids from the _ga cookies, so the lead joins their visit (source, pages);
// a random id when the browser blocked analytics.
async function visitor(measurementId) {
  const jar = await cookies()
  const ga = jar.get("_ga")?.value?.match(/^GA\d\.\d\.(\d+\.\d+)$/)?.[1]
  const session = jar.get(`_ga_${measurementId.replace(/^G-/, "")}`)?.value?.match(/^GS\d\.\d\.s?(\d+)/)?.[1]
  return { clientId: ga ?? `${crypto.randomInt(1e9)}.${Math.floor(Date.now() / 1000)}`, sessionId: session ?? null }
}

export async function sendServerEvent(name, params = {}) {
  const measurementId = envAnalyticsId()
  const secret = process.env.GA_API_SECRET?.trim()
  if (!measurementId || !secret) return
  try {
    const { clientId, sessionId } = await visitor(measurementId)
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(secret)}`
    await fetch(url, {
      method: "POST",
      body: JSON.stringify({ client_id: clientId, events: [{ name, params: { ...params, ...(sessionId && { session_id: sessionId }), engagement_time_msec: 1 } }] }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    })
  } catch (err) {
    console.error(`GA event ${name} not sent: ${err.message}`)
  }
}
