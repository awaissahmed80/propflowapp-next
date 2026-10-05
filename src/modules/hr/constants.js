// HR & Payroll rules shared by the server and the browser: salary parts, payroll rules for
// Pakistan (income tax slabs on salary, EOBI, provident fund, medical exemption, minimum wage,
// leave allowances) and the payslip calculation. A workspace changes the rules in
// Customize › Payroll rules; update the tax slabs each July from the Finance Act.

export const SALARY_PARTS = [
  { key: "basic", label: "Basic" },
  { key: "house", label: "House rent" },
  { key: "utilities", label: "Utilities" },
  { key: "medical", label: "Medical" },
  { key: "fuel", label: "Fuel / conveyance" },
  { key: "other", label: "Other allowance" },
]

// Owners and directors can draw a salary through payroll (a Pvt Ltd's director is taxed on it), but
// EOBI and provident fund are for employees, and they're not counted in headcount
export const OWNER_TYPES = ["director"]
export const isOwner = (employmentType) => OWNER_TYPES.includes(employmentType)

export const EMPLOYEE_STATUS = { active: { label: "Active", color: "green" }, left: { label: "Left", color: "gray" } }
export const LEAVE_STATUS = {
  pending: { label: "Waiting", color: "amber" },
  approved: { label: "Approved", color: "green" },
  rejected: { label: "Not approved", color: "red" },
  cancelled: { label: "Canceled", color: "gray" },
}
export const LOAN_STATUS = {
  pending: { label: "Waiting for approval", color: "amber" },
  active: { label: "Recovering", color: "blue" },
  closed: { label: "Recovered", color: "green" },
  rejected: { label: "Not approved", color: "gray" },
}
export const RUN_STATUS = {
  draft: { label: "Draft", color: "gray" },
  approved: { label: "Approved", color: "blue" },
  pending: { label: "Payment waiting for approval", color: "amber" },
  paid: { label: "Paid", color: "green" },
}
export const ATTENDANCE = {
  present: { label: "Present", color: "green" },
  late: { label: "Late", color: "amber" },
  absent: { label: "Absent", color: "red" },
}

// Income tax on salary (annual taxable income → tax), tax year 2025-26 (Finance Act 2025).
// Editable per workspace: check against the year's Finance Act every July.
export const DEFAULT_RULES = {
  taxYear: "2025-26",
  slabs: [
    { upTo: 600000, fixed: 0, rate: 0 },
    { upTo: 1200000, fixed: 0, rate: 1 },
    { upTo: 2200000, fixed: 6000, rate: 11 },
    { upTo: 3200000, fixed: 116000, rate: 23 },
    { upTo: 4100000, fixed: 346000, rate: 30 },
    { upTo: null, fixed: 616000, rate: 35 },
  ],
  minimumWage: 40000,
  eobiEmployeePct: 1, // of the minimum wage
  eobiEmployerPct: 5,
  pfEmployeePct: 8.33, // of basic, for provident fund members
  pfEmployerPct: 8.33,
  medicalExemptPct: 10, // medical allowance tax-free up to this % of basic
  leave: { annual: 14, casual: 10, sick: 8 }, // days a year
}

export function mergeRules(saved) {
  const out = structuredClone(DEFAULT_RULES)
  if (!saved || typeof saved !== "object") return out
  return { ...out, ...saved, leave: { ...out.leave, ...(saved.leave ?? {}) }, slabs: Array.isArray(saved.slabs) && saved.slabs.length ? saved.slabs : out.slabs }
}

// Tax on an annual taxable income
export function annualTax(income, slabs) {
  let from = 0
  for (const s of slabs) {
    if (s.upTo == null || income <= s.upTo) return Math.max(0, Math.round(s.fixed + ((income - from) * s.rate) / 100))
    from = s.upTo
  }
  return 0
}

export const monthlyGross = (salary = {}) => SALARY_PARTS.reduce((sum, p) => sum + Number(salary[p.key] ?? 0), 0)

const r = Math.round

// "2026-10" → { start, end, days }
export function monthRange(month) {
  const [y, m] = month.split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0))
  return { start, end, days: end.getUTCDate() }
}

// "2026-10-04" from a date string or a Date (DATE columns are read as UTC midnight)
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

// One employee's payslip for a month.
//   employee: { salary, pf, joinedOn, leftOn, payMethod } · rules: mergeRules()
//   month: "2026-10" · unpaidDays: unpaid leave + absences (+ extra added on the draft)
//   bonus, otherDeduction: entered on the draft · loans: [{ id, code, installment, left }]
export function payslip({ employee, rules, month, unpaidDays = 0, bonus = 0, otherDeduction = 0, loans = [] }) {
  const { start, end, days } = monthRange(month)
  // Part months (joined or left during the month) are paid for the days employed
  const from = employee.joinedOn ? new Date(Math.max(start, new Date(`${isoDate(employee.joinedOn)}T00:00:00Z`))) : start
  const to = employee.leftOn ? new Date(Math.min(end, new Date(`${isoDate(employee.leftOn)}T00:00:00Z`))) : end
  const employed = Math.max(0, Math.round((to - from) / 86_400_000) + 1)
  const share = Math.min(1, employed / days)
  const earnings = Object.fromEntries(SALARY_PARTS.map((p) => [p.key, r(Number(employee.salary?.[p.key] ?? 0) * share)]))
  const gross = monthlyGross(earnings)
  const fullGross = monthlyGross(employee.salary)
  // Unpaid days at a 30-day daily rate, never more than what's earned
  const unpaidDeduction = Math.min(gross, r((fullGross / 30) * unpaidDays))
  const basic = earnings.basic
  const medicalExempt = Math.min(earnings.medical, r((basic * rules.medicalExemptPct) / 100))
  const taxable = Math.max(0, gross - unpaidDeduction + Number(bonus) - medicalExempt)
  const tax = r(annualTax(taxable * 12, rules.slabs) / 12)
  const statutory = Boolean(employed) && !isOwner(employee.employmentType)
  const eobi = statutory ? r((rules.minimumWage * rules.eobiEmployeePct) / 100) : 0
  const eobiEmployer = statutory ? r((rules.minimumWage * rules.eobiEmployerPct) / 100) : 0
  const pf = statutory && employee.pf ? r((basic * rules.pfEmployeePct) / 100) : 0
  const pfEmployer = statutory && employee.pf ? r((basic * rules.pfEmployerPct) / 100) : 0
  // Loans recovered in installments, never more than what's left of the loan or of the pay
  let room = Math.max(0, gross - unpaidDeduction + Number(bonus) - tax - eobi - pf - Number(otherDeduction))
  const recovered = []
  for (const l of loans) {
    const amount = Math.min(Number(l.installment), Number(l.left), room)
    if (amount > 0) recovered.push({ loanId: l.id, code: l.code, amount })
    room -= amount
  }
  const loan = recovered.reduce((s, x) => s + x.amount, 0)
  const net = Math.max(0, gross - unpaidDeduction + Number(bonus) - tax - eobi - pf - loan - Number(otherDeduction))
  return {
    earnings,
    gross,
    unpaidDays: Number(unpaidDays),
    unpaidDeduction,
    bonus: Number(bonus),
    otherDeduction: Number(otherDeduction),
    taxable,
    tax,
    eobi,
    eobiEmployer,
    pf,
    pfEmployer,
    loan,
    loans: recovered,
    net,
    payMethod: employee.payMethod ?? "bank",
    employedDays: employed,
  }
}

// Advance limit and recovery: up to one month's gross, over 1–6 months, rounded up to Rs 100
export const ADVANCE_MAX_MONTHS = 6
export const installmentFor = (amount, months) => Math.ceil(amount / Math.max(1, months) / 100) * 100

// Leave days between two dates (both included)
export const leaveDays = (start, end) => Math.max(0, Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86_400_000) + 1)

// The month after "2026-10" → "2026-11"
export const nextMonth = (month) => {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}
