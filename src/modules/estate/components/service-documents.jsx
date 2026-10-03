import { formatDate } from "@/lib/format"
import { A4Page } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"
import { NDC_PURPOSES } from "../constants"

// Estate Management papers on A4 under the workspace letterhead, for the print preview, the print
// page and (mirrored in server/documents/service-pdf.jsx) the PDF: NDC certificate, transfer
// letter and possession letter. Change both together.
//   r: getRequest() · paper: requestPaper() · brand: getWorkspaceBrand() · unitText(unit)

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`
const day = (d) => (d ? formatDate(d) : "—")
const FLAT = ["apartment", "flat", "shop", "office", "penthouse"]

export const personLine = (p) => (p?.name ? `${p.name}${p.guardian ? ` ${p.relation ?? "S/O"} ${p.guardian}` : ""}` : "—")
export const unitPlace = (u) => (u ? [`${u.number}`, u.block, u.phase].filter(Boolean).join(", ") : "—")
export const ndcPurpose = (v) => NDC_PURPOSES.find((p) => p.value === v)?.label ?? v ?? "—"

function Rows({ rows }) {
  return (
    <table className="mt-4 w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-gray-100">
            <td className="w-52 py-1.5 pr-3 text-gray-500">{k}</td>
            <td className="py-1.5">{v || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Signatures({ left, right }) {
  return (
    <div className="mt-20 flex justify-between text-sm">
      <div className="w-56 border-t border-gray-400 pt-1.5">{left}</div>
      <div className="w-56 border-t border-gray-400 pt-1.5 text-right">{right}</div>
    </div>
  )
}

function Addressee({ person }) {
  return (
    <div className="mt-6 text-sm">
      <p className="text-gray-500">To,</p>
      <div className="mt-1 space-y-0.5">
        <p className="font-semibold">{person?.name ?? "—"}</p>
        {person?.guardian && (
          <p>
            {person.relation ?? "S/O"} {person.guardian}
          </p>
        )}
        {person?.cnic && <p className="tabular-nums">CNIC {person.cnic}</p>}
        {person?.address && <p className="max-w-80">{person.address}</p>}
      </div>
    </div>
  )
}

// No Demand Certificate: nothing is owed on the file up to the date of issue
export function NdcCertificate({ r, paper, brand, unitText }) {
  const o = paper.owner
  return (
    <A4Page label="No Demand Certificate">
      <WorkspaceLetterhead brand={brand} title="No Demand Certificate" meta={`${paper.number} · ${day(paper.date)}`} />
      <p className="mt-8 text-sm leading-relaxed">
        It is certified that <span className="font-semibold">{personLine(o)}</span>
        {o?.cnic && `, CNIC ${o.cnic}`}, holder of the file below, has paid all dues payable to {brand.legalName || brand.name} up to {day(paper.date)}, and nothing is outstanding against this file as of this date.
      </p>
      <Rows
        rows={[
          ["Project", r.unit?.project?.name],
          ["Unit", unitPlace(r.unit)],
          ["Size and type", r.unit ? unitText(r.unit) : null],
          ["Booking", r.booking?.code],
          ["Paid to date", rs(r.booking?.received ?? 0)],
          ["Purpose", ndcPurpose(paper.purpose)],
          ["Valid till", day(paper.validTill)],
        ]}
      />
      <p className="mt-5 text-xs leading-relaxed text-gray-500">
        Installments falling due after the date of issue are payable as per the payment schedule. This certificate is void if altered, and after {day(paper.validTill)}.
      </p>
      <Signatures left="Accounts" right="Authorized signatory · Stamp" />
    </A4Page>
  )
}

// The file now stands in the purchaser's name
export function TransferLetter({ r, paper, brand, unitText }) {
  const { from, owner: to } = paper
  return (
    <A4Page label="Transfer letter">
      <WorkspaceLetterhead brand={brand} title="Transfer letter" meta={`${paper.number} · ${day(paper.date)}`} />
      <Addressee person={to} />
      <p className="mt-5 text-sm font-semibold">Subject: Transfer of {r.unit ? `${unitText(r.unit)} no. ${unitPlace(r.unit)}, ${r.unit.project?.name ?? ""}` : `booking ${r.booking?.code ?? ""}`}</p>
      <p className="mt-3 text-sm leading-relaxed">
        The file below has been transferred from <span className="font-semibold">{personLine(from)}</span>
        {from?.cnic && ` (CNIC ${from.cnic})`} to <span className="font-semibold">{personLine(to)}</span>
        {to?.cnic && ` (CNIC ${to.cnic})`} after biometric verification of both parties on {day(paper.biometricAt ?? paper.date)}. All rights and liabilities of the file, including the remaining installments, now rest
        with the transferee.
      </p>
      <Rows
        rows={[
          ["Project", r.unit?.project?.name],
          ["Unit", unitPlace(r.unit)],
          ["Size and type", r.unit ? unitText(r.unit) : null],
          ["Booking", r.booking?.code],
          ["Balance payable by the transferee", rs(r.booking?.balance ?? 0)],
          ["Transfer fee", r.fee?.waived ? "Waived" : r.fee?.amount ? rs(r.fee.amount) : "None"],
          ["Request", r.code],
        ]}
      />
      <Signatures left="Transfer desk" right="Authorized signatory · Stamp" />
    </A4Page>
  )
}

export function PossessionLetter({ r, paper, brand, unitText }) {
  const flat = FLAT.includes(String(r.unit?.type ?? "").toLowerCase())
  const terms = [
    "Construction may start after the building plan is approved by the society office.",
    "Monthly maintenance charges apply from the date of possession.",
    "Utility connections (electricity, gas, water) are applied for by the owner with the relevant company.",
    "Encroaching on streets, green belts or neighboring plots is not allowed.",
  ]
  return (
    <A4Page label="Possession letter">
      <WorkspaceLetterhead brand={brand} title="Possession letter" meta={`${paper.number} · ${day(paper.date)}`} />
      <Addressee person={paper.owner} />
      <p className="mt-5 text-sm font-semibold">Subject: Handing over possession of {r.unit ? `${unitText(r.unit)} no. ${unitPlace(r.unit)}, ${r.unit.project?.name ?? ""}` : `booking ${r.booking?.code ?? ""}`}</p>
      <p className="mt-3 text-sm leading-relaxed">
        Having received the full price against booking {r.booking?.code}, we hand over physical possession of the unit below to you today.
        {flat ? " The unit was checked with you at handover." : " The plot was demarcated on site in your presence and boundary pillars fixed."}
      </p>
      <Rows
        rows={[
          ["Project", r.unit?.project?.name],
          ["Unit", unitPlace(r.unit)],
          ["Size and type", r.unit ? unitText(r.unit) : null],
          [flat ? "Handover checked" : "Demarcated on", day(paper.demarcatedAt ?? paper.date)],
          ["Possession given", day(paper.handedOverAt ?? paper.date)],
        ]}
      />
      <h3 className="mt-6 mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">Terms</h3>
      <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed">
        {terms.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <Signatures left="Received by the owner" right="Site office · Stamp" />
    </A4Page>
  )
}

// The paper for a request: { NdcCertificate | TransferLetter | PossessionLetter } by paper.doc
export function ServicePaper(props) {
  if (props.paper.doc === "ndc") return <NdcCertificate {...props} />
  if (props.paper.doc === "transfer") return <TransferLetter {...props} />
  return <PossessionLetter {...props} />
}
