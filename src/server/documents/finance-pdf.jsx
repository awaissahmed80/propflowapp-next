import "server-only"
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { amountInWords } from "@/lib/format"
import { ACCOUNT_TYPES, PERIODS, VOUCHER_STATUS, VOUCHER_TYPES, figure } from "@/modules/finance/constants"
import { Footer, LINE, Letterhead, MUTED, Table, day, pdf, rs } from "./workspace-pdf"

// Finance documents as real PDFs (A4, vector text): a voucher and an account statement. Mirror
// the on-screen ones in modules/finance/components/finance-documents.jsx: change both together.
//   v: getVoucher() · s: accountStatement() · brand: getWorkspaceBrand()

const PAYMENT = ["cpv", "bpv"]
const RECEIPT = ["crv", "brv"]
const partyLabel = (type) => (PAYMENT.includes(type) ? "Paid to" : RECEIPT.includes(type) ? "Received from" : "Party")
function voucherCash(v) {
  if (PAYMENT.includes(v.type)) return v.lines.filter((l) => l.kind).reduce((s, l) => s + l.credit - l.debit, 0) || v.amount
  if (RECEIPT.includes(v.type)) return v.lines.filter((l) => l.kind).reduce((s, l) => s + l.debit - l.credit, 0) || v.amount
  return v.amount
}

function Rows({ rows }) {
  return (
    <View style={{ marginTop: 14 }}>
      {rows.map(([k, v]) => (
        <View key={k} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", paddingVertical: 4.5 }}>
          <Text style={[pdf.muted, { width: 110, paddingRight: 8 }]}>{k}</Text>
          <Text style={{ flex: 1 }}>{v || "—"}</Text>
        </View>
      ))}
    </View>
  )
}

function VoucherPage({ v, brand }) {
  const cash = voucherCash(v)
  const facts = [
    [partyLabel(v.type), v.party || v.vendor?.name],
    ["Project", v.project?.name ?? "Head office"],
    ["Reference", v.reference],
    ["Cheque no.", v.chequeNo],
    ["Narration", v.narration],
  ].filter(([k, val]) => val || k === "Narration")
  const cols = [
    { header: "Account", width: "60%" },
    { header: "Debit", width: "20%", align: "right" },
    { header: "Credit", width: "20%", align: "right" },
  ]
  const rows = v.lines.map((l) => [`${l.account}  ${l.accountName}${l.memo ? `\n${l.memo}` : ""}`, figure(l.debit), figure(l.credit)])
  rows.push(["Total", figure(v.amount), figure(v.amount)])
  return (
    <Page size="A4" style={pdf.page}>
      <Letterhead brand={brand} title={VOUCHER_TYPES[v.type]?.label ?? "Voucher"} meta={`${v.code} · ${day(v.date)}`} />
      {v.status !== "posted" && <Text style={[pdf.warn, { marginTop: 10, fontSize: 10, color: "#dc2626" }]}>{VOUCHER_STATUS[v.status]?.label ?? v.status}</Text>}
      <Rows rows={facts} />
      <View style={{ marginTop: 16 }}>
        <Table cols={cols} rows={rows} />
      </View>
      <Text style={{ marginTop: 8 }}>
        <Text style={pdf.muted}>{PAYMENT.includes(v.type) ? "Amount paid" : RECEIPT.includes(v.type) ? "Amount received" : "Amount"}: </Text>
        <Text style={pdf.bold}>{rs(cash)}</Text> <Text style={pdf.muted}>({amountInWords(cash)})</Text>
      </Text>
      {v.status === "void" && v.voidReason ? <Text style={[pdf.muted, { marginTop: 4 }]}>Voided: {v.voidReason}</Text> : null}
      <View style={[pdf.row, { marginTop: 70 }]} wrap={false}>
        {["Prepared by", "Checked by", "Approved by", RECEIPT.includes(v.type) ? "Deposited by" : "Received by"].map((s) => (
          <Text key={s} style={{ width: "22%", borderTopWidth: 1, borderTopColor: "#9ca3af", paddingTop: 4, textAlign: "center" }}>
            {s}
          </Text>
        ))}
      </View>
      <Footer text={v.code} />
    </Page>
  )
}

export async function renderVoucherPdf({ v, brand }) {
  return renderToBuffer(
    <Document title={`${VOUCHER_TYPES[v.type]?.label ?? "Voucher"} ${v.code}`} author={brand.name}>
      <VoucherPage v={v} brand={brand} />
    </Document>,
  )
}

export async function renderStatementPdf({ s, brand }) {
  const a = s.account
  const period = PERIODS.find((p) => p.value === s.period)?.label ?? ""
  const range = s.from ? `${day(s.from)} – ${day(s.to)}` : `Up to ${day(s.to)}`
  const cols = [
    { header: "Date", width: "13%" },
    { header: "Voucher", width: "17%" },
    { header: "Narration", width: "34%" },
    { header: "Debit", width: "12%", align: "right" },
    { header: "Credit", width: "12%", align: "right" },
    { header: "Balance", width: "12%", align: "right" },
  ]
  const rows = [
    [s.from ? day(s.from) : "", "", "Opening balance", "", "", figure(s.opening) || "0"],
    ...s.lines.map((l) => [day(l.date), l.code ?? "", `${l.narration}${l.status === "void" ? " (void)" : ""}`, figure(l.debit), figure(l.credit), figure(l.balance) || "0"]),
    ["", "", "Totals and closing balance", figure(s.debits), figure(s.credits), figure(s.closing) || "0"],
  ]
  return renderToBuffer(
    <Document title={`Statement ${a.code} ${a.name}`} author={brand.name}>
      <Page size="A4" style={pdf.page}>
        <Letterhead brand={brand} title="Statement of account" meta={`${period} · ${range}`} />
        <View style={[pdf.row, { marginTop: 14, alignItems: "flex-end" }]}>
          <View>
            <Text style={[pdf.bold, { fontSize: 11 }]}>
              {a.code} · {a.name}
            </Text>
            <Text style={pdf.muted}>
              {ACCOUNT_TYPES[a.type]?.label}
              {a.bankName ? ` · ${[a.bankName, a.branch, a.accountNumber].filter(Boolean).join(", ")}` : ""}
            </Text>
          </View>
          <View>
            <Text style={[pdf.muted, { textAlign: "right" }]}>Closing balance</Text>
            <Text style={[pdf.bold, { fontSize: 12, textAlign: "right" }]}>{rs(s.closing)}</Text>
          </View>
        </View>
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: LINE }}>
          <Table cols={cols} rows={rows} />
        </View>
        <Text style={[pdf.muted, { marginTop: 8, fontSize: 8, color: MUTED }]}>Balances are in the account&apos;s normal direction ({ACCOUNT_TYPES[a.type]?.normal}); figures in brackets are the other way.</Text>
        <Footer text={`Statement ${a.code}`} />
      </Page>
    </Document>,
  )
}
