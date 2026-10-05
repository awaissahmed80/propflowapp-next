import { amountInWords, formatDate } from "@/lib/format"
import { A4Page } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { employerNote, figure, monthLabel, paidBy, payslipRows, rupees } from "../payslip-parts"

// A payslip on A4 under the workspace letterhead, for the print preview, the print pages and
// (mirrored in server/documents/payslip-pdf.jsx) the PDF. Change both together.
//   slip: a line from getRun() / payslipsFor() · run: { code, month, status, paidAt } · brand: getWorkspaceBrand()

const cell = "border border-gray-300 px-2 py-1.5"

export function PayslipDocument({ slip, run, brand }) {
  const e = slip.employee
  const { earnings, deductions, totalEarnings, totalDeductions } = payslipRows(slip)
  const rows = Math.max(earnings.length, deductions.length)
  const facts = [
    ["Employee", `${e.name} (${e.code})`],
    ["Designation", [e.designation, e.department].filter(Boolean).join(" · ")],
    ["CNIC", e.cnic],
    ["EOBI no.", e.eobiNo],
    ["NTN", e.ntn],
    ["Days", slip.unpaidDays ? `${slip.unpaidDays} unpaid` : "Full month"],
  ].filter(([, v]) => v)
  const employer = employerNote(slip)
  return (
    <A4Page label={`Payslip ${e.name} ${run.month}`}>
      <WorkspaceLetterhead brand={brand} title="Payslip" meta={`${monthLabel(run.month)} · ${run.code}`} />
      {run.status !== "paid" && <p className="mt-4 inline-block rounded border-2 border-amber-600 px-2 py-0.5 text-sm font-bold tracking-wide text-amber-700 uppercase">Draft · not paid yet</p>}
      <dl className="mt-5 grid grid-cols-2 gap-x-8 text-sm">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-3 border-b border-gray-100 py-1.5">
            <dt className="w-28 shrink-0 text-gray-500">{k}</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 text-left text-xs text-gray-600">
            <th className={`${cell} font-semibold`}>Earnings</th>
            <th className={`${cell} w-28 text-right font-semibold`}>Rs</th>
            <th className={`${cell} font-semibold`}>Deductions</th>
            <th className={`${cell} w-28 text-right font-semibold`}>Rs</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td className={cell}>{earnings[i]?.[0]}</td>
              <td className={`${cell} text-right tabular-nums`}>{earnings[i] ? figure(earnings[i][1]) : ""}</td>
              <td className={cell}>{deductions[i]?.[0]}</td>
              <td className={`${cell} text-right tabular-nums`}>{deductions[i] ? figure(deductions[i][1]) : ""}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={cell}>Total earnings</td>
            <td className={`${cell} text-right tabular-nums`}>{figure(totalEarnings)}</td>
            <td className={cell}>Total deductions</td>
            <td className={`${cell} text-right tabular-nums`}>{figure(totalDeductions)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 flex items-baseline justify-between gap-6 rounded border border-gray-300 bg-gray-50 px-3 py-2">
        <span className="text-sm text-gray-600">Net pay</span>
        <span className="text-lg font-bold tabular-nums">{rupees(slip.net)}</span>
      </div>
      <p className="mt-1.5 text-sm text-gray-600 italic">{amountInWords(slip.net)}</p>
      <div className="mt-4 space-y-1 text-xs text-gray-600">
        <p>
          {paidBy(slip)}
          {run.paidAt ? ` on ${formatDate(run.paidAt)}` : ""}. Taxable salary this month {rupees(slip.taxable)}.
        </p>
        {employer && <p>{employer}</p>}
        {slip.note && <p>Note: {slip.note}</p>}
      </div>
      <div className="mt-20 grid grid-cols-2 gap-24 text-center text-sm">
        <div className="border-t border-gray-400 pt-1.5">HR &amp; Admin</div>
        <div className="border-t border-gray-400 pt-1.5">Received by</div>
      </div>
      <p className="mt-6 text-center text-[11px] text-gray-400">This is a computer-generated payslip.</p>
    </A4Page>
  )
}

// Several payslips, one per page
export function PayslipStack({ slips, run, brand }) {
  return slips.map((s) => (
    <div key={s.employee.code} className="break-after-page last:break-after-auto">
      <PayslipDocument slip={s} run={run} brand={brand} />
    </div>
  ))
}

// The print page: the payslips alone, printing themselves on load (the preview's Print button)
export function PayslipsPrint({ slips, run, brand }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <PayslipStack slips={slips} run={run} brand={brand} />
      <PrintOnLoad />
    </div>
  )
}
