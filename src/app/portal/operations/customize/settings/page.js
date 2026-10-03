import { notFound } from "next/navigation"
import { salesPage } from "@/modules/operations/server/context"
import { canEditSalesRules, salesSettings } from "@/modules/operations/server/settings"
import { SalesSettingsView } from "@/modules/operations/components/sales-settings-view"

export const metadata = { title: "Rules & commissions" }

export default async function SalesSettingsPage() {
  const ctx = await salesPage("/operations/customize/settings")
  if (!canEditSalesRules(ctx)) notFound()
  return <SalesSettingsView settings={await salesSettings(ctx.db)} />
}
