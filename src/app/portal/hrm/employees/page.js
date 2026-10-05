import { hrPage } from "@/modules/hr/server/context"
import { listEmployees } from "@/modules/hr/server/employee-queries"
import { EmployeesView } from "@/modules/hr/components/employees-view"

export const metadata = { title: "Employees" }

export default async function EmployeesPage() {
  const ctx = await hrPage("/hrm/employees")
  const data = await listEmployees(ctx)
  return <EmployeesView data={data} can={{ create: ctx.can("create"), export: ctx.can("export"), pay: Boolean(ctx.grant("hr.salaries")) }} />
}
