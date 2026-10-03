import { financePage } from "@/modules/finance/server/context"
import { financeReceipts, moneyAccounts, projectOptions, receivableBookings } from "@/modules/finance/server/money-queries"
import { ReceiptsView } from "@/modules/finance/components/receipts-view"

export const metadata = { title: "Receipts" }

// /finance/receipts (?open=rcp-2026-00001 opens one)
export default async function FinanceReceiptsPage({ searchParams }) {
  const ctx = await financePage("/finance/receipts", "collections")
  const create = ctx.can("create")
  const [receipts, bookings, accounts, projects, q] = await Promise.all([financeReceipts(ctx), create ? receivableBookings(ctx) : [], moneyAccounts(ctx), projectOptions(ctx), searchParams])
  // Posting at once needs finance.approve or the Operations receipts grant; otherwise it waits in Approvals
  const can = { create, post: ctx.can("approve") || Boolean(ctx.grant("operations.receipts")) }
  return <ReceiptsView receipts={receipts} bookings={bookings} accounts={accounts} projects={projects} can={can} initialOpen={q.open ?? null} />
}
