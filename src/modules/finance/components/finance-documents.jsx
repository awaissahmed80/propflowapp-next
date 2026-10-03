"use client"

import { amountInWords, formatDate } from "@/lib/format"
import { A4Page } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { ACCOUNT_TYPES, PERIODS, VOUCHER_STATUS, VOUCHER_TYPES, figure } from "../constants"
import { partyLabel, rupees } from "./finance-parts"

// Finance documents on A4 under the workspace letterhead, for the print preview, the print pages
// and (mirrored in server/documents/finance-pdf.jsx) the PDFs: a voucher and an account statement.
// Change both together.

const PAYMENT = ["cpv", "bpv"]
const RECEIPT = ["crv", "brv"]

// What actually changed hands: the cash/bank side of a payment or receipt (net of tax withheld),
// otherwise the voucher's total
export function voucherCash(v) {
  if (PAYMENT.includes(v.type)) return v.lines.filter((l) => l.kind).reduce((s, l) => s + l.credit - l.debit, 0) || v.amount
  if (RECEIPT.includes(v.type)) return v.lines.filter((l) => l.kind).reduce((s, l) => s + l.debit - l.credit, 0) || v.amount
  return v.amount
}

const SIGNATURES = (type) => ["Prepared by", "Checked by", "Approved by", RECEIPT.includes(type) ? "Deposited by" : "Received by"]

export function VoucherDocument({ v, brand }) {
  const cash = voucherCash(v)
  const facts = [
    [partyLabel(v.type), v.party || v.vendor?.name],
    ["Project", v.project?.name ?? "Head office"],
    ["Reference", v.reference],
    ["Cheque no.", v.chequeNo],
    ["Narration", v.narration],
  ].filter(([k, val]) => val || k === "Narration")
  return (
    <A4Page label={`Voucher ${v.code}`}>
      <WorkspaceLetterhead brand={brand} title={VOUCHER_TYPES[v.type]?.label ?? "Voucher"} meta={`${v.code} · ${formatDate(v.date)}`} />
      {v.status !== "posted" && <p className="mt-4 inline-block rounded border-2 border-red-600 px-2 py-0.5 text-sm font-bold tracking-wide text-red-600 uppercase">{VOUCHER_STATUS[v.status]?.label ?? v.status}</p>}
      <table className="mt-5 w-full text-sm">
        <tbody>
          {facts.map(([k, val]) => (
            <tr key={k} className="border-b border-gray-100">
              <td className="w-40 py-1.5 pr-3 align-top text-gray-500">{k}</td>
              <td className="py-1.5">{val || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-100 text-left text-xs text-gray-600">
            <th className="border border-gray-300 px-2 py-1.5 font-semibold">Account</th>
            <th className="w-32 border border-gray-300 px-2 py-1.5 text-right font-semibold">Debit</th>
            <th className="w-32 border border-gray-300 px-2 py-1.5 text-right font-semibold">Credit</th>
          </tr>
        </thead>
        <tbody>
          {v.lines.map((l) => (
            <tr key={l.id}>
              <td className="border border-gray-300 px-2 py-1.5">
                <span className="font-mono text-xs text-gray-500">{l.account}</span> {l.accountName}
                {l.memo && <span className="block text-xs text-gray-500">{l.memo}</span>}
              </td>
              <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{figure(l.debit)}</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{figure(l.credit)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="border border-gray-300 px-2 py-1.5 text-right">Total</td>
            <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{figure(v.amount)}</td>
            <td className="border border-gray-300 px-2 py-1.5 text-right tabular-nums">{figure(v.amount)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-sm">
        <span className="text-gray-500">{PAYMENT.includes(v.type) ? "Amount paid" : RECEIPT.includes(v.type) ? "Amount received" : "Amount"}:</span> <span className="font-semibold">{rupees(cash)}</span>{" "}
        <span className="text-gray-600 italic">({amountInWords(cash)})</span>
      </p>
      {v.status === "void" && v.voidReason && <p className="mt-2 text-sm text-gray-600">Voided: {v.voidReason}</p>}
      <div className="mt-24 grid grid-cols-4 gap-6 text-center text-sm">
        {SIGNATURES(v.type).map((s) => (
          <div key={s} className="border-t border-gray-400 pt-1.5">
            {s}
          </div>
        ))}
      </div>
    </A4Page>
  )
}

export function StatementDocument({ s, brand }) {
  const a = s.account
  const period = PERIODS.find((p) => p.value === s.period)?.label ?? ""
  const range = s.from ? `${formatDate(s.from)} – ${formatDate(s.to)}` : `Up to ${formatDate(s.to)}`
  return (
    <A4Page label={`Statement ${a.code}`}>
      <WorkspaceLetterhead brand={brand} title="Statement of account" meta={`${period} · ${range}`} />
      <div className="mt-5 flex items-end justify-between gap-6 text-sm">
        <div>
          <p className="text-base font-semibold">
            {a.code} · {a.name}
          </p>
          <p className="text-gray-500">
            {ACCOUNT_TYPES[a.type]?.label}
            {a.bankName ? ` · ${[a.bankName, a.branch, a.accountNumber].filter(Boolean).join(", ")}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-500">Closing balance</p>
          <p className="text-lg font-semibold tabular-nums">{rupees(s.closing)}</p>
        </div>
      </div>
      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-100 text-left text-gray-600">
            {["Date", "Voucher", "Narration", "Debit", "Credit", "Balance"].map((h, i) => (
              <th key={h} className={`border border-gray-300 px-1.5 py-1 font-semibold ${i >= 3 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-300 px-1.5 py-1 whitespace-nowrap">{s.from ? formatDate(s.from) : ""}</td>
            <td className="border border-gray-300 px-1.5 py-1" />
            <td className="border border-gray-300 px-1.5 py-1 font-medium">Opening balance</td>
            <td className="border border-gray-300 px-1.5 py-1" />
            <td className="border border-gray-300 px-1.5 py-1" />
            <td className="border border-gray-300 px-1.5 py-1 text-right tabular-nums">{figure(s.opening) || "0"}</td>
          </tr>
          {s.lines.map((l) => (
            <tr key={l.id} className="break-inside-avoid">
              <td className="border border-gray-300 px-1.5 py-1 whitespace-nowrap">{formatDate(l.date)}</td>
              <td className="border border-gray-300 px-1.5 py-1 font-mono whitespace-nowrap">{l.code ?? ""}</td>
              <td className="border border-gray-300 px-1.5 py-1">
                {l.narration}
                {l.status === "void" ? " (void)" : ""}
              </td>
              <td className="border border-gray-300 px-1.5 py-1 text-right tabular-nums">{figure(l.debit)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-right tabular-nums">{figure(l.credit)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-right tabular-nums">{figure(l.balance) || "0"}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td colSpan={3} className="border border-gray-300 px-1.5 py-1 text-right">
              Totals and closing balance
            </td>
            <td className="border border-gray-300 px-1.5 py-1 text-right tabular-nums">{figure(s.debits)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right tabular-nums">{figure(s.credits)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right tabular-nums">{figure(s.closing) || "0"}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs text-gray-500">Balances are in the account&apos;s normal direction ({ACCOUNT_TYPES[a.type]?.normal}); figures in brackets are the other way.</p>
    </A4Page>
  )
}

// The print pages: the document alone, printing itself on load (the preview's Print button)
export function VoucherPrint({ voucher, brand }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <VoucherDocument v={voucher} brand={brand} />
      <PrintOnLoad />
    </div>
  )
}

export function StatementPrint({ statement, brand }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <StatementDocument s={statement} brand={brand} />
      <PrintOnLoad />
    </div>
  )
}
