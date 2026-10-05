import { notFound } from "next/navigation"
import { hrPage } from "@/modules/hr/server/context"
import { hrNavItem } from "@/modules/hr/nav"
import { listRuns, payrollAccess } from "@/modules/hr/server/payroll-queries"
import { PayrollView } from "@/modules/hr/components/payroll-view"

export const metadata = { title: "Payroll" }

// One run a month: review the draft, approve it, then pay (paying posts the salaries to Finance)
export default async function PayrollPage() {
  const ctx = await hrPage("/hrm/payroll", "payroll")
  const access = payrollAccess(ctx)
  if (!access.open) notFound()
  const nav = hrNavItem("/hrm/payroll")
  return (
    <PayrollView
      runs={await listRuns(ctx, { amounts: access.amounts })}
      title={nav.label}
      description="Review the draft, approve it, then pay. Paying posts the salaries to Finance."
      amounts={access.amounts}
      manage={access.manage}
    />
  )
}
