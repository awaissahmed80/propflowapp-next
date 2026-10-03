import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { salesPage } from "@/modules/operations/server/context"
import { financeContext } from "@/modules/finance/server/context"
import { getBooking } from "@/modules/operations/server/queries"
import { BookingDetail } from "@/modules/operations/components/booking-detail"

export async function generateMetadata({ params }) {
  return { title: String((await params).code).toUpperCase() }
}

// /sales/bookings/bk-2026-000001
export default async function SalesBookingPage({ params }) {
  const { code } = await params
  const ctx = await salesPage(`/operations/bookings/${code}`)
  const [booking, brand, marla, finance] = await Promise.all([
    getBooking(ctx, code),
    getWorkspaceBrand(ctx.tenant),
    ctx.db("settings").where({ key: "marla_sq_ft" }).first("value"),
    financeContext(`/operations/bookings/${code}`),
  ])
  if (!booking) notFound()
  // Working it (payments, plan, stages…) is for whoever handles it; its seller follows it: notes,
  // files, and documents until the allotment letter
  const edit = ctx.can("edit")
  const works = edit && booking.access.works
  const can = {
    edit: works,
    notes: edit,
    documents: works || (edit && !booking.allotment),
    // Payments, cheques and cancelling: whoever works it; without the grant they go to Approvals
    receipts: works,
    receiptsDirect: Boolean(ctx.grant("operations.receipts")),
    cheques: works,
    chequesDirect: Boolean(ctx.grant("operations.cheques") || ctx.grant("finance.cheques")),
    allot: works && Boolean(ctx.grant("operations.allot")),
    cancel: works,
    cancelDirect: Boolean(ctx.grant("operations.cancel")),
    // A payment request (invoice) for what's due, in Finance
    paymentRequest: finance.can("create") && finance.has("collections"),
    reassign: edit && Boolean(ctx.grant("operations.reassign")),
    discount: Number(ctx.grant("operations.discount") ?? 0),
  }
  return <BookingDetail booking={booking} can={can} brand={brand} marlaSqft={Number(marla?.value) || 225} />
}
