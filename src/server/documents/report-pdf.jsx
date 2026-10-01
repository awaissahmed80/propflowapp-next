import "server-only"
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { formatCell, isNumeric } from "@/lib/reports"
import { Footer, Letterhead, Table, pdf } from "./workspace-pdf"

// Any app's report as a PDF: letterhead, summary and the table. Landscape when it has more than
// seven columns. Mirrors components/reports/report-document.jsx; change both together.
function ReportPdf({ report, result, brand, generatedBy }) {
  const landscape = result.columns.length > 7
  const total = result.columns.reduce((s, c) => s + (c.width ?? 14), 0)
  const meta = [result.scope, `Generated ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date())}${generatedBy ? ` by ${generatedBy}` : ""}`].filter(Boolean).join(" · ")
  return (
    <Document title={report.title} author={brand.name}>
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={[pdf.page, landscape ? { fontSize: 8 } : {}]}>
        <Letterhead brand={brand} title={report.title} meta={meta} />
        {result.summary?.length > 0 && (
          <View style={[pdf.row, { marginTop: 12, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, padding: 8 }]}>
            {result.summary.map((s) => (
              <View key={s.label}>
                <Text style={[pdf.muted, { fontSize: 7.5 }]}>{s.label}</Text>
                <Text style={[pdf.bold, { marginTop: 2 }]}>{s.value}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ marginTop: 12 }}>
          <Table cols={result.columns.map((c) => ({ header: c.header, width: `${((c.width ?? 14) / total) * 100}%`, align: isNumeric(c) ? "right" : "left" }))} rows={result.rows.map((r) => result.columns.map((c) => formatCell(c, r, { print: true })))} />
        </View>
        {result.rows.length === 0 && <Text style={[pdf.muted, { marginTop: 10 }]}>No data for this selection.</Text>}
        {result.note && <Text style={[pdf.muted, { marginTop: 10, fontSize: 8 }]}>{result.note}</Text>}
        <Footer text={report.title} />
      </Page>
    </Document>
  )
}

export const renderReportPdf = (props) => renderToBuffer(<ReportPdf {...props} />)
