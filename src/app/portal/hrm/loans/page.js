import { hrPage } from "@/modules/hr/server/context"
import { employeeOptions, listLoans } from "@/modules/hr/server/employee-queries"
import { moneyAccounts } from "@/modules/finance/server/money-queries"
import { LoansView } from "@/modules/hr/components/loans-view"

export const metadata = { title: "Loans & advances" }

export default async function LoansPage() {
  const ctx = await hrPage("/hrm/loans", "payroll")
  const canGive = ctx.can("create") && Boolean(ctx.grant("hr.loans"))
  const [loans, employees, accounts] = await Promise.all([listLoans(ctx), canGive ? employeeOptions(ctx) : [], canGive ? moneyAccounts(ctx) : []])
  return (
    <LoansView
      loans={loans}
      employees={employees.map(({ id, ...e }) => e)}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, bankName: a.bankName, isDefault: a.isDefault }))}
      can={{ give: canGive }}
    />
  )
}
