import { settingsPage } from "@/modules/settings/context"
import { getBilling } from "@/modules/settings/billing/queries"
import { BillingView } from "@/modules/settings/billing/billing-view"

export const metadata = { title: "Subscription & Billing" }

// The workspace's PropFlow plan, apps, usage and invoices; paying and changing plan
export default async function BillingPage() {
  const ctx = await settingsPage("/settings/billing")
  return <BillingView data={await getBilling(ctx)} workspaceName={ctx.tenant.name} canEdit={ctx.canEdit} />
}
