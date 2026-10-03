import "server-only"
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { amountInWords } from "@/lib/format"
import { Letterhead, MUTED, Table, day, pdf, rs } from "./workspace-pdf"

// A payment request (invoice to a buyer) as a real PDF. Mirror the on-screen one in
// modules/finance/components/payment-request-document.jsx: change both together.
//   q: getPaymentRequest() · brand: getWorkspaceBrand()

function Stamp({ text, color }) {
  return <Text style={{ marginTop: 12, borderWidth: 1, borderColor: color, color, paddingVertical: 4, textAlign: "center", fontFamily: "Helvetica-Bold", letterSpacing: 1 }}>{text}</Text>
}

function RequestPdf({ q, brand }) {
  const a = q.account
  const bank = a
    ? [
        ["Bank", [a.bankName || a.name, a.branch].filter(Boolean).join(", ")],
        ["Account title", a.accountTitle],
        ["Account no.", a.accountNumber],
        ["IBAN", a.iban],
      ].filter(([, v]) => v)
    : []
  return (
    <Page size="A4" style={pdf.page}>
      <Letterhead brand={brand} title="Payment request" meta={`${q.code} · ${day(q.issuedOn)}`} />
      {q.status === "cancelled" ? <Stamp text="CANCELED" color="#b91c1c" /> : null}
      {q.status === "paid" ? <Stamp text="PAID · THANK YOU" color="#047857" /> : null}
      <View style={[pdf.row, { marginTop: 18 }]}>
        <View style={{ maxWidth: "55%" }}>
          <Text style={[pdf.muted, { fontSize: 8 }]}>To</Text>
          <Text style={pdf.bold}>{q.buyer.name}</Text>
          {q.buyer.guardian ? <Text>{q.buyer.guardian}</Text> : null}
          {q.buyer.cnic ? <Text>CNIC {q.buyer.cnic}</Text> : null}
          {q.buyer.phone ? <Text>{q.buyer.phone}</Text> : null}
          {q.buyer.address ? <Text>{q.buyer.address}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {q.unit ? (
            <Text style={pdf.bold}>
              {q.unit.project} · {q.unit.number}
            </Text>
          ) : null}
          {q.unit?.block ? <Text>{q.unit.block}</Text> : null}
          {q.booking ? <Text style={pdf.muted}>Booking {q.booking.code}</Text> : null}
          <Text style={[pdf.muted, { fontSize: 8, marginTop: 8 }]}>Please pay by</Text>
          <Text style={[pdf.bold, { fontSize: 12 }]}>{day(q.dueOn)}</Text>
        </View>
      </View>
      <View style={{ marginTop: 18 }}>
        <Table
          cols={[
            { header: "#", width: "6%" },
            { header: "Description", width: "56%" },
            { header: "Due", width: "18%" },
            { header: "Amount", width: "20%", align: "right" },
          ]}
          rows={q.lines.map((l, i) => [String(i + 1), l.label, l.dueDate ? day(l.dueDate) : "", rs(l.amount)])}
        />
        <View style={[pdf.row, { paddingTop: 6 }]}>
          <Text style={[pdf.bold, { width: "80%", textAlign: "right", paddingRight: 6 }]}>Total payable</Text>
          <Text style={[pdf.bold, { width: "20%", textAlign: "right", fontSize: 11 }]}>{rs(q.total)}</Text>
        </View>
        <Text style={[pdf.muted, { marginTop: 4 }]}>{amountInWords(q.total)}</Text>
      </View>
      {bank.length ? (
        <View style={{ marginTop: 18, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, padding: 10 }} wrap={false}>
          <Text style={[pdf.h, { marginTop: 0 }]}>Pay into</Text>
          {bank.map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", paddingVertical: 1.5 }}>
              <Text style={[pdf.muted, { width: 100 }]}>{k}</Text>
              <Text style={pdf.bold}>{v}</Text>
            </View>
          ))}
          <Text style={{ marginTop: 6, fontSize: 8, color: MUTED }}>
            Write {q.code} and booking {q.booking?.code ?? ""} on the deposit slip or transfer, and send us the slip or screenshot.
          </Text>
        </View>
      ) : null}
      {q.notes ? <Text style={{ marginTop: 12 }}>{q.notes}</Text> : null}
      <Text style={{ marginTop: 22, fontSize: 8, color: MUTED }}>
        Cheques and pay orders count once they clear. Please ignore this request if you have already paid. Late payments may be charged as per your booking terms.
      </Text>
    </Page>
  )
}

export function renderPaymentRequestPdf({ q, brand }) {
  return renderToBuffer(
    <Document title={`Payment request ${q.code}`} author={brand.name}>
      <RequestPdf q={q} brand={brand} />
    </Document>,
  )
}
