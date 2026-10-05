import { notFound } from "next/navigation"
import { fromUrlCode } from "@/lib/url"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { hrPage } from "@/modules/hr/server/context"
import { financeContext } from "@/modules/finance/server/context"
import { getRun, payrollAccess, payrollAccounts } from "@/modules/hr/server/payroll-queries"
import { monthLabel } from "@/modules/hr/payslip-parts"
import { PayrollRunView } from "@/modules/hr/components/payroll-run-view"

export async function generateMetadata({ params }) {
  const month = fromUrlCode((await params).code).replace(/^PR-/, "")
  return { title: /^\d{4}-\d{2}$/.test(month) ? `${monthLabel(month)} payroll` : "Payroll" }
}

// /hrm/payroll/pr-2026-10?employee=emp-00001 (opens that payslip)
export default async function PayrollRunPage({ params, searchParams }) {
  const [{ code }, sp] = await Promise.all([params, searchParams])
  const ctx = await hrPage(`/hrm/payroll/${code}`, "payroll")
  const access = payrollAccess(ctx)
  if (!access.open) notFound()
  const run = await getRun(ctx, fromUrlCode(code), { amounts: access.amounts })
  if (!run) notFound()
  // Paying: hr.payroll or Finance create may pay; only Finance approvers pay directly, others send it to Approvals
  const fin = await financeContext(`/hrm/payroll/${code}`)
  const pay = Boolean(ctx.grant("hr.payroll")) || fin.can("create")
  const [accounts, brand] = await Promise.all([pay && run.status === "approved" ? payrollAccounts(ctx) : [], getWorkspaceBrand(ctx.tenant)])
  return (
    <PayrollRunView
      run={run}
      accounts={accounts}
      brand={brand}
      can={{ amounts: access.amounts, manage: access.manage, pay, payDirect: fin.can("approve"), finance: fin.can("view") }}
      openEmployee={sp?.employee ?? null}
    />
  )
}
