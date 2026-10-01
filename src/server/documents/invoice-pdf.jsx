import "server-only"
import path from "node:path"
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { methodLabel } from "@/components/billing/methods"

// The invoice as a real PDF (A4, vector text) for download and, later, email attachments.
// Mirrors the on-screen InvoiceDocument (modules/console/components/invoice-document.jsx):
// change both together.

const LOGO = path.join(process.cwd(), "public/images/email/propflow-logo.png")
const INK = "#111827"
const MUTED = "#6b7280"
const LINE = "#e5e7eb"

const s = StyleSheet.create({
  page: { paddingVertical: 51, paddingHorizontal: 45, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  muted: { color: MUTED },
  label: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  th: { fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: "Helvetica-Bold", paddingBottom: 6 },
  td: { paddingVertical: 7 },
  bold: { fontFamily: "Helvetica-Bold" },
})

const money = (n) => {
  const v = Number(n) || 0
  return `Rs ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v)}`
}
const day = (d) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "—")
const COLS = { desc: "52%", qty: "12%", unit: "18%", amount: "18%" }

function InvoicePdf({ inv, bank }) {
  const email = inv.tenant.email || inv.tenant.owner?.email
  const paid = inv.payments.filter((p) => p.status === "confirmed")
  return (
    <Document title={`Invoice ${inv.code}`} author="PropFlow" subject={`Invoice for ${inv.tenant.name}`}>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            <Image src={LOGO} style={{ width: 116, height: 24 }} />
            <Text style={[s.muted, { marginTop: 10 }]}>PropFlow (Pvt) Ltd</Text>
            <Text style={s.muted}>propflowapp.com</Text>
          </View>
          <View>
            <Text style={s.title}>{inv.status === "draft" ? "Draft invoice" : "Invoice"}</Text>
            <Text style={{ textAlign: "right", marginTop: 4, fontFamily: "Courier" }}>{inv.code}</Text>
            {inv.status === "void" && <Text style={{ textAlign: "right", marginTop: 4, color: "#dc2626", fontFamily: "Helvetica-Bold" }}>VOID</Text>}
            {inv.status === "paid" && <Text style={{ textAlign: "right", marginTop: 4, color: "#047857", fontFamily: "Helvetica-Bold" }}>PAID {day(inv.paidAt)}</Text>}
          </View>
        </View>

        <View style={[s.row, { marginTop: 28 }]}>
          <View style={{ width: "55%" }}>
            <Text style={s.label}>Bill to</Text>
            <Text style={[s.bold, { marginTop: 4 }]}>{inv.tenant.name}</Text>
            {inv.tenant.owner?.name && <Text>{inv.tenant.owner.name}</Text>}
            {inv.tenant.address && <Text>{inv.tenant.address}</Text>}
            {inv.tenant.city && <Text>{inv.tenant.city}</Text>}
            {email && <Text>{email}</Text>}
            {inv.tenant.ntn && <Text>NTN {inv.tenant.ntn}</Text>}
            <Text style={s.muted}>Workspace {inv.tenant.code}</Text>
          </View>
          <View style={{ width: "40%" }}>
            {[
              ["Issued", inv.issuedAt ? day(inv.issuedAt) : "Not yet"],
              ["Due", day(inv.dueAt)],
              ...(inv.periodStart ? [["Period", `${day(inv.periodStart)} – ${day(inv.periodEnd)}`]] : []),
            ].map(([k, v]) => (
              <View key={k} style={[s.row, { marginBottom: 3 }]}>
                <Text style={s.muted}>{k}</Text>
                <Text>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 28, borderBottomWidth: 1, borderBottomColor: "#d1d5db", flexDirection: "row" }}>
          <Text style={[s.th, { width: COLS.desc }]}>Description</Text>
          <Text style={[s.th, { width: COLS.qty, textAlign: "right" }]}>Qty</Text>
          <Text style={[s.th, { width: COLS.unit, textAlign: "right" }]}>Unit price</Text>
          <Text style={[s.th, { width: COLS.amount, textAlign: "right" }]}>Amount</Text>
        </View>
        {inv.lines.map((l) => (
          <View key={l.id} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE }}>
            <Text style={[s.td, { width: COLS.desc, paddingRight: 8 }]}>{l.description}</Text>
            <Text style={[s.td, { width: COLS.qty, textAlign: "right" }]}>{l.quantity}</Text>
            <Text style={[s.td, { width: COLS.unit, textAlign: "right" }]}>{money(l.unitPrice)}</Text>
            <Text style={[s.td, { width: COLS.amount, textAlign: "right" }]}>{money(l.amount)}</Text>
          </View>
        ))}

        <View style={{ marginTop: 12, marginLeft: "auto", width: 200 }}>
          <View style={[s.row, { marginBottom: 4 }]}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{money(inv.subtotal)}</Text>
          </View>
          {inv.taxRate > 0 && (
            <View style={[s.row, { marginBottom: 4 }]}>
              <Text style={s.muted}>Sales tax {inv.taxRate}%</Text>
              <Text>{money(inv.tax)}</Text>
            </View>
          )}
          <View style={[s.row, { borderTopWidth: 1, borderTopColor: "#d1d5db", paddingTop: 6 }]}>
            <Text style={[s.bold, { fontSize: 12 }]}>Total</Text>
            <Text style={[s.bold, { fontSize: 12 }]}>{money(inv.total)}</Text>
          </View>
        </View>

        {inv.notes && <Text style={[s.muted, { marginTop: 24 }]}>{inv.notes}</Text>}

        {bank && !["paid", "void"].includes(inv.status) && (
          <View wrap={false} style={{ marginTop: 24, padding: 12, borderWidth: 1, borderColor: LINE, borderRadius: 6 }}>
            <Text style={s.bold}>Pay by bank transfer</Text>
            <Text style={{ marginTop: 4 }}>
              {bank.accountTitle} · {bank.bankName}
              {bank.branch ? `, ${bank.branch}` : ""}
            </Text>
            <Text style={{ fontFamily: "Courier" }}>IBAN {bank.iban}</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>
              Use {inv.code} as the payment reference.{bank.instructions ? ` ${bank.instructions}` : ""}
            </Text>
          </View>
        )}

        {paid.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={s.label}>Payments</Text>
            {paid.map((p) => (
              <Text key={p.id} style={{ marginTop: 3 }}>
                {day(p.paidAt)} · {methodLabel(p.method)} · {money(p.amount)}
                {p.reference ? ` · ref ${p.reference}` : ""}
              </Text>
            ))}
          </View>
        )}

        <Text fixed style={{ position: "absolute", bottom: 28, left: 45, right: 45, fontSize: 8, color: MUTED, textAlign: "center" }} render={({ pageNumber, totalPages }) => `${inv.code} · page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  )
}

// → Buffer with the PDF
export function renderInvoicePdf(inv, bank) {
  return renderToBuffer(<InvoicePdf inv={inv} bank={bank} />)
}
