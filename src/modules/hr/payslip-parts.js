import { SALARY_PARTS } from "./constants"

// Payslip pieces shared by the payroll pages, the A4 payslip (components/payslip-document.jsx)
// and its PDF (server/documents/payslip-pdf.jsx), so all three say the same thing.
//   slip: a payroll line as getRun() returns it ({ earnings, gross, bonus, tax, … , employee })

// "2026-10" → "October 2026" (or "Oct 2026" with short)
export const monthLabel = (month, short = false) => (month ? new Intl.DateTimeFormat("en-US", { month: short ? "short" : "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`)) : "")

export const figure = (n) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))
export const rupees = (n) => `Rs ${figure(n)}`

// "PK36SCBL0000001123456702" → "PK36 •••• 6702"
export const maskIban = (iban) => (iban ? `${String(iban).slice(0, 4)} •••• ${String(iban).slice(-4)}` : "")

// Everything taken off one line's pay
export const lineDeductions = (l) => Number(l.unpaidDeduction) + Number(l.tax) + Number(l.eobi) + Number(l.pf) + Number(l.loan) + Number(l.otherDeduction)

// [label, amount] rows for the earnings and deductions columns (zero rows left out)
export function payslipRows(slip) {
  const earnings = SALARY_PARTS.map((p) => [p.label, Number(slip.earnings?.[p.key] ?? 0)])
  earnings.push(["Bonus / overtime", Number(slip.bonus)])
  const deductions = [
    ["Income tax", Number(slip.tax)],
    ["EOBI", Number(slip.eobi)],
    ["Provident fund", Number(slip.pf)],
    [slip.loans?.length ? `Loan / advance (${slip.loans.map((x) => x.code).join(", ")})` : "Loan / advance", Number(slip.loan)],
    [`Unpaid days (${Number(slip.unpaidDays)})`, Number(slip.unpaidDeduction)],
    ["Other deduction", Number(slip.otherDeduction)],
  ]
  return { earnings: earnings.filter(([, v]) => v), deductions: deductions.filter(([, v]) => v), totalEarnings: Number(slip.gross) + Number(slip.bonus), totalDeductions: lineDeductions(slip) }
}

// How the net pay reaches them: "Bank transfer to Meezan Bank (PK36 •••• 6702)" or "Paid in cash"
export const paidBy = (slip) =>
  slip.payMethod === "cash" ? "Paid in cash" : `Bank transfer${slip.employee?.bankName ? ` to ${slip.employee.bankName}` : ""}${slip.employee?.iban ? ` (${maskIban(slip.employee.iban)})` : ""}`

// The employer's own EOBI and provident fund on top of the pay (not deducted from it)
export const employerNote = (slip) => {
  const parts = [Number(slip.eobiEmployer) && `EOBI ${rupees(slip.eobiEmployer)}`, Number(slip.pfEmployer) && `provident fund ${rupees(slip.pfEmployer)}`].filter(Boolean)
  return parts.length ? `The employer also pays ${parts.join(" and ")} for you this month, on top of your pay.` : null
}
