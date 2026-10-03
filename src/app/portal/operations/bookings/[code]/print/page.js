import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { salesPage } from "@/modules/operations/server/context"
import { getBooking } from "@/modules/operations/server/queries"
import { SalesPrint } from "@/modules/operations/components/sales-print"

export const metadata = { title: "Print" }

// ?doc=statement | allotment | receipt&receipt=rcp-2026-00001 (opens the print dialog on load)
export default async function SalesBookingPrintPage({ params, searchParams }) {
  const [{ code }, q] = await Promise.all([params, searchParams])
  const ctx = await salesPage(`/operations/bookings/${code}`)
  const booking = await getBooking(ctx, code)
  if (!booking) notFound()
  return <SalesPrint doc={q.doc} booking={booking} receiptCode={q.receipt} brand={await getWorkspaceBrand(ctx.tenant)} />
}
