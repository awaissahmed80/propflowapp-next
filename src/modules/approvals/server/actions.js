"use server"

import { live } from "@/server/db/records"
import { deskContext } from "@/modules/desk/server/context"
import { HANDLERS } from "./handlers"
import { canDecideType } from "./queries"

// Deciding from the inbox (My Desk › Requests & approvals). Approving runs the action in the app
// the request came from, as the approver. Nobody decides their own request.

const byCode = (ctx, code) =>
  live(ctx.db, "approvals")
    .where({ code: String(code ?? "").toUpperCase() })
    .first()

// decision: "approved" | "rejected" (rejecting needs a note) → { ok, message } or { error }
export async function decideApproval(code, decision, note = "") {
  const ctx = await deskContext("/approvals")
  const a = await byCode(ctx, code)
  if (!a) return { error: "That request was removed." }
  if (a.status !== "pending") return { error: "It has already been decided." }
  if (a.requestedBy === ctx.user.id) return { error: "You asked for this, so someone else needs to decide it." }
  if (!canDecideType(ctx.permissions, a.type)) return { error: "Your role can't decide this kind of request." }
  const handler = HANDLERS[a.type]
  if (decision === "approved") {
    const r = await handler.approve(ctx, a)
    if (r.error) return r
    return { ok: true, message: r.message ?? `Approved: ${a.title}.` }
  }
  const text = String(note ?? "").trim()
  if (!text) return { error: "Say why, so they know what to change." }
  await handler.reject(ctx, a, text.slice(0, 1000))
  return { ok: true, message: `Sent back: ${a.title}.` }
}

// Take back a request you made
export async function withdrawApproval(code) {
  const ctx = await deskContext("/approvals")
  const a = await byCode(ctx, code)
  if (!a || a.status !== "pending") return { error: "It isn't waiting any more." }
  if (a.requestedBy !== ctx.user.id) return { error: "Only the person who asked can withdraw it." }
  await HANDLERS[a.type].withdraw(ctx, a)
  return { ok: true }
}
