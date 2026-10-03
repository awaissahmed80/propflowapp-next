import { financePage } from "@/modules/finance/server/context"
import { chargeAccounts, vendorRegister } from "@/modules/finance/server/money-queries"
import { VendorsView } from "@/modules/finance/components/vendors-view"

export const metadata = { title: "Vendors" }

export default async function FinanceVendorsPage() {
  const ctx = await financePage("/finance/vendors", "vendors")
  const edit = ctx.can("edit")
  const [{ vendors, fy }, accounts] = await Promise.all([vendorRegister(ctx), ctx.can("create") || edit ? chargeAccounts(ctx) : []])
  return <VendorsView vendors={vendors} fy={fy} accounts={accounts} can={{ create: ctx.can("create"), edit }} />
}
