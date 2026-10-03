import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { ensureContact, relinkContact } from "@/modules/contacts/server/links"
import { bookingEvent } from "@/modules/operations/server/activity"

// The steps that change ownership or close a request, shared by the Care actions and by the
// approvals inbox (a transfer sent for approval completes when it's approved).
//   ctx: { db, user } (user.id is who did it)

const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

// Add to a request's timeline
export function requestEvent(trx, requestId, kind, text, by) {
  return trx("serviceRequestEvents").insert({ requestId, kind, text: String(text).slice(0, 4000), by: by ?? null, at: new Date() })
}

// Complete a transfer: the purchaser becomes the file's owner (a contact, linked as customer), the
// seller is kept on the request, and a transfer letter number is given → { ok, letterNo } | { error }
export async function performTransfer(ctx, requestId) {
  const r = await live(ctx.db, "serviceRequests").where({ id: requestId }).first()
  if (!r || r.type !== "transfer") return { error: "That transfer was removed." }
  if (["completed", "rejected"].includes(r.status)) return { error: "This transfer is already closed." }
  const data = json(r.data, {})
  const to = data.to ?? {}
  if (!to.name || !to.phone) return { error: "Add the purchaser's name and mobile first." }
  const b = await live(ctx.db, "bookings").where({ id: r.bookingId }).first("id", "code", "contactId", "customerName", "customerPhone")
  if (!b) return { error: "The file was removed." }
  const seller = b.contactId ? await live(ctx.db, "contacts").where({ id: b.contactId }).first("name", "phone", "cnic", "guardianRelation", "guardianName", "address") : null
  let letterNo
  await ctx.db.transaction(async (trx) => {
    const buyerId = await ensureContact(trx, { name: to.name, phone: to.phone }, ctx.user.id)
    // The purchaser's own details, filled where the contact doesn't have them yet
    const fill = Object.fromEntries(
      Object.entries({ cnic: to.cnic, guardianRelation: to.relation, guardianName: to.guardian, address: to.address })
        .filter(([, v]) => v)
        .map(([k, v]) => [k, String(v).slice(0, 200)]),
    )
    if (Object.keys(fill).length)
      await trx("contacts")
        .where({ id: buyerId })
        .update({ ...fill, updatedAt: new Date(), updatedBy: ctx.user.id })
    await trx("bookings").where({ id: b.id }).update({ contactId: buyerId, customerName: to.name, customerPhone: to.phone, updatedAt: new Date(), updatedBy: ctx.user.id })
    await relinkContact(trx, buyerId, { type: "booking", id: b.id, role: "customer" }, ctx.user.id)
    letterNo = await nextCode(trx, "transfer-letter")
    const from = seller
      ? { name: seller.name, phone: seller.phone, cnic: seller.cnic, relation: seller.guardianRelation, guardian: seller.guardianName, address: seller.address }
      : { name: b.customerName, phone: b.customerPhone }
    const now = new Date()
    await trx("serviceRequests")
      .where({ id: r.id })
      .update({ status: "completed", closedAt: now, data: JSON.stringify({ ...data, from, toContactId: buyerId, completedAt: now, letterNo }), updatedAt: now, updatedBy: ctx.user.id })
    await requestEvent(trx, r.id, "system", `Transfer completed: the file is now in ${to.name}'s name (${letterNo})`, ctx.user.id)
    await bookingEvent(trx, ctx, b.id, "assigned", `Transferred from ${from.name ?? "the previous owner"} to ${to.name} (${r.code}, ${letterNo})`)
  })
  await logActivity(ctx.db, { type: "estate", action: "transfer.completed", actorUserId: ctx.user.id, summary: `transferred ${b.code} to ${to.name} (${r.code})` })
  return { ok: true, letterNo }
}

// Close any open approval request for a transfer (it completed or was rejected another way)
export async function closeTransferApproval(db, requestId, userId, status = "withdrawn") {
  await db("approvals").where({ subjectType: "service-request", subjectId: requestId, status: "pending" }).update({ status, decidedBy: userId, decidedAt: new Date(), updatedAt: new Date(), updatedBy: userId })
}
