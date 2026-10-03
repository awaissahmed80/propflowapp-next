import { amountInWords, formatDate } from "@/lib/format"
import { A4Page } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"

// A payment request (invoice to a buyer) on A4 under the workspace letterhead, for the print
// preview and the print page. Mirror server/documents/payment-request-pdf.jsx: change both together.
//   request: getPaymentRequest() · brand: getWorkspaceBrand()

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(Number(n) || 0)}`
const day = (d) => (d ? formatDate(d) : "—")

export function PaymentRequestDocument({ request: q, brand }) {
  const a = q.account
  return (
    <A4Page label="Payment request">
      <WorkspaceLetterhead brand={brand} title="Payment request" meta={`${q.code} · ${day(q.issuedOn)}`} />
      {q.status === "cancelled" && <p className="mt-4 rounded border border-red-300 px-3 py-1.5 text-center text-sm font-semibold tracking-wide text-red-700 uppercase">Canceled</p>}
      {q.status === "paid" && <p className="mt-4 rounded border border-emerald-300 px-3 py-1.5 text-center text-sm font-semibold tracking-wide text-emerald-700 uppercase">Paid · thank you</p>}
      <div className="mt-5 flex justify-between gap-6 text-sm">
        <div className="space-y-0.5">
          <p className="text-xs text-gray-500">To</p>
          <p className="font-semibold">{q.buyer.name}</p>
          {q.buyer.guardian && <p>{q.buyer.guardian}</p>}
          {q.buyer.cnic && <p className="tabular-nums">CNIC {q.buyer.cnic}</p>}
          {q.buyer.phone && <p className="tabular-nums">{q.buyer.phone}</p>}
          {q.buyer.address && <p className="max-w-80">{q.buyer.address}</p>}
        </div>
        <div className="space-y-0.5 text-right">
          {q.unit && (
            <p className="font-semibold">
              {q.unit.project} · {q.unit.number}
            </p>
          )}
          {q.unit?.block && <p>{q.unit.block}</p>}
          {q.booking && <p className="text-gray-500 tabular-nums">Booking {q.booking.code}</p>}
          <p className="mt-2 text-xs text-gray-500">Please pay by</p>
          <p className="text-base font-semibold">{day(q.dueOn)}</p>
        </div>
      </div>
      <table className="mt-6 w-full text-[13px]">
        <thead>
          <tr className="border-b border-gray-300 text-left text-gray-500">
            <th className="w-10 py-1.5 pr-2 font-semibold">#</th>
            <th className="py-1.5 pr-2 font-semibold">Description</th>
            <th className="py-1.5 pr-2 font-semibold">Due</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {q.lines.map((l, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-1.5 pr-2 text-gray-500 tabular-nums">{i + 1}</td>
              <td className="py-1.5 pr-2">{l.label}</td>
              <td className="py-1.5 pr-2 tabular-nums">{l.dueDate ? day(l.dueDate) : ""}</td>
              <td className="py-1.5 text-right tabular-nums">{rs(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300">
            <td colSpan={3} className="py-2 pr-2 text-right font-semibold">
              Total payable
            </td>
            <td className="py-2 text-right text-base font-semibold tabular-nums">{rs(q.total)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-1 text-sm text-gray-600">{amountInWords(q.total)}</p>
      {a && (
        <div className="mt-6 rounded-md border border-gray-200 p-4 text-sm">
          <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">Pay into</p>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
            {[
              ["Bank", [a.bankName || a.name, a.branch].filter(Boolean).join(", ")],
              ["Account title", a.accountTitle],
              ["Account no.", a.accountNumber],
              ["IBAN", a.iban],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-gray-500">{k}</dt>
                  <dd className="font-medium tabular-nums">{v}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            Write {q.code} and booking {q.booking?.code ?? ""} on the deposit slip or transfer, and send us the slip or screenshot.
          </p>
        </div>
      )}
      {q.notes && <p className="mt-4 text-sm whitespace-pre-line text-gray-700">{q.notes}</p>}
      <p className="mt-8 text-xs text-gray-500">Cheques and pay orders count once they clear. Please ignore this request if you have already paid. Late payments may be charged as per your booking terms.</p>
    </A4Page>
  )
}
