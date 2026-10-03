import { notFound } from "next/navigation"
import { live } from "@/server/db/records"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { salesPage } from "@/modules/operations/server/context"
import { commissionAccess, commissionRows, listPayouts } from "@/modules/operations/server/commissions"
import { CommissionsView } from "@/modules/operations/components/commissions-view"

export const metadata = { title: "Commissions" }

// Dealer and agent commission: earned, payable, paid and to recover (sales.commissions)
export default async function SalesCommissionsPage({ searchParams }) {
  const ctx = await salesPage("/operations/commissions")
  const access = await commissionAccess(ctx)
  if (access.level === "none") notFound()
  const [{ rows, settings }, payouts, accounts, brand] = await Promise.all([
    commissionRows(ctx),
    listPayouts(ctx),
    live(ctx.db, "accounts").whereIn("kind", ["cash", "bank"]).where({ isActive: true }).orderBy("sortOrder").orderBy("code").select("code", "name", "kind", "bankName", "isDefault"),
    getWorkspaceBrand(ctx.tenant),
  ])
  return (
    <CommissionsView
      rows={rows.map((r) => ({ ...r, bookingId: undefined, partner: { ...r.partner, dealerId: undefined, userId: undefined } }))}
      payouts={payouts}
      accounts={accounts}
      whtPct={settings.dealerWhtPct}
      trigger={settings.commissionTrigger}
      // Without operations.pay-commissions, people who can edit bookings ask for payouts (Approvals)
      canPay={Boolean(ctx.grant("operations.pay-commissions")) || (ctx.can("edit") && access.level === "all")}
      payDirect={Boolean(ctx.grant("operations.pay-commissions"))}
      level={access.level}
      brand={brand}
      initialTab={(await searchParams).tab}
    />
  )
}
