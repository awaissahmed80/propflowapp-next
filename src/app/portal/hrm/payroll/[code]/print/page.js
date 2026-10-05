import { notFound } from "next/navigation"
import { fromUrlCode } from "@/lib/url"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { hrPage } from "@/modules/hr/server/context"
import { payslipsToPrint } from "@/modules/hr/server/payroll-queries"
import { PayslipsPrint } from "@/modules/hr/components/payslip-document"

export const metadata = { title: "Print payslips" }

// /hrm/payroll/pr-2026-10/print (every payslip) or ?employee=emp-00001 (one); opens the print dialog on load
export default async function PayslipsPrintPage({ params, searchParams }) {
  const [{ code }, sp] = await Promise.all([params, searchParams])
  const ctx = await hrPage(`/hrm/payroll/${code}/print`, "payroll")
  const out = await payslipsToPrint(ctx, fromUrlCode(code), sp?.employee ?? null)
  if (!out) notFound()
  return <PayslipsPrint slips={out.slips} run={out.run} brand={await getWorkspaceBrand(ctx.tenant)} />
}
