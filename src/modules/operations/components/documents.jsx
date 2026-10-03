import { amountInWords, formatDate, formatDateTime } from "@/lib/format"
import { A4Page } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"

// Sales documents on A4 under the workspace letterhead, for the print preview and the print
// pages: statement of account, payment receipt and allotment letter. booking: getBooking();
// labels: { stage, status, method, type, size } lookups as label functions; brand: getWorkspaceBrand()

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`
const day = (d) => (d ? formatDate(d) : "—")
const LINE_STATE = { paid: "Paid", partial: "Part paid", overdue: "Overdue", "due-soon": "Due soon", upcoming: "Upcoming", cancelled: "Canceled" }

function Party({ booking: b }) {
  const p = b.buyerDetails
  return (
    <div className="space-y-0.5 text-sm">
      <p className="font-semibold">{p.name}</p>
      {p.guardianName && (
        <p>
          {p.guardianRelation ?? "S/O"} {p.guardianName}
        </p>
      )}
      {p.cnic && <p className="tabular-nums">CNIC {p.cnic}</p>}
      {p.phone && <p className="tabular-nums">{p.phone}</p>}
      {p.address && <p className="max-w-80">{[p.address, p.city].filter(Boolean).join(", ")}</p>}
    </div>
  )
}

function UnitBox({ booking: b, unitText }) {
  return (
    <div className="space-y-0.5 text-right text-sm">
      <p className="font-semibold">
        {b.project.name} · {b.unit.number}
      </p>
      <p>{[unitText(b.unit), b.unit.block].filter(Boolean).join(" · ")}</p>
      {b.plan && <p>{b.plan.name}</p>}
      <p className="text-gray-500 tabular-nums">Booking {b.code}</p>
    </div>
  )
}

export function StatementDocument({ booking: b, brand, unitText, methodLabel }) {
  const cleared = b.receipts.filter((r) => r.status === "cleared")
  return (
    <A4Page label="Statement of account">
      <WorkspaceLetterhead brand={brand} title="Statement of account" meta={`As of ${day(new Date())}`} />
      <div className="mt-5 flex justify-between gap-6">
        <Party booking={b} />
        <UnitBox booking={b} unitText={unitText} />
      </div>
      <dl className="mt-5 grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3 text-sm">
        {[
          ["Net price", rs(b.net)],
          ["Received", rs(b.received)],
          ["Balance", rs(b.balance)],
          ["Overdue", rs(b.overdueAmount)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-6 mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">Payment schedule</h3>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-gray-300 text-left text-gray-500">
            <th className="py-1.5 pr-2 font-semibold">Installment</th>
            <th className="py-1.5 pr-2 font-semibold">Due</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Amount</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Paid</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Balance</th>
            <th className="py-1.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {b.lines.map((l) => (
            <tr key={l.id} className="border-b border-gray-100">
              <td className="py-1 pr-2">{l.label}</td>
              <td className="py-1 pr-2 tabular-nums">{day(l.dueDate)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{rs(l.amount)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{rs(l.paid)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{rs(l.balance)}</td>
              <td className="py-1">{LINE_STATE[l.state] ?? l.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cleared.length > 0 && (
        <>
          <h3 className="mt-6 mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">Payments received</h3>
          <table className="w-full text-[12px]">
            <tbody>
              {cleared.map((r) => (
                <tr key={r.code} className="border-b border-gray-100">
                  <td className="py-1 pr-2 tabular-nums">{day(r.receivedOn)}</td>
                  <td className="py-1 pr-2 tabular-nums">{r.code}</td>
                  <td className="py-1 pr-2">{[methodLabel(r.method), r.chequeNo && `Cheque ${r.chequeNo}`, r.reference].filter(Boolean).join(" · ")}</td>
                  <td className="py-1 text-right tabular-nums">{rs(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-8 text-xs text-gray-500">Please report any difference within 7 days of receiving this statement. Cheques count once they clear.</p>
    </A4Page>
  )
}

export function ReceiptDocument({ booking: b, receipt: r, brand, unitText, methodLabel }) {
  return (
    <A4Page label="Payment receipt">
      <WorkspaceLetterhead brand={brand} title="Payment receipt" meta={`${r.code} · ${formatDateTime(r.receivedOn)}`} />
      <div className="mt-6 space-y-3 text-sm leading-relaxed">
        <p>
          Received with thanks from <span className="font-semibold">{b.buyerDetails.name}</span>
          {b.buyerDetails.guardianName && ` ${b.buyerDetails.guardianRelation ?? "S/O"} ${b.buyerDetails.guardianName}`}
          {b.buyerDetails.cnic && `, CNIC ${b.buyerDetails.cnic}`}, the sum of <span className="font-semibold">{rs(r.amount)}</span> ({amountInWords(r.amount)}) by {methodLabel(r.method).toLowerCase()}
          {r.chequeNo && ` (cheque ${r.chequeNo}${r.chequeBank ? `, ${r.chequeBank}` : ""})`}
          {r.reference && `, reference ${r.reference}`}, towards {b.project.name} unit {b.unit.number} ({unitText(b.unit)}), booking {b.code}.
        </p>
        {r.notes && <p className="text-gray-600">For: {r.notes}</p>}
      </div>
      <dl className="mt-6 grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3 text-sm">
        {[
          ["Net price", rs(b.net)],
          ["Received to date", rs(b.received)],
          ["Balance", rs(b.balance)],
          ["Next due", b.nextDue ? `${rs(b.nextDue.balance)} · ${day(b.nextDue.dueDate)}` : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {r.status !== "cleared" && <p className="mt-4 text-sm font-semibold text-amber-700">Subject to realization of the {r.method === "pay-order" ? "pay order" : "cheque"}.</p>}
      <div className="mt-20 flex justify-between text-sm">
        <div className="w-56 border-t border-gray-400 pt-1.5">Received by{r.by ? `: ${r.by.name}` : ""}</div>
        <div className="w-56 border-t border-gray-400 pt-1.5 text-right">Accounts · Stamp</div>
      </div>
    </A4Page>
  )
}

export function AllotmentLetter({ booking: b, brand, unitText, featureLabel }) {
  const terms = [
    "Installments are to be paid as per the payment schedule attached to this letter. Payments count from the date they clear.",
    "A late payment may attract a surcharge, and three missed installments in a row may lead to cancellation of the allotment.",
    "The unit can be transferred only after a no-demand certificate (NDC) from our office, on payment of the transfer fee.",
    "Development, possession, utility connection and other charges are payable separately when demanded.",
    "On cancellation, the amount paid is refunded after the deduction set out in our cancellation policy.",
    "Possession will be handed over after full payment and completion of development works.",
  ]
  return (
    <A4Page label="Allotment letter">
      <WorkspaceLetterhead brand={brand} title="Allotment letter" meta={`${b.allotment?.no ?? "Draft"} · ${day(b.allotment?.at ?? new Date())}`} />
      <div className="mt-6 text-sm">
        <p className="text-gray-500">To,</p>
        <div className="mt-1">
          <Party booking={b} />
        </div>
      </div>
      <p className="mt-5 text-sm font-semibold">
        Subject: Allotment of {unitText(b.unit)} no. {b.unit.number}
        {b.unit.block ? `, ${b.unit.block}` : ""}, {b.project.name}
      </p>
      <p className="mt-3 text-sm leading-relaxed">
        We are pleased to allot you the unit described below against booking {b.code} dated {day(b.bookedAt)}, subject to the terms and conditions set out in this letter and the payment schedule attached.
      </p>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {[
            ["Unit", `${b.unit.number}${b.unit.block ? ` · ${b.unit.block}` : ""}`],
            ["Size and type", unitText(b.unit)],
            ["Features", (b.unitFeatures ?? []).map(featureLabel).join(", ") || "—"],
            ["Total price", `${rs(b.net)}${b.planDiscount + b.extraDiscount > 0 ? ` (after ${rs(b.planDiscount + b.extraDiscount)} discount)` : ""}`],
            ["Payment plan", b.plan?.name ?? "—"],
            ["Nominee", b.nominee?.name ? `${b.nominee.name} (${b.nominee.relation}) · CNIC ${b.nominee.cnic}` : "—"],
          ].map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100">
              <td className="w-40 py-1.5 pr-3 text-gray-500">{k}</td>
              <td className="py-1.5">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mt-6 mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">Terms and conditions</h3>
      <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed">
        {terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <div className="mt-20 flex justify-between text-sm">
        <div className="w-56 border-t border-gray-400 pt-1.5">Allottee</div>
        <div className="w-56 border-t border-gray-400 pt-1.5 text-right">Authorized signatory · Stamp</div>
      </div>
    </A4Page>
  )
}

// Commission payout voucher: who was paid, for which bookings, tax withheld and the net paid
//   payout: listPayouts() entry
export function PayoutVoucher({ payout: p, brand, methodLabel }) {
  return (
    <A4Page label="Commission payout voucher">
      <WorkspaceLetterhead brand={brand} title="Commission payout voucher" meta={`${p.code} · ${day(p.paidOn)}`} />
      <div className="mt-6 flex justify-between gap-6 text-sm">
        <div className="space-y-0.5">
          <p className="text-xs text-gray-500">Paid to</p>
          <p className="font-semibold">{p.partner.name}</p>
          <p>{p.partner.type === "dealer" ? `Dealer${p.partner.code ? ` ${p.partner.code}` : ""}` : "Sales agent"}</p>
          {p.partner.ntn && <p className="tabular-nums">NTN {p.partner.ntn}</p>}
          {p.partner.address && <p className="max-w-72">{p.partner.address}</p>}
        </div>
        <div className="space-y-0.5 text-right">
          <p className="text-xs text-gray-500">Paid by</p>
          <p className="font-semibold">{methodLabel(p.method)}</p>
          {p.account && <p>{p.account}</p>}
          {p.reference && <p className="tabular-nums">Ref. {p.reference}</p>}
        </div>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs text-gray-500">
            <th className="py-1.5 font-medium">Booking</th>
            <th className="py-1.5 font-medium">Buyer</th>
            <th className="py-1.5 font-medium">Unit</th>
            <th className="py-1.5 text-right font-medium">Net price</th>
            <th className="py-1.5 text-right font-medium">Rate</th>
            <th className="py-1.5 text-right font-medium">Commission</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {p.items.map((i) => (
            <tr key={i.code}>
              <td className="py-1.5 tabular-nums">{i.code}</td>
              <td className="py-1.5">{i.buyer}</td>
              <td className="py-1.5">{[i.project, i.unit].filter(Boolean).join(" · ")}</td>
              <td className="py-1.5 text-right tabular-nums">{rs(i.net)}</td>
              <td className="py-1.5 text-right tabular-nums">{i.pct}%</td>
              <td className="py-1.5 text-right tabular-nums">{rs(i.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-sm">
          <tr className="border-t border-gray-300">
            <td colSpan={5} className="pt-2 text-right">
              Gross commission
            </td>
            <td className="pt-2 text-right tabular-nums">{rs(p.gross)}</td>
          </tr>
          {p.wht > 0 && (
            <tr>
              <td colSpan={5} className="text-right">
                Income tax withheld (section 233) @ {p.whtPct}%
              </td>
              <td className="text-right tabular-nums">− {rs(p.wht)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td colSpan={5} className="pt-1 text-right">
              Net paid
            </td>
            <td className="pt-1 text-right tabular-nums">{rs(p.net)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-4 text-sm">
        Amount in words: <span className="font-medium">{amountInWords(p.net)}</span>
      </p>
      {p.notes && <p className="mt-2 text-sm text-gray-600">{p.notes}</p>}
      <div className="mt-20 flex justify-between text-sm">
        <div className="w-56 border-t border-gray-400 pt-1.5">Prepared by{p.by ? `: ${p.by}` : ""}</div>
        <div className="w-56 border-t border-gray-400 pt-1.5 text-center">Approved by</div>
        <div className="w-56 border-t border-gray-400 pt-1.5 text-right">Received by · CNIC</div>
      </div>
    </A4Page>
  )
}
