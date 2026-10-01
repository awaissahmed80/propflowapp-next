"use server"

import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { normalizePkMobile } from "@/lib/phone"
import { usersAction } from "./context"
import { listMembers } from "./queries"

// Dealer firms (Dealer Accounts): add and edit them, switch them off and on, remove them.
// Switching a firm off suspends its logins and cancels its waiting invitations.

const optional = (max) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional())

const dealerSchema = z.object({
  name: z.string().trim().min(2, "Enter the dealer's name.").max(150, "That's too long."),
  contactName: optional(120),
  phone: optional(30).refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Enter a phone number, e.g. 0300 1234567."),
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).nullable().optional()),
  city: optional(80),
  address: optional(255),
  ntn: optional(20),
  notes: optional(500),
})

const fieldErrors = (error) => Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]))

const findDealer = (ctx, code) => live(ctx.db, "dealers").where({ code: String(code ?? "").toUpperCase() }).first("id", "code", "name", "isActive")

// New (no code) or existing dealer → { ok, code } or { error, fieldErrors }
export async function saveDealer(input, code) {
  const { ctx, error } = await usersAction("edit", "dealers")
  if (error) return { error }
  const parsed = dealerSchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) }
  const v = parsed.data
  const current = code ? await findDealer(ctx, code) : null
  if (code && !current) return { error: "That dealer was removed." }
  const clash = await live(ctx.db, "dealers").where({ name: v.name }).whereNot({ id: current?.id ?? 0 }).first("id")
  if (clash) return { fieldErrors: { name: "Another dealer already has this name." } }

  const row = {
    name: v.name,
    contactName: v.contactName ?? null,
    // Mobiles are kept as +92…; landlines as typed
    phone: v.phone ? (normalizePkMobile(v.phone) ?? v.phone) : null,
    email: v.email ?? null,
    city: v.city ?? null,
    address: v.address ?? null,
    ntn: v.ntn ?? null,
    notes: v.notes ?? null,
  }
  let saved = current?.code
  if (current) {
    await ctx.db("dealers").where({ id: current.id }).update({ ...row, updatedAt: new Date(), updatedBy: ctx.user.id })
  } else {
    await ctx.db.transaction(async (trx) => {
      saved = await nextCode(trx, "dealer")
      await trx("dealers").insert({ ...row, code: saved, createdBy: ctx.user.id })
    })
  }
  await logActivity(ctx.db, { type: "dealer", action: current ? "dealer.updated" : "dealer.created", actorUserId: ctx.user.id, summary: current ? `updated dealer ${v.name}` : `added dealer ${v.name}`, subjectType: "dealer" })
  return { ok: true, code: saved }
}

// Off: its logins are suspended (signed out) and waiting invitations cancelled. On: the firm can
// get logins again; suspended logins are reactivated one by one from Users.
export async function setDealerActive(code, active) {
  const { ctx, error } = await usersAction("edit", "dealers")
  if (error) return { error }
  const dealer = await findDealer(ctx, code)
  if (!dealer) return { error: "That dealer was removed." }
  if (dealer.isActive === Boolean(active)) return { ok: true }
  const now = new Date()
  await ctx.db("dealers").where({ id: dealer.id }).update({ isActive: Boolean(active), updatedAt: now, updatedBy: ctx.user.id })
  let suspended = 0
  if (!active) {
    const logins = (await listMembers(ctx)).filter((m) => m.dealerId === dealer.id && m.status === "active")
    const auth = authDb()
    for (const m of logins) {
      await auth("memberships").where({ id: m.membershipId }).update({ status: "suspended", updatedAt: now, updatedBy: ctx.user.id })
      await auth("sessions").where({ userId: m.id, tenantId: ctx.tenant.id, kind: "tenant" }).whereNull("revokedAt").update({ revokedAt: now })
    }
    suspended = logins.length
    const waiting = await live(auth, "invitations").where({ kind: "tenant", tenantId: ctx.tenant.id }).whereNull("acceptedAt").whereNull("revokedAt").select("id", "details")
    const ids = waiting.filter((i) => i.details?.dealerId === dealer.id).map((i) => i.id)
    if (ids.length) await auth("invitations").whereIn("id", ids).update({ revokedAt: now, updatedAt: now, updatedBy: ctx.user.id })
  }
  await logActivity(ctx.db, {
    type: "security",
    action: active ? "dealer.activated" : "dealer.deactivated",
    actorUserId: ctx.user.id,
    summary: active ? `activated dealer ${dealer.name}` : `deactivated dealer ${dealer.name}${suspended ? ` and suspended ${suspended} login${suspended === 1 ? "" : "s"}` : ""}`,
    subjectType: "dealer",
    subjectId: dealer.id,
  })
  return { ok: true, suspended }
}

// Only dealers with no logins and no waiting invitations; otherwise deactivate them
export async function removeDealer(code) {
  const { ctx, error } = await usersAction("delete", "dealers")
  if (error) return { error }
  const dealer = await findDealer(ctx, code)
  if (!dealer) return { error: "That dealer was already removed." }
  const logins = (await listMembers(ctx)).filter((m) => m.dealerId === dealer.id).length
  const waiting = (await live(authDb(), "invitations").where({ kind: "tenant", tenantId: ctx.tenant.id }).whereNull("acceptedAt").whereNull("revokedAt").where("expiresAt", ">", new Date()).select("details")).filter((i) => i.details?.dealerId === dealer.id).length
  if (logins || waiting) return { error: `${dealer.name} still has ${logins ? `${logins} login${logins === 1 ? "" : "s"}` : `${waiting} waiting invitation${waiting === 1 ? "" : "s"}`}. Deactivate the dealer instead, or remove those first.` }
  await ctx.db("dealers").where({ id: dealer.id }).update({ deletedAt: new Date(), deletedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "dealer", action: "dealer.removed", actorUserId: ctx.user.id, summary: `removed dealer ${dealer.name}`, subjectType: "dealer", subjectId: dealer.id })
  return { ok: true }
}
