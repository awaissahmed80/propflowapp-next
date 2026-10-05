import "server-only"

// SMS gateway drivers. Each workspace uses its own account and pays its provider; PropFlow only
// sends through it. A driver: send({ apiKey, sender, to: "+923001234567", text }) →
//   { ok: true, messageId, cost, network } | { ok: false, code, error }
// and dlr(payload) → { messageId, status: delivered | failed | sent, code } for its delivery reports.

// Veevo Tech (https://veevotech.com/api-docs): JSON, one API key, delivery reports by webhook
const VEEVO_ERRORS = {
  AUTHENTICATION_FAILED: "Veevo Tech didn't accept the API key. Copy it again from the VT OneID portal.",
  INVALID_API_KEY: "Veevo Tech didn't accept the API key. Copy it again from the VT OneID portal.",
  ACCOUNT_DISABLED: "Your Veevo Tech API account is disabled. Contact Veevo Tech.",
  ACCOUNT_BLOCKED: "Veevo Tech blocked this number or account.",
  ACCOUNT_UNVERIFIED: "Your Veevo Tech account isn't verified yet and has used its test allowance.",
  INSUFFICIENT_BALANCE: "Not enough SMS balance in your Veevo Tech account. Top it up and try again.",
  LOW_BALANCE: "Not enough SMS balance in your Veevo Tech account. Top it up and try again.",
  SENDER_ID_MISSING: "Set a sender name.",
  "SENDER_ID_NOT FOUND": "That sender name isn't approved on your Veevo Tech account.",
  SENDER_ID_DISABLED: "That sender name is disabled on your Veevo Tech account.",
  SENDERID_ROUTING_FAILED: "That sender name isn't set up on this network yet. Ask Veevo Tech.",
  "NOT FOUND": "No sender name is set up on your Veevo Tech account yet.",
  IP_NOT_ALLOWED: "Your Veevo Tech account only accepts requests from whitelisted IP addresses. Ask Veevo Tech to whitelist PropFlow's server.",
  INVALID_NUMBER: "That mobile number isn't valid.",
  RECEIVER_NUMBER_MISSING: "Enter a mobile number.",
  UNSUPPORTED_COUNTRY: "Veevo Tech doesn't send to that country.",
  CONTENT_TOO_LONG: "The message is too long (800 characters at most).",
  SMS_TEXT_MISSING: "Write a message.",
  TECHNICAL_ISSUE: "Veevo Tech had a temporary problem. Try again in a moment.",
  CARRIER_ROUTING: "Veevo Tech couldn't route the message on that network.",
  TRAFFIC_NOT_ALLOWED: "Your Veevo Tech account isn't allowed to send this kind of message.",
}

const veevo = {
  key: "veevo",
  name: "Veevo Tech",
  async send({ apiKey, sender, to, text }) {
    let res, body
    try {
      res = await fetch("https://api.veevotech.com/v3/sendsms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ apikey: apiKey, receivernum: to, sendernum: sender || "Default", textmessage: text }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      })
      body = await res.json().catch(() => ({}))
    } catch (err) {
      return { ok: false, code: "UNREACHABLE", error: `Couldn't reach Veevo Tech (${err.name === "TimeoutError" ? "timed out" : "network error"}). Try again.` }
    }
    if (String(body.STATUS).toUpperCase() === "SUCCESSFUL")
      return { ok: true, messageId: String(body.MESSAGE_ID ?? ""), cost: body.CHARGED_BALANCE != null ? Number(body.CHARGED_BALANCE) : null, network: body.NETWORK_NAME ?? null }
    const code = String(body.ERROR_FILTER || body.ERROR_CODE || `HTTP_${res.status}`)
    return { ok: false, code, error: VEEVO_ERRORS[code] ?? (body.ERROR_DESCRIPTION || `Veevo Tech didn't send it (${code}).`) }
  },
  // { MESSAGE_ID, DELIVERY_STATUS: DELIVRD | UNDELIV | EXPIRED | REJECTD | …, MEDIUM: "SMS" }
  dlr(p) {
    const status = String(p?.DELIVERY_STATUS ?? "").toUpperCase()
    if (!p?.MESSAGE_ID || (p.MEDIUM && String(p.MEDIUM).toUpperCase() !== "SMS")) return null
    return { messageId: String(p.MESSAGE_ID), status: status === "DELIVRD" ? "delivered" : ["ACCEPTD", "ENROUTE", ""].includes(status) ? "sent" : "failed", code: status || null }
  },
}

export const SMS_PROVIDERS = { veevo }
