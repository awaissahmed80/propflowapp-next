import "server-only"
import nodemailer from "nodemailer"
import { openSecret } from "@/server/secret-box"

// A workspace's own outgoing email (Settings › Email), for mail its team sends to their own
// customers, e.g. emailing a lead from CRM. Stored in the workspace's settings under "smtp",
// the password sealed with ENCRYPTION_KEY. PropFlow's own mail (sign-in, invoices) uses Resend.
//   { host, port, security: "ssl" | "starttls" | "none", user, password (sealed), fromName, fromEmail, replyTo }

export const SMTP_KEY = "smtp"

export async function readSmtp(db) {
  const row = await db("settings").where({ key: SMTP_KEY }).first("value")
  const v = typeof row?.value === "string" ? JSON.parse(row.value) : row?.value
  return v?.host ? v : null
}

// Ready to send: saved, and the password can still be opened with this server's key
export async function smtpReady(db) {
  const s = await readSmtp(db)
  return Boolean(s && s.fromEmail && (!s.user || openSecret(s.password) !== null))
}

export function smtpTransport(s, password = openSecret(s.password)) {
  return nodemailer.createTransport({
    host: s.host,
    port: Number(s.port),
    secure: s.security === "ssl",
    requireTLS: s.security === "starttls",
    ignoreTLS: s.security === "none",
    auth: s.user ? { user: s.user, pass: password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
}

const address = (name, email) => (name ? { name, address: email } : email)

// → { ok, id } or { ok: false, error } (never throws)
export async function sendWorkspaceMail(db, { to, subject, text, html, replyTo }) {
  const s = await readSmtp(db)
  if (!s) return { ok: false, error: "Email isn't set up for this workspace. Add it in Settings › Email." }
  try {
    const info = await smtpTransport(s).sendMail({ from: address(s.fromName, s.fromEmail), to, subject, text, html, replyTo: replyTo || s.replyTo || undefined })
    return { ok: true, id: info.messageId }
  } catch (err) {
    return { ok: false, error: smtpError(err) }
  }
}

// Plain-language reasons for the usual SMTP failures
export function smtpError(err) {
  const m = `${err?.code ?? ""} ${err?.message ?? ""}`
  if (/EAUTH|535|534|Invalid login|authentication/i.test(m)) return "The email server didn't accept the username or password."
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return "Couldn't find that email server. Check the host name."
  if (/ECONNREFUSED|ETIMEDOUT|ECONNECTION|timeout/i.test(m)) return "Couldn't connect to the email server. Check the host, port and security setting."
  if (/certificate|SSL|TLS|wrong version number/i.test(m)) return "The secure connection failed. Try the other security option (SSL on 465, STARTTLS on 587)."
  return `The email server said: ${String(err?.message ?? "unknown error").slice(0, 200)}`
}
