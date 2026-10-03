import { financePage } from "@/modules/finance/server/context"
import { moneyAccounts, refundRegister } from "@/modules/finance/server/money-queries"
import { RefundsView } from "@/modules/finance/components/refunds-view"

export const metadata = { title: "Refunds" }

export default async function FinanceRefundsPage() {
  const ctx = await financePage("/finance/refunds")
  const [rows, accounts] = await Promise.all([refundRegister(ctx), moneyAccounts(ctx)])
  // Without finance.refunds a refund goes to Approvals
  const can = { pay: ctx.can("create"), direct: Boolean(ctx.grant("finance.refunds")) }
  return <RefundsView rows={rows} accounts={accounts} can={can} />
}
