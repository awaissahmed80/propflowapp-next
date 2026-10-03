"use server"

import crypto from "node:crypto"
import { z } from "zod"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { requestInfo } from "@/server/auth/session"
import { sendEmail } from "@/server/mail/send"
import { deleteFile, saveFile } from "@/server/storage"
import { detectFileType } from "@/server/storage/file-types"
import { SUPPORT_FILES, SUPPORT_TOPICS } from "../support-topics"

// "Contact support" from the sign-in pages, for people who can't get into their workspace.
// The request is only accepted when the email belongs to that workspace: an active user of it,
// or the workspace's own contact email. Anything else is refused and nothing is saved. It then
// lands in the console's Workspace Requests like one raised from inside the workspace.

const MAX_PER_HOUR = 5 // per connection; also stops using the form to test which emails exist
const attempts = (globalThis.__pfSupportAttempts ??= new Map())

function tooMany(ip) {
  if (!ip) return false
  const now = Date.now()
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 3_600_000)
  recent.push(now)
  attempts.set(ip, recent)
  return recent.length > MAX_PER_HOUR
}

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  workspace: z.string().trim().min(2, "Enter your workspace's name.").max(150),
  topic: z.enum(
    SUPPORT_TOPICS.map((t) => t.value),
    { message: "Pick what you need help with." },
  ),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(3000),
  website: z.string().max(0).optional(), // honeypot
})

// The workspace by its name, address (slug) or code, ignoring capitals
async function findWorkspace(db, text) {
  const value = text.toLowerCase().replace(/^https?:\/\//, "")
  return live(db, "tenants")
    .whereNot({ status: "provisioning" })
    .where((q) => q.whereRaw("LOWER(name) = ?", [value]).orWhereRaw("LOWER(slug) = ?", [value]).orWhereRaw("LOWER(code) = ?", [value]))
    .first("id", "code", "name", "email")
}

// Who is asking: an active user of the workspace with this email, or (for the workspace's
// contact email) its first active member, so the request still belongs to the workspace
async function findRequester(tenant, email) {
  const db = authDb()
  const member = await live(db, "memberships")
    .join("users", "users.id", "memberships.userId")
    .where({ "memberships.tenantId": tenant.id, "memberships.status": "active", "users.status": "active" })
    .whereNull("users.deletedAt")
    .orderBy("memberships.id")
    .select("users.id", "users.email")
  const own = member.find((m) => m.email.toLowerCase() === email)
  if (own) return { userId: own.id, via: "user" }
  if (tenant.email && tenant.email.toLowerCase() === email && member.length) return { userId: member[0].id, via: "workspace" }
  return null
}

// Screenshots from the form: checked by their content (not the name), images only
async function readScreenshots(files) {
  if (files.length > SUPPORT_FILES.max) return { error: `Attach up to ${SUPPORT_FILES.max} screenshots.` }
  if (files.reduce((n, f) => n + f.size, 0) > SUPPORT_FILES.maxBytes) return { error: "The screenshots are over 10 MB together. Attach smaller or fewer images." }
  const out = []
  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer())
    const type = detectFileType(buffer)
    if (!type || !SUPPORT_FILES.types.includes(type.mime)) return { error: `${f.name} isn't a PNG, JPG or WebP image.` }
    out.push({ buffer, type, name: String(f.name || `screenshot.${type.ext}`).slice(0, 150) })
  }
  return { files: out }
}

// form: FormData with the fields below, plus up to 3 "screenshots". Returns { ok, code } or
// { fieldErrors } / { error }
export async function contactSupport(form) {
  const input = Object.fromEntries(["name", "email", "workspace", "topic", "message", "website"].map((k) => [k, String(form.get(k) ?? "")]))
  const files = form.getAll("screenshots").filter((f) => typeof f === "object" && f.size > 0)
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { ok: true, code: null }
    return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  }
  const v = parsed.data
  const { ip } = await requestInfo()
  if (tooMany(ip)) return { error: "Too many attempts. Please try again in an hour." }

  const db = platformDb()
  const tenant = await findWorkspace(db, v.workspace)
  if (!tenant) return { fieldErrors: { workspace: "We couldn't find a workspace with that name. Check the spelling, or use the name shown when you signed in before." } }
  const requester = await findRequester(tenant, v.email)
  if (!requester) return { fieldErrors: { email: `This email isn't a user of ${tenant.name}. Use the email you sign in with, or ask your workspace owner to contact us.` } }

  // Only now, with the email matched, are the screenshots read and stored
  const shots = await readScreenshots(files)
  if (shots.error) return { fieldErrors: { screenshots: shots.error } }
  const saved = []
  for (const f of shots.files) {
    const key = await saveFile({ folder: "support", buffer: f.buffer, ext: f.type.ext, contentType: f.type.mime })
    saved.push({ ref: crypto.randomBytes(12).toString("hex"), key, name: f.name, type: f.type.mime, size: f.buffer.length })
  }

  const topic = SUPPORT_TOPICS.find((t) => t.value === v.topic)
  const note = requester.via === "workspace" ? ` (the workspace's contact email)` : ""
  let code
  try {
    code = await db.transaction(async (trx) => {
      const code = await nextCode(trx, "support_request")
      const [id] = await trx("supportRequests").insert({
        code,
        tenantId: tenant.id,
        raisedBy: requester.userId,
        subject: `${topic.subject} (from the sign-in page)`,
        category: topic.category,
        priority: topic.urgent ? "urgent" : "normal",
        status: "open",
        createdBy: requester.userId,
      })
      await trx("supportMessages").insert({
        requestId: id,
        authorId: requester.userId,
        authorSide: "tenant",
        body: `${v.message}\n\n— ${v.name}, ${v.email}${note}. Sent from the sign-in page.`,
        attachments: saved.length ? JSON.stringify(saved) : null,
      })
      return code
    })
  } catch (err) {
    // Nothing saved: don't leave the files behind
    await Promise.all(saved.map((f) => deleteFile(f.key).catch(() => {})))
    throw err
  }

  // A courtesy: the request is saved even if the email fails
  await sendEmail("support-received", { to: v.email, data: { name: v.name, code, workspace: tenant.name, topic: topic.label } })
  return { ok: true, code }
}
