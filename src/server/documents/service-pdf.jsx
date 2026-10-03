import "server-only"
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { NDC_PURPOSES } from "@/modules/estate/constants"
import { Letterhead, MUTED, day, pdf, rs } from "./workspace-pdf"

// Estate Management papers as real PDFs (A4, vector text): NDC certificate, transfer letter and
// possession letter. Mirror the on-screen ones in modules/estate/components/service-documents.jsx:
// change both together.
//   r: getRequest() · paper: requestPaper() · brand: getWorkspaceBrand() · unitText(unit)

const FLAT = ["apartment", "flat", "shop", "office", "penthouse"]
const personLine = (p) => (p?.name ? `${p.name}${p.guardian ? ` ${p.relation ?? "S/O"} ${p.guardian}` : ""}` : "—")
const unitPlace = (u) => (u ? [`${u.number}`, u.block, u.phase].filter(Boolean).join(", ") : "—")
const subjectUnit = (r, unitText) => (r.unit ? `${unitText(r.unit)} no. ${unitPlace(r.unit)}, ${r.unit.project?.name ?? ""}` : `booking ${r.booking?.code ?? ""}`)
const body = { fontSize: 10, lineHeight: 1.5 }

function Rows({ rows }) {
  return (
    <View style={{ marginTop: 12 }}>
      {rows.map(([k, v]) => (
        <View key={k} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 4.5 }}>
          <Text style={[pdf.muted, { width: 170, paddingRight: 8 }]}>{k}</Text>
          <Text style={{ flex: 1 }}>{v || "—"}</Text>
        </View>
      ))}
    </View>
  )
}

function Signatures({ left, right }) {
  return (
    <View style={[pdf.row, { marginTop: 60 }]} wrap={false}>
      <Text style={{ width: 170, borderTopWidth: 1, borderTopColor: "#9ca3af", paddingTop: 4 }}>{left}</Text>
      <Text style={{ width: 170, borderTopWidth: 1, borderTopColor: "#9ca3af", paddingTop: 4, textAlign: "right" }}>{right}</Text>
    </View>
  )
}

function Addressee({ person }) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={pdf.muted}>To,</Text>
      <Text style={[pdf.bold, { marginTop: 2 }]}>{person?.name ?? "—"}</Text>
      {person?.guardian ? (
        <Text>
          {person.relation ?? "S/O"} {person.guardian}
        </Text>
      ) : null}
      {person?.cnic ? <Text>CNIC {person.cnic}</Text> : null}
      {person?.address ? <Text style={{ maxWidth: 260 }}>{person.address}</Text> : null}
    </View>
  )
}

function Ndc({ r, paper, brand, unitText }) {
  const o = paper.owner
  return (
    <>
      <Letterhead brand={brand} title="No Demand Certificate" meta={`${paper.number} · ${day(paper.date)}`} />
      <Text style={[body, { marginTop: 24 }]}>
        It is certified that <Text style={pdf.bold}>{personLine(o)}</Text>
        {o?.cnic ? `, CNIC ${o.cnic}` : ""}, holder of the file below, has paid all dues payable to {brand.legalName || brand.name} up to {day(paper.date)}, and nothing is outstanding against this file as of this date.
      </Text>
      <Rows
        rows={[
          ["Project", r.unit?.project?.name],
          ["Unit", unitPlace(r.unit)],
          ["Size and type", r.unit ? unitText(r.unit) : null],
          ["Booking", r.booking?.code],
          ["Paid to date", rs(r.booking?.received ?? 0)],
          ["Purpose", NDC_PURPOSES.find((p) => p.value === paper.purpose)?.label ?? paper.purpose],
          ["Valid till", day(paper.validTill)],
        ]}
      />
      <Text style={{ marginTop: 14, fontSize: 8.5, color: MUTED }}>
        Installments falling due after the date of issue are payable as per the payment schedule. This certificate is void if altered, and after {day(paper.validTill)}.
      </Text>
      <Signatures left="Accounts" right="Authorized signatory · Stamp" />
    </>
  )
}

function Transfer({ r, paper, brand, unitText }) {
  const { from, owner: to } = paper
  return (
    <>
      <Letterhead brand={brand} title="Transfer letter" meta={`${paper.number} · ${day(paper.date)}`} />
      <Addressee person={to} />
      <Text style={[pdf.bold, { marginTop: 14, fontSize: 10 }]}>Subject: Transfer of {subjectUnit(r, unitText)}</Text>
      <Text style={[body, { marginTop: 8 }]}>
        The file below has been transferred from <Text style={pdf.bold}>{personLine(from)}</Text>
        {from?.cnic ? ` (CNIC ${from.cnic})` : ""} to <Text style={pdf.bold}>{personLine(to)}</Text>
        {to?.cnic ? ` (CNIC ${to.cnic})` : ""} after biometric verification of both parties on {day(paper.biometricAt ?? paper.date)}. All rights and liabilities of the file, including the remaining installments, now
        rest with the transferee.
      </Text>
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
    </>
  )
}

function Possession({ r, paper, brand, unitText }) {
  const flat = FLAT.includes(String(r.unit?.type ?? "").toLowerCase())
  const terms = [
    "Construction may start after the building plan is approved by the society office.",
    "Monthly maintenance charges apply from the date of possession.",
    "Utility connections (electricity, gas, water) are applied for by the owner with the relevant company.",
    "Encroaching on streets, green belts or neighboring plots is not allowed.",
  ]
  return (
    <>
      <Letterhead brand={brand} title="Possession letter" meta={`${paper.number} · ${day(paper.date)}`} />
      <Addressee person={paper.owner} />
      <Text style={[pdf.bold, { marginTop: 14, fontSize: 10 }]}>Subject: Handing over possession of {subjectUnit(r, unitText)}</Text>
      <Text style={[body, { marginTop: 8 }]}>
        Having received the full price against booking {r.booking?.code ?? ""}, we hand over physical possession of the unit below to you today.
        {flat ? " The unit was checked with you at handover." : " The plot was demarcated on site in your presence and boundary pillars fixed."}
      </Text>
      <Rows
        rows={[
          ["Project", r.unit?.project?.name],
          ["Unit", unitPlace(r.unit)],
          ["Size and type", r.unit ? unitText(r.unit) : null],
          [flat ? "Handover checked" : "Demarcated on", day(paper.demarcatedAt ?? paper.date)],
          ["Possession given", day(paper.handedOverAt ?? paper.date)],
        ]}
      />
      <Text style={pdf.h}>Terms</Text>
      {terms.map((t, i) => (
        <Text key={t} style={{ marginBottom: 3, lineHeight: 1.4 }}>
          {i + 1}. {t}
        </Text>
      ))}
      <Signatures left="Received by the owner" right="Site office · Stamp" />
    </>
  )
}

const DOCS = { ndc: Ndc, transfer: Transfer, possession: Possession }

// → Buffer with the PDF
export function renderServicePaperPdf({ r, paper, brand, unitText }) {
  const Body = DOCS[paper.doc]
  return renderToBuffer(
    <Document title={`${paper.title} ${paper.number}`} author={brand.name}>
      <Page size="A4" style={pdf.page}>
        <Body r={r} paper={paper} brand={brand} unitText={unitText} />
      </Page>
    </Document>,
  )
}
