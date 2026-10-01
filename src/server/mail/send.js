import "server-only"
import fs from "node:fs"
import path from "node:path"
import { LOGO_CID, renderEmail } from "./render"

// Email through Resend's HTTP API. Never throws: returns { ok, id } or { ok: false, error },
// so a mail outage doesn't undo the change that triggered it; callers decide what to say.

// The logo travels inside the email as an inline image, so it shows everywhere (including mail
// sent from local development) and mail apps don't block it as a remote picture
let logo
const logoAttachment = () =>
  (logo ??= {
    filename: "propflow-logo.png",
    content: fs.readFileSync(path.join(process.cwd(), "public/images/email/propflow-logo.png")).toString("base64"),
    content_id: LOGO_CID,
  })

// attachments: [{ filename, content: Buffer }] sent with the email (e.g. the invoice PDF)
export async function sendMail({ to, subject, html, text, replyTo, attachments = [] }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." }
  const files = [
    ...(html?.includes(`cid:${LOGO_CID}`) ? [logoAttachment()] : []),
    ...attachments.map((a) => ({ filename: a.filename, content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content })),
  ]
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [to],
        subject,
        html,
        text,
        reply_to: replyTo ?? process.env.MAIL_REPLY_TO ?? undefined,
        ...(files.length ? { attachments: files } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error("Resend refused an email:", res.status, body?.message ?? body)
      return { ok: false, error: body?.message ?? `Resend answered ${res.status}` }
    }
    return { ok: true, id: body.id }
  } catch (err) {
    console.error("Could not reach Resend:", err.message)
    return { ok: false, error: err.message }
  }
}

// Render a template from ./templates and send it:
//   await sendEmail("reset-code", { to: email, data: { name, code, minutes: 15, ip, requested_at: new Date() } })
//   attachments: [{ filename: "INV-2026-00001.pdf", content: pdfBuffer }]
export async function sendEmail(template, { to, data = {}, replyTo, attachments } = {}) {
  try {
    const { subject, html, text } = await renderEmail(template, data)
    return sendMail({ to, subject, html, text, replyTo, attachments })
  } catch (err) {
    console.error(`Could not render the "${template}" email:`, err.message)
    return { ok: false, error: `Email template "${template}" failed: ${err.message}` }
  }
}
