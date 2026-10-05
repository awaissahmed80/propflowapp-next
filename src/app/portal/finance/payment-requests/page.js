import { getWorkspaceBrand } from "@/server/tenants/brand"
import { financePage } from "@/modules/finance/server/context"
import { moneyAccounts, paymentRequestList, receivableBookings } from "@/modules/finance/server/money-queries"
import { PaymentRequestsView } from "@/modules/finance/components/payment-requests-view"

export const metadata = { title: "Payment requests" }

// /finance/payment-requests (?new=bk-2026-00001 starts a request for that booking, ?open=inv-2627-00001 shows one)
export default async function FinancePaymentRequestsPage({ searchParams }) {
  const ctx = await financePage("/finance/payment-requests", "collections")
  const create = ctx.can("create")
  const [requests, bookings, accounts, brand, q] = await Promise.all([paymentRequestList(ctx), create ? receivableBookings(ctx) : [], moneyAccounts(ctx), getWorkspaceBrand(ctx.tenant), searchParams])
  return <PaymentRequestsView requests={requests} bookings={bookings} accounts={accounts} brand={brand} can={{ create, edit: ctx.can("edit") }} initialNew={q.new ?? null} initialOpen={q.open ?? null} />
}
