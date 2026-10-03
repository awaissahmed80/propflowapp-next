import { getWorkspaceBrand } from "@/server/tenants/brand"
import { financePage } from "@/modules/finance/server/context"
import { financeNavItem, financeOverview, voucherFormData } from "@/modules/finance/server/queries"
import { FinanceOverview } from "@/modules/finance/components/overview-view"

export const metadata = { title: "Overview" }

// Finance home: cash and bank, cheques in clearing, what buyers owe and what's owed, money in and
// out over six months, the latest vouchers and what's waiting for approval
export default async function FinanceOverviewPage() {
  const ctx = await financePage("/finance")
  const canCreate = ctx.can("create")
  const [data, form, brand] = await Promise.all([financeOverview(ctx), canCreate ? voucherFormData(ctx) : null, getWorkspaceBrand(ctx.tenant)])
  return (
    <FinanceOverview
      data={data}
      form={form}
      brand={brand}
      description={financeNavItem("/finance").description}
      can={{ create: canCreate, post: ctx.can("approve"), void: ctx.can("edit") && Boolean(ctx.grant("finance.void")) }}
    />
  )
}
