"use server"

import { authDb } from "@/server/db/connections"
import { logActivity } from "@/server/tenants/activity"
import { normalizePkMobile } from "@/lib/phone"
import { deskContext } from "./context"

// Your own mobile number (on your PropFlow account, so the same in every workspace). "" clears it.
export async function updateMyPhone(input) {
  const ctx = await deskContext()
  const raw = String(input ?? "").trim()
  const phone = raw ? normalizePkMobile(raw) : null
  if (raw && !phone) return { error: "Enter a Pakistani mobile number, e.g. 0300 1234567." }
  if ((ctx.me?.phone ?? null) === phone) return { ok: true }
  await authDb()("users").where({ id: ctx.user.id }).update({ phone, phoneVerifiedAt: null, updatedAt: new Date(), updatedBy: ctx.user.id })
  await logActivity(ctx.db, { type: "security", action: "member.phone_changed", actorUserId: ctx.user.id, summary: "changed their mobile number", subjectType: "user", subjectId: ctx.user.id })
  return { ok: true }
}
