import { financePage } from "@/modules/finance/server/context"
import { chartOfAccounts, financeNavItem } from "@/modules/finance/server/queries"
import { ChartView } from "@/modules/finance/components/chart-view"

export const metadata = { title: "Chart of accounts" }

// Every account under its heading with its balance today; headings total what's under them
export default async function ChartOfAccountsPage() {
  const ctx = await financePage("/finance/accounts")
  const chart = await chartOfAccounts(ctx)
  const nav = financeNavItem("/finance/accounts")
  return <ChartView rows={chart.rows} totals={chart.totals} title={nav.label} description={nav.description} canEdit={ctx.can("edit")} />
}
