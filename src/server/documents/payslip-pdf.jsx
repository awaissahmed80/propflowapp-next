import "server-only"
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { amountInWords } from "@/lib/format"
import { employerNote, figure, monthLabel, paidBy, payslipRows, rupees } from "@/modules/hr/payslip-parts"
import { Footer, Letterhead, MUTED, day, pdf } from "./workspace-pdf"

// Payslips as real PDFs (A4, vector text), one page each. Mirror the on-screen payslip in
// modules/hr/components/payslip-document.jsx: change both together.
//   slips: lines from getRun() / ownPayslip() · run: { code, month, status, paidAt } · brand: getWorkspaceBrand()

const BORDER = "#d1d5db"
const td = { borderWidth: 0.75, borderColor: BORDER, paddingVertical: 4, paddingHorizontal: 5, marginLeft: -0.75, marginTop: -0.75 }

function Cell({ children, width, right, bold, head }) {
  return <Text style={[td, { width, textAlign: right ? "right" : "left" }, bold || head ? pdf.bold : {}, head ? { backgroundColor: "#f3f4f6", fontSize: 8, color: "#4b5563" } : {}]}>{children}</Text>
}

function PayslipPage({ slip, run, brand }) {
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
  const W = ["34%", "16%", "34%", "16%"]
  return (
    <Page size="A4" style={pdf.page}>
      <Letterhead brand={brand} title="Payslip" meta={`${monthLabel(run.month)} · ${run.code}`} />
      {run.status !== "paid" && <Text style={[pdf.warn, { marginTop: 10, fontSize: 10 }]}>Draft · not paid yet</Text>}
      <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap" }}>
        {facts.map(([k, v]) => (
          <View key={k} style={{ width: "50%", flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 4, paddingRight: 12 }}>
            <Text style={[pdf.muted, { width: 70 }]}>{k}</Text>
            <Text style={{ flex: 1 }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 16, paddingLeft: 0.75, paddingTop: 0.75 }}>
        <View style={{ flexDirection: "row" }}>
          <Cell width={W[0]} head>
            Earnings
          </Cell>
          <Cell width={W[1]} right head>
            Rs
          </Cell>
          <Cell width={W[2]} head>
            Deductions
          </Cell>
          <Cell width={W[3]} right head>
            Rs
          </Cell>
        </View>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={{ flexDirection: "row" }}>
            <Cell width={W[0]}>{earnings[i]?.[0] ?? " "}</Cell>
            <Cell width={W[1]} right>
              {earnings[i] ? figure(earnings[i][1]) : " "}
            </Cell>
            <Cell width={W[2]}>{deductions[i]?.[0] ?? " "}</Cell>
            <Cell width={W[3]} right>
              {deductions[i] ? figure(deductions[i][1]) : " "}
            </Cell>
          </View>
        ))}
        <View style={{ flexDirection: "row" }}>
          <Cell width={W[0]} bold>
            Total earnings
          </Cell>
          <Cell width={W[1]} right bold>
            {figure(totalEarnings)}
          </Cell>
          <Cell width={W[2]} bold>
            Total deductions
          </Cell>
          <Cell width={W[3]} right bold>
            {figure(totalDeductions)}
          </Cell>
        </View>
      </View>
      <View style={[pdf.row, { marginTop: 12, borderWidth: 0.75, borderColor: BORDER, backgroundColor: "#f9fafb", paddingVertical: 6, paddingHorizontal: 8, alignItems: "center" }]}>
        <Text style={pdf.muted}>Net pay</Text>
        <Text style={[pdf.bold, { fontSize: 13 }]}>{rupees(slip.net)}</Text>
      </View>
      <Text style={[pdf.muted, { marginTop: 4, fontFamily: "Helvetica-Oblique" }]}>{amountInWords(slip.net)}</Text>
      <View style={{ marginTop: 12 }}>
        <Text style={[pdf.muted, { fontSize: 8.5 }]}>
          {paidBy(slip)}
          {run.paidAt ? ` on ${day(run.paidAt)}` : ""}. Taxable salary this month {rupees(slip.taxable)}.
        </Text>
        {employer && <Text style={[pdf.muted, { fontSize: 8.5, marginTop: 2 }]}>{employer}</Text>}
        {slip.note ? <Text style={[pdf.muted, { fontSize: 8.5, marginTop: 2 }]}>Note: {slip.note}</Text> : null}
      </View>
      <View style={[pdf.row, { marginTop: 70 }]} wrap={false}>
        {["HR & Admin", "Received by"].map((s) => (
          <Text key={s} style={{ width: "36%", borderTopWidth: 1, borderTopColor: "#9ca3af", paddingTop: 4, textAlign: "center" }}>
            {s}
          </Text>
        ))}
      </View>
      <Text style={{ marginTop: 18, textAlign: "center", fontSize: 7.5, color: MUTED }}>This is a computer-generated payslip.</Text>
      <Footer text={`${run.code} · ${e.code}`} />
    </Page>
  )
}

export async function renderPayslipsPdf({ slips, run, brand }) {
  return renderToBuffer(
    <Document title={slips.length === 1 ? `Payslip ${slips[0].employee.name} ${run.month}` : `Payslips ${run.month}`} author={brand.name}>
      {slips.map((s) => (
        <PayslipPage key={s.employee.code} slip={s} run={run} brand={brand} />
      ))}
    </Document>,
  )
}
