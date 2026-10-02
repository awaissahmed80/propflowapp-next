import { formatAmount, formatDate } from "@/lib/format"
import { methodLabel } from "@/components/billing/methods"
import { A4Page } from "@/components/document/a4-page"
import { Logo } from "@/components/logo"
import { urlCode } from "@/lib/url"

// The invoice as a document on an A4 sheet. Used by the invoice page and the preview dialog.
// inv: from getInvoice(); bank: the bank-transfer details when that method is on, else null.
export function InvoiceDocument({ inv, bank }) {
  const overdue = ["issued", "overdue"].includes(inv.status) && inv.dueAt && new Date(inv.dueAt) < new Date()
  return (
    <A4Page label={`Invoice ${inv.code}`}>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Logo variant="dark" className="h-8" />
          <p className="mt-3 text-sm text-gray-500">
            PropFlow (Pvt) Ltd
            <br />
            propflowapp.com
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight">{inv.status === "draft" ? "Draft invoice" : "Invoice"}</p>
          <p className="mt-1 font-mono text-sm">{inv.code}</p>
          {inv.status === "void" && <p className="mt-1 text-sm font-semibold text-red-600">VOID</p>}
          {inv.status === "paid" && <p className="mt-1 text-sm font-semibold text-emerald-700">PAID {formatDate(inv.paidAt)}</p>}
        </div>
      </header>

      <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Bill to</p>
          <p className="mt-1 font-semibold">{inv.tenant.name}</p>
          {inv.tenant.owner?.name && <p>{inv.tenant.owner.name}</p>}
          {inv.tenant.address && <p>{inv.tenant.address}</p>}
          {inv.tenant.city && <p>{inv.tenant.city}</p>}
          {(inv.tenant.email || inv.tenant.owner?.email) && <p>{inv.tenant.email || inv.tenant.owner.email}</p>}
          {inv.tenant.ntn && <p>NTN {inv.tenant.ntn}</p>}
          <p className="text-gray-500">Workspace {inv.tenant.code}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 sm:justify-self-end">
          <dt className="text-gray-500">Issued</dt>
          <dd>{inv.issuedAt ? formatDate(inv.issuedAt) : "Not yet"}</dd>
          <dt className="text-gray-500">Due</dt>
          <dd className={overdue ? "font-semibold text-red-600" : undefined}>{formatDate(inv.dueAt) || "—"}</dd>
          {inv.periodStart && (
            <>
              <dt className="text-gray-500">Period</dt>
              <dd>
                {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
              </dd>
            </>
          )}
        </dl>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs tracking-wide text-gray-500 uppercase">
            <th className="py-2 font-semibold">Description</th>
            <th className="py-2 text-right font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Unit price</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100 align-top">
              <td className="py-3 pr-4">{l.description}</td>
              <td className="py-3 text-right tabular-nums">{l.quantity}</td>
              <td className="py-3 text-right tabular-nums">{formatAmount(l.unitPrice)}</td>
              <td className="py-3 text-right tabular-nums">{formatAmount(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-500">Subtotal</dt>
          <dd className="tabular-nums">{formatAmount(inv.subtotal)}</dd>
        </div>
        {inv.taxRate > 0 && (
          <div className="flex justify-between">
            <dt className="text-gray-500">Sales tax {inv.taxRate}%</dt>
            <dd className="tabular-nums">{formatAmount(inv.tax)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-bold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatAmount(inv.total)}</dd>
        </div>
      </dl>

      {inv.notes && <p className="mt-8 text-sm whitespace-pre-line text-gray-600">{inv.notes}</p>}

      {bank && inv.status !== "paid" && inv.status !== "void" && (
        <div className="mt-8 rounded-lg border border-gray-200 p-4 text-sm">
          <p className="font-semibold">Pay by bank transfer</p>
          <p className="mt-1">
            {bank.accountTitle} · {bank.bankName}
            {bank.branch ? `, ${bank.branch}` : ""}
          </p>
          <p className="font-mono">IBAN {bank.iban}</p>
          <p className="mt-1 text-gray-500">
            Use {inv.code} as the payment reference.{bank.instructions ? ` ${bank.instructions}` : ""}
          </p>
        </div>
      )}

      {inv.payments.filter((p) => p.status === "confirmed").length > 0 && (
        <div className="mt-8 text-sm">
          <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Payments</p>
          {inv.payments
            .filter((p) => p.status === "confirmed")
            .map((p) => (
              <p key={p.id} className="mt-1">
                {formatDate(p.paidAt)} · {methodLabel(p.method)} · {formatAmount(p.amount)}
                {p.reference ? ` · ref ${p.reference}` : ""}
                {p.proofKey && (
                  <a href={`/api/console/invoices/${urlCode(inv.code)}/payments/${urlCode(p.code)}/proof`} target="_blank" rel="noreferrer" className="ml-2 text-[#1528A0] underline print:hidden">
                    View proof
                  </a>
                )}
              </p>
            ))}
        </div>
      )}
    </A4Page>
  )
}
