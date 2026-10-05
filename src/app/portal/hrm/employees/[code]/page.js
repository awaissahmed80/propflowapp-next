import { notFound } from "next/navigation"
import { live } from "@/server/db/records"
import { hrPage } from "@/modules/hr/server/context"
import { employeeOptions, getEmployee, leaveBalances, linkableMembers } from "@/modules/hr/server/employee-queries"
import { EmployeeDetail } from "@/modules/hr/components/employee-detail"

export async function generateMetadata({ params }) {
  return { title: decodeURIComponent((await params).code).toUpperCase() }
}

// /hrm/employees/emp-00001 · one employee: pay, leave, personal and job details, loans, payslips
export default async function EmployeePage({ params }) {
  const { code } = await params
  const ctx = await hrPage(`/hrm/employees/${code}`)
  const employee = await getEmployee(ctx, decodeURIComponent(code))
  if (!employee) notFound()
  const edit = ctx.can("edit")
  const [teams, projects, members] = await Promise.all([
    edit ? live(ctx.db, "teams").orderBy("sortOrder").select("id", "name") : [],
    edit ? live(ctx.db, "projects").orderBy("name").select("code", "name") : [],
    edit ? linkableMembers(ctx) : [],
  ])
  // Leave can be applied for by them, or by anyone who can add HR records
  const canLeave = ctx.has("leave") && employee.status === "active" && (employee.isMe || ctx.can("create"))
  const options = canLeave ? (await employeeOptions(ctx)).filter((e) => e.code === employee.code) : []
  const balances = canLeave ? await leaveBalances(ctx, options) : {}
  const people = options.map(({ id, ...o }) => o)
  return (
    <EmployeeDetail
      employee={employee}
      teams={teams}
      projects={projects}
      members={members}
      leave={canLeave ? { employees: people, balances } : null}
      can={{
        edit,
        create: ctx.can("create"),
        pay: Boolean(ctx.grant("hr.salaries")),
        approveLeave: Boolean(ctx.grant("hr.approve-leave")),
        payroll: ctx.has("payroll"),
      }}
    />
  )
}
