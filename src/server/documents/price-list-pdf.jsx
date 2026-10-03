import "server-only"
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { chargeText, isCashPlan, planLength, planSummary, quote, rateBasis, ratePrice, rateSize } from "@/modules/portfolio/pricing"
import { Footer, Letterhead, Table, day, num, pdf, rs } from "./workspace-pdf"

// Price lists and payment schedules as PDFs. Mirror PriceListDocument / ScheduleDocument
// (modules/portfolio/components/price-list-document.jsx): change both together.
// labels: { type(value), category(value), feature(value), featurePremium(value) }

const STATUS_NOTE = { draft: "Draft · not yet in effect", pending: "Awaiting approval · not yet in effect", archived: "Archived · no longer in effect" }
const sizeOrder = (r, m) => (r.sizeValue == null ? Infinity : (m.sizeInMarla(r.sizeValue, r.sizeUnit) ?? r.sizeValue))

function PriceListPdf({ list, brand, labels }) {
  const rates = [...list.rates].filter((r) => r.rate > 0).sort((a, b) => a.type.localeCompare(b.type) || a.category.localeCompare(b.category) || sizeOrder(a, labels.m) - sizeOrder(b, labels.m))
  return (
    <Document title={list.name} author={brand.name}>
      <Page size="A4" style={pdf.page}>
        <Letterhead brand={brand} title="Price list" meta={`${list.project.name} · v${list.version}`} />
        <View style={[pdf.row, { marginTop: 14 }]}>
          <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{list.name}</Text>
          <Text style={pdf.muted}>
            {["draft", "pending"].includes(list.status) ? "Proposed" : "Effective"} from {day(list.effectiveFrom)}
          </Text>
        </View>
        {STATUS_NOTE[list.status] && <Text style={pdf.warn}>{STATUS_NOTE[list.status]}</Text>}

        <Text style={pdf.h}>Rates</Text>
        <Table
          cols={[
            { header: "Unit", width: "34%" },
            { header: "Category", width: "22%" },
            { header: "Rate", width: "24%", align: "right" },
            { header: "Price", width: "20%", align: "right", style: pdf.bold },
          ]}
          rows={rates.map((r) => {
            const price = ratePrice(r, list.project.marlaSqft, labels.m)
            return [`${labels.type(r.type)} · ${rateSize(r, labels.m)}`, labels.category(r.category), `Rs ${num(r.rate)}/${rateBasis(r.type, labels.m) === "marla" ? "marla" : "sq ft"}`, price ? rs(price) : "By size"]
          })}
        />

        {(list.premiums.length > 0 || list.floorRisePct > 0) && (
          <View wrap={false}>
            <Text style={pdf.h}>Premium locations</Text>
            <Text>{[...list.premiums.map((p) => `${labels.feature(p.feature)} +${p.percent}%`), ...(list.floorRisePct > 0 ? [`Floor rise +${list.floorRisePct}% per floor`] : [])].join("  ·  ")}</Text>
            <Text style={[pdf.muted, { fontSize: 8, marginTop: 2 }]}>Premiums are charged on the base price.</Text>
          </View>
        )}

        {list.plans.length > 0 && (
          <View>
            <Text style={pdf.h}>Payment plans</Text>
            <Table
              cols={[
                { header: "Plan", width: "26%", style: pdf.bold },
                { header: "Terms", width: "58%" },
                { header: "Length", width: "16%", align: "right" },
              ]}
              rows={list.plans.map((p) => [p.name, `${planSummary(p)}${p.note ? `\n${p.note}` : ""}`, isCashPlan(p) ? "—" : planLength(p)])}
            />
          </View>
        )}

        {list.charges.length > 0 && (
          <View>
            <Text style={pdf.h}>Other charges</Text>
            <Table
              header={false}
              cols={[
                { header: "Charge", width: "40%" },
                { header: "Amount", width: "30%" },
                { header: "Due", width: "30%", align: "right" },
              ]}
              rows={list.charges.map((c) => [c.name, chargeText(c), c.due])}
            />
          </View>
        )}

        {list.notes && <Text style={[pdf.muted, { marginTop: 18 }]}>{list.notes}</Text>}
        <Footer text={`${list.name} · ${list.code}`} />
      </Page>
    </Document>
  )
}

function SchedulePdf({ list, unit, input, planKey, start, brand, labels, preparedBy }) {
  const q = input.sizeValue > 0 ? quote(list, input, planKey, start, { marlaSqft: list.project.marlaSqft, featurePremium: labels.featurePremium, m: labels.m }) : null
  const what = `${labels.type(input.type)}${unit ? ` ${unit.number}` : ""} · ${labels.m.formatSize(input.sizeValue, input.sizeUnit)}`
  return (
    <Document title={`Payment schedule · ${what}`} author={brand.name}>
      <Page size="A4" style={pdf.page}>
        <Letterhead brand={brand} title="Payment schedule" meta={list.project.name} />
        {!q ? (
          <Text style={{ marginTop: 16 }}>No rate in {list.name} covers this unit.</Text>
        ) : (
          <>
            <View style={[pdf.row, { marginTop: 14 }]}>
              <View>
                <Text>
                  <Text style={pdf.muted}>Unit </Text>
                  {what}
                </Text>
                <Text style={{ marginTop: 2 }}>
                  <Text style={pdf.muted}>Premiums </Text>
                  {q.premiums.length ? q.premiums.map((p) => `${labels.feature(p.feature)} +${p.percent}%`).join(", ") : "None"}
                  {q.floorRise ? ` · floor rise ${q.floorRise}%` : ""}
                </Text>
              </View>
              <View style={{ maxWidth: "62%" }}>
                <Text style={{ textAlign: "right" }}>
                  <Text style={pdf.muted}>Plan </Text>
                  {q.plan.name}
                </Text>
                <Text style={[pdf.muted, { textAlign: "right", marginTop: 2 }]}>{planSummary(q.plan)}</Text>
              </View>
            </View>
            {list.status !== "active" && <Text style={pdf.warn}>{STATUS_NOTE[list.status]}</Text>}

            <View style={[pdf.row, { marginTop: 14, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, padding: 9 }]}>
              {[
                ["Price", rs(q.price)],
                [q.schedule.discount ? "Cash discount" : "Down payment", rs(q.schedule.discount || q.schedule.rows[0].amount)],
                ["Payable", rs(q.schedule.net)],
                ["Other charges", rs(q.chargesTotal)],
              ].map(([k, v]) => (
                <View key={k}>
                  <Text style={[pdf.muted, { fontSize: 8 }]}>{k}</Text>
                  <Text style={[pdf.bold, { marginTop: 2 }]}>{v}</Text>
                </View>
              ))}
            </View>

            <Text style={pdf.h}>Schedule</Text>
            <Table
              cols={[
                { header: "#", width: "6%" },
                { header: "Due date", width: "18%" },
                { header: "Payment", width: "40%" },
                { header: "Amount (Rs)", width: "18%", align: "right" },
                { header: "Balance (Rs)", width: "18%", align: "right" },
              ]}
              rows={q.schedule.rows.map((r) => [String(r.no), day(r.dueDate), r.label, num(r.amount), num(r.balance)])}
            />

            {q.charges.length > 0 && (
              <View wrap={false}>
                <Text style={pdf.h}>Charges payable separately</Text>
                <Table
                  header={false}
                  cols={[
                    { header: "Charge", width: "45%" },
                    { header: "Due", width: "35%" },
                    { header: "Amount", width: "20%", align: "right" },
                  ]}
                  rows={q.charges.map((c) => [c.name, c.due, rs(c.total)])}
                />
              </View>
            )}
            {list.notes && <Text style={[pdf.muted, { marginTop: 14 }]}>{list.notes}</Text>}
            <Text style={[pdf.muted, { marginTop: 14, fontSize: 7.5 }]}>
              {list.name} (v{list.version}) · Prepared {day(new Date())}
              {preparedBy ? ` by ${preparedBy}` : ""} · This schedule is an estimate; the booking form governs.
            </Text>
          </>
        )}
        <Footer text={`Payment schedule · ${list.project.name}`} />
      </Page>
    </Document>
  )
}

export const renderPriceListPdf = (props) => renderToBuffer(<PriceListPdf {...props} />)
export const renderSchedulePdf = (props) => renderToBuffer(<SchedulePdf {...props} />)
