import "server-only"
import { notify } from "@/server/notifications"

// Events the booking's seller and handler hear about (the bell), besides the timeline
const NOTIFY = {
  receipt: ["Payment received", "money-dollar-circle-line"],
  cleared: ["Cheque cleared", "checkbox-circle-line"],
  bounced: ["Cheque bounced", "close-circle-line"],
  allotted: ["Allotment letter issued", "file-paper-2-line"],
  handover: ["Ready for handover", "key-2-line"],
  completed: ["Possession given", "home-smile-line"],
  cancelled: ["Booking canceled", "close-circle-line"],
  hold: ["Booking on hold changed", "pause-circle-line"],
  assigned: ["Booking handed on", "user-shared-line"],
  approval: ["Approval update", "shield-check-line"],
}

// Add to a booking's timeline (booking_activities), and tell its seller and handler about the
// events above. Call inside the change's transaction.
//   await bookingEvent(trx, ctx, bookingId, "receipt", "Received Rs 500,000 by cheque (RCP-2026-00004)")
export async function bookingEvent(trx, ctx, bookingId, event, notes) {
  const now = new Date()
  const by = ctx?.user?.id ?? null
  await trx("bookingActivities").insert({ bookingId, type: "system", event, notes, by, at: now, createdBy: by })
  const n = NOTIFY[event]
  if (!n) return
  const b = await trx("bookings").where({ id: bookingId }).first("code", "agentId", "soldBy", "customerName")
  if (!b) return
  await notify(trx, [b.soldBy, b.agentId], {
    app: "operations",
    kind: `booking.${event}`,
    title: `${n[0]} · ${b.code}`,
    body: notes,
    href: `/operations/bookings/${b.code.toLowerCase()}`,
    icon: n[1],
    by,
  })
}
