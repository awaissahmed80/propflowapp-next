import { notFound } from "next/navigation"
import { hrPage } from "@/modules/hr/server/context"
import { hrRules } from "@/modules/hr/server/payroll"
import { PayrollRulesView } from "@/modules/hr/components/payroll-rules-view"

export const metadata = { title: "Payroll rules" }

// Tax slabs, minimum wage, EOBI, provident fund, medical exemption and yearly leave (hr.payroll)
export default async function PayrollRulesPage() {
  const ctx = await hrPage("/hrm/customize/rules")
  if (!ctx.grant("hr.payroll")) notFound()
  return <PayrollRulesView rules={await hrRules(ctx.db)} canEdit={ctx.can("edit")} />
}
