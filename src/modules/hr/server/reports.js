import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { labelOf } from "@/modules/lookups/options"
import { vizColor } from "@/lib/chart-colors"
import { scoped } from "./context"
import { hrRules, loansLeft } from "./payroll"
import { monthLabel } from "../payslip-parts"
import { isOwner } from "../constants"

// HR & Payroll's ready-made reports, in the shape lib/reports.js describes (same table, chart,
// print, PDF and Excel as the other apps). Only employees this person may see count (HR scope);
// reports with amounts (pay: true) need hr.salaries, and payroll, leave and attendance reports
// need that feature in the plan. Payroll figures come from paid runs only (except the register,
// which shows whichever run is picked).
// load(ctx, values, env): values are the URL's filter values (lowercased); env the resolved ones:
//   { range: { from, to, fromMonth, toMonth, label }, runs, year }

const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null)
const isoDay = (d) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(d)) : null)
// Dates from MySQL DATE columns (read as UTC midnight) → "2026-10-04"
const dateOnly = (d) => {
  if (!d) return null
  if (typeof d === "string") return d.slice(0, 10)
  return new Date(d).toISOString().slice(0, 10)
}
const lastDay = (month) => {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
const addMonths = (month, n) => {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
// Days of a date range inside another (both inclusive)
const overlapDays = (a1, a2, b1, b2) => {
  const s = a1 > b1 ? a1 : b1
  const e = a2 < b2 ? a2 : b2
  return e < s ? 0 : Math.round((new Date(`${e}T00:00:00Z`) - new Date(`${s}T00:00:00Z`)) / 86_400_000) + 1
}
const monthsOf = (fromMonth, toMonth) => {
  const out = []
  for (let m = fromMonth; m <= toMonth && out.length < 36; m = addMonths(m, 1)) out.push(m)
  return out
}

// Periods (Pakistan time). Payroll follows the tax year, July to June.
const PERIODS = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "this-year": "This calendar year",
  "last-year": "Last calendar year",
  "last-tax-year": "Last tax year",
}
function periodRange(value, today = isoDay(new Date())) {
  const month = today.slice(0, 7)
  const [y, m] = month.split("-").map(Number)
  const taxStart = m >= 7 ? `${y}-07` : `${y - 1}-07`
  const months = {
    "this-month": [month, month],
    "last-month": [addMonths(month, -1), addMonths(month, -1)],
    "last-3-months": [addMonths(month, -3), addMonths(month, -1)],
    "this-year": [`${y}-01`, `${y}-12`],
    "last-year": [`${y - 1}-01`, `${y - 1}-12`],
    "last-tax-year": [addMonths(taxStart, -12), addMonths(taxStart, -1)],
  }[value] ?? [taxStart, addMonths(taxStart, 11)]
  const [fromMonth, toMonth] = months
  return { fromMonth, toMonth, from: `${fromMonth}-01`, to: lastDay(toMonth), label: PERIODS[value] ?? "This tax year" }
}

// The employees this person may see, with what the reports need
const employeesFor = (ctx) =>
  scoped(ctx, live(ctx.db, "employees")).orderBy("name").select("id", "code", "name", "cnic", "ntn", "eobiNo", "designation", "department", "projectId", "employmentType", "joinedOn", "leftOn", "status", "payMethod")

// Paid payroll lines of the employees given, for months from…to → lines with { month }
async function paidLines(ctx, ids, fromMonth, toMonth) {
  if (!ids.length) return []
  return ctx
    .db("payrollLines as l")
    .join("payrollRuns as r", "r.id", "l.runId")
    .whereNull("r.deletedAt")
    .where("r.status", "paid")
    .whereBetween("r.month", [fromMonth, toMonth])
    .whereIn("l.employeeId", ids)
    .select("l.*", "r.month")
}

const noPeople = "No employees you can see."

export const REPORT_GROUPS = ["People", "Payroll", "Time off & attendance"]

export const REPORTS = [
  // ---------------------------------------------------------------- People
  {
    id: "headcount",
    group: "People",
    title: "Headcount",
    description: "People on the payroll by department, designation, project or type, with joiners and leavers in the period.",
    icon: "team-line",
    filters: ["period", "by"],
    async load(ctx, values, env) {
      const [emps, lists, projects] = await Promise.all([employeesFor(ctx), getLookups(ctx.db, ["designation", "department", "employment-type"]), live(ctx.db, "projects").select("id", "name")])
      const today = isoDay(new Date())
      const end = env.range.to < today ? env.range.to : today
      const { from } = env.range
      const by = values.by || "department"
      const keyOf = (e) =>
        by === "designation"
          ? (labelOf(lists.designation, e.designation) ?? e.designation ?? "No designation")
          : by === "project"
            ? e.projectId
              ? (projects.find((p) => p.id === e.projectId)?.name ?? "Project")
              : "Head office"
            : by === "type"
              ? (labelOf(lists["employment-type"], e.employmentType) ?? e.employmentType ?? "—")
              : (labelOf(lists.department, e.department) ?? e.department ?? "No department")
      const groups = new Map()
      // Headcount leaves owners and directors out
      for (const e of emps.filter((x) => !isOwner(x.employmentType))) {
        const joined = dateOnly(e.joinedOn)
        const left = dateOnly(e.leftOn)
        const g = groups.get(keyOf(e)) ?? { start: 0, joiners: 0, leavers: 0, end: 0 }
        if (joined < from && (!left || left >= from)) g.start++
        if (joined >= from && joined <= end) g.joiners++
        if (left && left >= from && left <= end) g.leavers++
        if (joined <= end && (!left || left > end)) g.end++
        groups.set(keyOf(e), g)
      }
      const rows = [...groups.entries()]
        .filter(([, g]) => g.start || g.joiners || g.leavers || g.end)
        .map(([name, g]) => ({ id: name, name, ...g }))
        .sort((a, b) => b.end - a.end || a.name.localeCompare(b.name))
      const total = { start: sum(rows, (r) => r.start), joiners: sum(rows, (r) => r.joiners), leavers: sum(rows, (r) => r.leavers), end: sum(rows, (r) => r.end) }
      const chart = rows.length > 1 ? { kind: "bar", title: "Headcount at the end of the period", categoryKey: "name", valueKey: "end", valueLabel: "People", data: rows.map((r) => ({ name: r.name, end: r.end })) } : null
      if (rows.length) rows.push({ id: "total", name: "Total", ...total })
      return {
        columns: [
          { key: "name", header: { designation: "Designation", project: "Project", type: "Employment type" }[by] ?? "Department", width: 28 },
          { key: "start", header: "At the start", type: "number", width: 12 },
          { key: "joiners", header: "Joined", type: "number", width: 10 },
          { key: "leavers", header: "Left", type: "number", width: 10 },
          { key: "end", header: "At the end", type: "number", width: 12 },
        ],
        rows,
        summary: [
          { label: "Headcount", value: number(total.end) },
          { label: "Joined", value: number(total.joiners) },
          { label: "Left", value: number(total.leavers) },
          { label: "Turnover", value: total.start + total.end ? `${pct(total.leavers, (total.start + total.end) / 2)}%` : "—" },
        ],
        chart,
        note: emps.length ? null : noPeople,
      }
    },
  },

  // ---------------------------------------------------------------- Payroll
  {
    id: "payroll-register",
    group: "Payroll",
    title: "Payroll register",
    description: "One month's payroll: each employee's gross, deductions and net pay.",
    icon: "money-rupee-circle-line",
    feature: "payroll",
    pay: true,
    filters: ["run"],
    async load(ctx, values, env) {
      const run = env.runs.find((r) => r.code.toLowerCase() === values.run) ?? env.runs[0]
      const columns = [
        { key: "code", header: "Code", width: 10 },
        { key: "name", header: "Employee", width: 24 },
        { key: "gross", header: "Gross", type: "pkr", width: 13 },
        { key: "bonus", header: "Bonus", type: "pkr", width: 11 },
        { key: "unpaid", header: "Unpaid days", type: "pkr", width: 12 },
        { key: "tax", header: "Tax", type: "pkr", width: 11 },
        { key: "eobi", header: "EOBI", type: "pkr", width: 9 },
        { key: "pf", header: "PF", type: "pkr", width: 10 },
        { key: "loan", header: "Loans", type: "pkr", width: 11 },
        { key: "other", header: "Other", type: "pkr", width: 10 },
        { key: "net", header: "Net pay", type: "pkr", width: 13 },
        { key: "method", header: "Paid by", width: 8 },
      ]
      if (!run) return { columns, rows: [], summary: [], note: "No payroll runs yet." }
      const lines = await scoped(ctx, ctx.db("payrollLines as l").join("employees as e", "e.id", "l.employeeId").where("l.runId", run.id), "e")
        .orderBy("e.name")
        .select("l.*", "e.code", "e.name")
      const rows = lines.map((l) => ({
        id: l.code,
        code: l.code,
        name: l.name,
        gross: Number(l.gross),
        bonus: Number(l.bonus) || null,
        unpaid: Number(l.unpaidDeduction) || null,
        tax: Number(l.tax) || null,
        eobi: Number(l.eobi) || null,
        pf: Number(l.pf) || null,
        loan: Number(l.loan) || null,
        other: Number(l.otherDeduction) || null,
        net: Number(l.net),
        method: l.payMethod === "cash" ? "Cash" : "Bank",
      }))
      const keys = ["gross", "bonus", "unpaid", "tax", "eobi", "pf", "loan", "other", "net"]
      const total = Object.fromEntries(keys.map((k) => [k, sum(rows, (r) => r[k])]))
      const deductions = total.unpaid + total.tax + total.eobi + total.pf + total.loan + total.other
      if (rows.length) rows.push({ id: "total", code: "", name: "Total", ...total, method: "" })
      return {
        columns,
        rows,
        summary: [
          { label: "People", value: number(lines.length) },
          { label: "Gross with bonuses", value: rs(total.gross + total.bonus) },
          { label: "Deductions", value: rs(deductions) },
          { label: "Net pay", value: rs(total.net) },
        ],
        note: run.status === "paid" ? null : `${monthLabel(run.month)} isn't paid yet (${run.status}): amounts may still change.`,
      }
    },
  },
  {
    id: "salary-tax",
    group: "Payroll",
    title: "Salary tax withheld",
    description: "Income tax deducted from salaries each month, per employee, for depositing with FBR and the annual statement.",
    icon: "government-line",
    feature: "payroll",
    pay: true,
    filters: ["period"],
    async load(ctx, values, env) {
      const emps = await employeesFor(ctx)
      const lines = await paidLines(
        ctx,
        emps.map((e) => e.id),
        env.range.fromMonth,
        env.range.toMonth,
      )
      const months = [...new Set(lines.map((l) => l.month))].sort()
      const rows = emps
        .map((e) => {
          const own = lines.filter((l) => l.employeeId === e.id)
          const row = { id: e.code, code: e.code, name: e.name, cnic: e.cnic, ntn: e.ntn, taxable: sum(own, (l) => l.taxable), total: sum(own, (l) => l.tax) }
          for (const m of months)
            row[`m${m}`] =
              sum(
                own.filter((l) => l.month === m),
                (l) => l.tax,
              ) || null
          return row
        })
        .filter((r) => r.total > 0)
      const byMonth = months.map((m) => ({
        month: monthLabel(m, true),
        tax: sum(
          lines.filter((l) => l.month === m),
          (l) => l.tax,
        ),
      }))
      const total = sum(rows, (r) => r.total)
      if (rows.length) rows.push({ id: "total", code: "", name: "Total", taxable: sum(rows, (r) => r.taxable), total, ...Object.fromEntries(months.map((m, i) => [`m${m}`, byMonth[i].tax])) })
      return {
        columns: [
          { key: "code", header: "Code", width: 10 },
          { key: "name", header: "Employee", width: 22 },
          { key: "cnic", header: "CNIC", width: 15 },
          { key: "ntn", header: "NTN", width: 10 },
          ...months.map((m) => ({ key: `m${m}`, header: monthLabel(m, true), type: "pkr", width: 11 })),
          { key: "taxable", header: "Taxable salary", type: "pkr", width: 14 },
          { key: "total", header: "Tax withheld", type: "pkr", width: 13 },
        ],
        rows,
        summary: [
          { label: "Tax withheld", value: rs(total) },
          { label: "Employees taxed", value: number(Math.max(0, rows.length - 1)) },
          { label: "Months paid", value: number(months.length) },
          { label: "Average a month", value: months.length ? rs(total / months.length) : "—" },
        ],
        chart: byMonth.length > 1 ? { kind: "bar", title: "Tax withheld by month", categoryKey: "month", valueKey: "tax", valueLabel: "Tax", money: true, data: byMonth } : null,
        note: lines.length ? "Tax withheld from salaries in a month is deposited with FBR by the 15th of the next month." : "No paid payroll in this period.",
      }
    },
  },
  {
    id: "eobi-pf",
    group: "Payroll",
    title: "EOBI & provident fund",
    description: "EOBI and provident fund each month: the employees' share deducted and the employer's share on top.",
    icon: "shield-user-line",
    feature: "payroll",
    pay: true,
    filters: ["period"],
    async load(ctx, values, env) {
      const emps = await employeesFor(ctx)
      const lines = await paidLines(
        ctx,
        emps.map((e) => e.id),
        env.range.fromMonth,
        env.range.toMonth,
      )
      const months = monthsOf(env.range.fromMonth, env.range.toMonth).filter((m) => lines.some((l) => l.month === m))
      const rows = months.map((m) => {
        const own = lines.filter((l) => l.month === m)
        const r = {
          id: m,
          month: monthLabel(m),
          people: own.filter((l) => Number(l.eobi) || Number(l.pf)).length,
          eobi: sum(own, (l) => l.eobi),
          eobiEmployer: sum(own, (l) => l.eobiEmployer),
          pf: sum(own, (l) => l.pf),
          pfEmployer: sum(own, (l) => l.pfEmployer),
        }
        return { ...r, total: r.eobi + r.eobiEmployer + r.pf + r.pfEmployer }
      })
      const keys = ["eobi", "eobiEmployer", "pf", "pfEmployer", "total"]
      const total = Object.fromEntries(keys.map((k) => [k, sum(rows, (r) => r[k])]))
      const chartData = rows.map((r) => ({ month: monthLabel(r.id, true), eobi: r.eobi + r.eobiEmployer, pf: r.pf + r.pfEmployer }))
      if (rows.length) rows.push({ id: "total", month: "Total", people: null, ...total })
      return {
        columns: [
          { key: "month", header: "Month", width: 16 },
          { key: "people", header: "People", type: "number", width: 8 },
          { key: "eobi", header: "EOBI (employees)", type: "pkr", width: 15 },
          { key: "eobiEmployer", header: "EOBI (employer)", type: "pkr", width: 15 },
          { key: "pf", header: "PF (employees)", type: "pkr", width: 15 },
          { key: "pfEmployer", header: "PF (employer)", type: "pkr", width: 15 },
          { key: "total", header: "To deposit", type: "pkr", width: 15 },
        ],
        rows,
        summary: [
          { label: "EOBI", value: rs(total.eobi + total.eobiEmployer) },
          { label: "Provident fund", value: rs(total.pf + total.pfEmployer) },
          { label: "Employer's share", value: rs(total.eobiEmployer + total.pfEmployer) },
          { label: "Total to deposit", value: rs(total.total) },
        ],
        chart:
          chartData.length > 1
            ? {
                kind: "bars",
                title: "By month",
                categoryKey: "month",
                money: true,
                series: [
                  { key: "eobi", label: "EOBI", color: vizColor("blue") },
                  { key: "pf", label: "Provident fund", color: vizColor("teal") },
                ],
                data: chartData,
              }
            : null,
        note: lines.length ? null : "No paid payroll in this period.",
      }
    },
  },
  {
    id: "loans-outstanding",
    group: "Payroll",
    title: "Loans outstanding",
    description: "Loans and salary advances still being recovered through payroll: given, recovered and left.",
    icon: "hand-coin-line",
    feature: "payroll",
    pay: true,
    filters: [],
    async load(ctx) {
      const emps = await employeesFor(ctx)
      const byId = new Map(emps.map((e) => [e.id, e]))
      const loans = (await loansLeft(ctx.db, [...byId.keys()])).filter((l) => l.left > 0)
      const given = loans.length
        ? await ctx
            .db("loans")
            .whereIn(
              "id",
              loans.map((l) => l.id),
            )
            .select("id", "kind", "givenAt")
        : []
      const rows = loans
        .map((l) => {
          const g = given.find((x) => x.id === l.id)
          const e = byId.get(l.employeeId)
          return {
            id: l.code,
            code: l.code,
            name: e?.name ?? "—",
            kind: g?.kind === "loan" ? "Loan" : "Advance",
            givenOn: g?.givenAt ? isoDay(g.givenAt) : null,
            amount: Number(l.amount),
            recovered: Number(l.recovered),
            left: Number(l.left),
            installment: Number(l.installment),
            months: Math.ceil(Number(l.left) / Math.max(1, Number(l.installment))),
          }
        })
        .sort((a, b) => b.left - a.left)
      const total = { amount: sum(rows, (r) => r.amount), recovered: sum(rows, (r) => r.recovered), left: sum(rows, (r) => r.left), installment: sum(rows, (r) => r.installment) }
      if (rows.length) rows.push({ id: "total", code: "", name: "Total", kind: "", givenOn: null, ...total, months: null })
      return {
        columns: [
          { key: "code", header: "Code", width: 10 },
          { key: "name", header: "Employee", width: 24 },
          { key: "kind", header: "Kind", width: 9 },
          { key: "givenOn", header: "Given on", width: 11 },
          { key: "amount", header: "Amount", type: "pkr", width: 13 },
          { key: "recovered", header: "Recovered", type: "pkr", width: 13 },
          { key: "left", header: "Left", type: "pkr", width: 13 },
          { key: "installment", header: "A month", type: "pkr", width: 12 },
          { key: "months", header: "Months left", type: "number", width: 10 },
        ],
        rows,
        summary: [
          { label: "Still to recover", value: rs(total.left) },
          { label: "Recovered so far", value: rs(total.recovered) },
          { label: "Recovered a month", value: rs(total.installment) },
          { label: "Open loans", value: number(loans.length) },
        ],
        note: loans.length ? null : "No loans or advances being recovered.",
      }
    },
  },

  // ---------------------------------------------------------------- Time off & attendance
  {
    id: "leave-register",
    group: "Time off & attendance",
    title: "Leave register",
    description: "Approved leave taken in a year by type, and each person's annual, casual and sick leave left.",
    icon: "calendar-check-line",
    feature: "leave",
    filters: ["year"],
    async load(ctx, values, env) {
      const [emps, lists, rules] = await Promise.all([employeesFor(ctx), getLookups(ctx.db, ["leave-type"]), hrRules(ctx.db)])
      const from = `${env.year}-01-01`
      const to = `${env.year}-12-31`
      const leave = emps.length
        ? await live(ctx.db, "leaveRequests")
            .whereIn(
              "employeeId",
              emps.map((e) => e.id),
            )
            .where({ status: "approved" })
            .where("startOn", "<=", to)
            .where("endOn", ">=", from)
            .select("employeeId", "type", "startOn", "endOn", "days")
        : []
      const types = lists["leave-type"].filter((t) => t.isActive || leave.some((l) => l.type === t.value))
      const allowed = Object.keys(rules.leave).filter((k) => types.some((t) => t.value === k))
      const rows = emps
        .filter((e) => dateOnly(e.joinedOn) <= to && (!e.leftOn || dateOnly(e.leftOn) >= from))
        .map((e) => {
          const own = leave.filter((l) => l.employeeId === e.id)
          const row = { id: e.code, code: e.code, name: e.name }
          let total = 0
          for (const t of types) {
            const days = sum(
              own.filter((l) => l.type === t.value),
              (l) => {
                const s = dateOnly(l.startOn)
                const en = dateOnly(l.endOn)
                // Leave inside the year counts as recorded (half days); spanning years, the days in it
                return s >= from && en <= to ? Number(l.days) : overlapDays(s, en, from, to)
              },
            )
            row[t.value] = days || null
            total += days
          }
          for (const k of allowed) row[`left-${k}`] = Math.max(0, Number(rules.leave[k]) - (row[k] ?? 0))
          row.total = total || null
          return row
        })
      const totals = Object.fromEntries(types.map((t) => [t.value, sum(rows, (r) => r[t.value])]))
      const chart = types.some((t) => totals[t.value])
        ? { kind: "bar", title: "Days taken by type", categoryKey: "type", valueKey: "days", valueLabel: "Days", data: types.map((t) => ({ type: t.label, days: totals[t.value] })) }
        : null
      const taken = sum(rows, (r) => r.total)
      if (rows.length) rows.push({ id: "total", code: "", name: "Total", ...totals, total: taken })
      return {
        columns: [
          { key: "code", header: "Code", width: 10 },
          { key: "name", header: "Employee", width: 24 },
          ...types.map((t) => ({ key: t.value, header: t.label, type: "number", width: 10 })),
          { key: "total", header: "Days taken", type: "number", width: 10 },
          ...allowed.map((k) => ({ key: `left-${k}`, header: `${types.find((t) => t.value === k)?.label ?? k} left`, type: "number", width: 12 })),
        ],
        rows,
        summary: [
          { label: "Days taken", value: number(taken) },
          { label: "People who took leave", value: number(rows.filter((r) => r.id !== "total" && r.total).length) },
          { label: "Unpaid days", value: number(totals.unpaid ?? 0) },
          { label: "Allowance a year", value: allowed.map((k) => `${rules.leave[k]} ${k}`).join(" · ") || "—" },
        ],
        chart,
        note: emps.length ? `Leave left is the yearly allowance (Customize › Payroll rules) less approved leave in ${env.year}.` : noPeople,
      }
    },
  },
  {
    id: "attendance-summary",
    group: "Time off & attendance",
    title: "Attendance summary",
    description: "Days marked present, late and absent for each person on the roster in a period.",
    icon: "fingerprint-line",
    feature: "attendance",
    filters: ["period"],
    async load(ctx, values, env) {
      const emps = await employeesFor(ctx)
      const marks = emps.length
        ? await ctx
            .db("attendance")
            .whereIn(
              "employeeId",
              emps.map((e) => e.id),
            )
            .whereBetween("onDate", [env.range.from, env.range.to])
            .groupBy("employeeId", "status")
            .select("employeeId", "status")
            .count({ n: "*" })
        : []
      const n = (id, status) => Number(marks.find((m) => m.employeeId === id && m.status === status)?.n ?? 0)
      const rows = emps
        .map((e) => {
          const present = n(e.id, "present")
          const late = n(e.id, "late")
          const absent = n(e.id, "absent")
          const marked = present + late + absent
          return { id: e.code, code: e.code, name: e.name, present, late, absent, marked, onTime: marked ? pct(present, marked) : null }
        })
        .filter((r) => r.marked)
        .sort((a, b) => b.absent - a.absent || b.late - a.late || a.name.localeCompare(b.name))
      const total = { present: sum(rows, (r) => r.present), late: sum(rows, (r) => r.late), absent: sum(rows, (r) => r.absent), marked: sum(rows, (r) => r.marked) }
      const chart = rows.length
        ? {
            kind: "stacked",
            title: "Most absences and late days",
            categoryKey: "name",
            series: [
              { key: "present", label: "Present", color: vizColor("green") },
              { key: "late", label: "Late", color: vizColor("amber") },
              { key: "absent", label: "Absent", color: vizColor("red") },
            ],
            data: rows.slice(0, 12).map((r) => ({ name: r.name, present: r.present, late: r.late, absent: r.absent })),
          }
        : null
      if (rows.length) rows.push({ id: "total", code: "", name: "Total", ...total, onTime: pct(total.present, total.marked) })
      return {
        columns: [
          { key: "code", header: "Code", width: 10 },
          { key: "name", header: "Employee", width: 24 },
          { key: "present", header: "Present", type: "number", width: 9 },
          { key: "late", header: "Late", type: "number", width: 8 },
          { key: "absent", header: "Absent", type: "number", width: 8 },
          { key: "marked", header: "Days marked", type: "number", width: 11 },
          { key: "onTime", header: "On time", type: "pct", width: 9 },
        ],
        rows,
        summary: [
          { label: "Days marked", value: number(total.marked) },
          { label: "Present on time", value: total.marked ? `${pct(total.present, total.marked)}%` : "—" },
          { label: "Late", value: number(total.late) },
          { label: "Absent", value: number(total.absent) },
        ],
        chart,
        note: rows.length ? "Absences are unpaid days in payroll." : "No attendance marked in this period.",
      }
    },
  },
]

export const getReport = (id) => REPORTS.find((r) => r.id === id) ?? null

// Reports this person can open: the plan's features, and amounts only with hr.salaries
export const availableReports = (ctx) => REPORTS.filter((r) => (!r.feature || ctx.has(r.feature)) && (!r.pay || ctx.grant("hr.salaries")))
export const canOpenReport = (ctx, r) => ctx.can("view") && availableReports(ctx).includes(r)

// What the browser needs to list reports (no functions)
export const reportMeta = (r) => ({ id: r.id, group: r.group, title: r.title, description: r.description, icon: r.icon, filters: r.filters ?? [] })

const payrollRuns = (ctx) => live(ctx.db, "payrollRuns").orderBy("month", "desc").select("id", "code", "month", "status")

// Filter choices; payroll runs by their lowercased code (never ids)
export async function reportFilters(ctx) {
  const runs = ctx.has("payroll") && ctx.grant("hr.salaries") ? await payrollRuns(ctx) : []
  const y = Number(isoDay(new Date()).slice(0, 4))
  return {
    period: { label: "Period", all: "This tax year", options: Object.entries(PERIODS).map(([value, label]) => ({ value, label })) },
    by: {
      label: "Group by",
      all: "Department",
      options: [
        { value: "designation", label: "Designation" },
        { value: "project", label: "Project" },
        { value: "type", label: "Employment type" },
      ],
    },
    run: { label: "Month", all: "Latest run", options: runs.map((r) => ({ value: r.code.toLowerCase(), label: `${monthLabel(r.month)}${r.status === "paid" ? "" : ` (${r.status})`}` })) },
    year: { label: "Year", all: `This year (${y})`, options: [y - 1, y - 2].map((v) => ({ value: String(v), label: String(v) })) },
  }
}

// Run a report for filter values from the URL → { columns, rows, summary, chart, note, values, scope }
export async function runReport(ctx, report, query, filters) {
  const values = Object.fromEntries((report.filters ?? []).map((k) => [k, String(query?.[k] ?? "").toLowerCase()]))
  const thisYear = Number(isoDay(new Date()).slice(0, 4))
  const env = {
    range: periodRange(values.period),
    runs: report.filters?.includes("run") ? await payrollRuns(ctx) : [],
    year: /^\d{4}$/.test(values.year) && Number(values.year) < thisYear && Number(values.year) >= thisYear - 2 ? Number(values.year) : thisYear,
  }
  const result = await report.load(ctx, values, env)
  const scope = (report.filters ?? [])
    .map((k) => (k === "run" && !values.run && env.runs[0] ? monthLabel(env.runs[0].month) : (filters[k]?.options.find((o) => o.value === values[k])?.label ?? filters[k]?.all)))
    .filter(Boolean)
    .join(" · ")
  return { ...result, values, scope }
}
