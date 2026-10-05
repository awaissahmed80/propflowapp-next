import { notFound } from "next/navigation"
import { fromUrlCode } from "@/lib/url"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { hrContext } from "@/modules/hr/server/context"
import { ownPayslip } from "@/modules/hr/server/payroll-queries"
import { PayslipsPrint } from "@/modules/hr/components/payslip-document"

export const metadata = { title: "Print payslip" }

// /my-pay/pr-2026-09/print: my own payslip from a paid run (opens the print dialog on load)
export default async function MyPayslipPrintPage({ params }) {
  const { code } = await params
  const ctx = await hrContext(`/my-pay/${code}/print`)
  if (!ctx.me || !ctx.has("payroll")) notFound()
  const own = await ownPayslip(ctx, fromUrlCode(code), ctx.me.id)
  if (!own) notFound()
  return <PayslipsPrint slips={[own.slip]} run={own.run} brand={await getWorkspaceBrand(ctx.tenant)} />
}
