import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { salesPage } from "@/modules/operations/server/context"
import { listPayouts } from "@/modules/operations/server/commissions"
import { PayoutPrint } from "@/modules/operations/components/commissions-view"

export const metadata = { title: "Print" }

// ?payout=po-2026-00001 (opens the print dialog on load)
export default async function CommissionPrintPage({ searchParams }) {
  const ctx = await salesPage("/operations/commissions")
  const code = String((await searchParams).payout ?? "").toUpperCase()
  const payout = (await listPayouts(ctx)).find((p) => p.code === code)
  if (!payout) notFound()
  return <PayoutPrint payout={payout} brand={await getWorkspaceBrand(ctx.tenant)} />
}
