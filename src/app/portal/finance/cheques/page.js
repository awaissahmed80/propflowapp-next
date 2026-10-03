import { financePage } from "@/modules/finance/server/context"
import { chequeRegister } from "@/modules/finance/server/money-queries"
import { ChequesView } from "@/modules/finance/components/cheques-view"

export const metadata = { title: "Cheques" }

export default async function FinanceChequesPage() {
  const ctx = await financePage("/finance/cheques", "banking")
  const { clearing, history } = await chequeRegister(ctx)
  // Without a cheques grant (Finance or Operations) clearing and bouncing go to Approvals
  const can = { act: ctx.can("create"), direct: Boolean(ctx.grant("finance.cheques") || ctx.grant("operations.cheques")) }
  return <ChequesView clearing={clearing} history={history} can={can} />
}
