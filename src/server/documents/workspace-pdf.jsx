import "server-only"
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer"

// Building blocks for a workspace's own PDFs (price lists, schedules, receipts…): the letterhead
// with the workspace logo (or company name), tables and section headings. Mirror the on-screen
// A4 documents built on components/document.

export const INK = "#111827"
export const MUTED = "#6b7280"
export const LINE = "#e5e7eb"

export const pdf = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 45, paddingBottom: 56, fontSize: 9.5, color: INK, fontFamily: "Helvetica" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  muted: { color: MUTED },
  bold: { fontFamily: "Helvetica-Bold" },
  h: { marginTop: 18, marginBottom: 6, fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Helvetica-Bold" },
  th: { fontSize: 8, color: MUTED, fontFamily: "Helvetica-Bold", paddingBottom: 5 },
  td: { paddingVertical: 4.5 },
  warn: { marginTop: 3, fontSize: 8, color: "#b45309", fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
})

export const num = (n) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(Number(n) || 0)
export const rs = (n) => `Rs ${num(n)}`
export const day = (d) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric" }).format(new Date(d)) : "—")

// brand: getWorkspaceBrand(tenant)
export function Letterhead({ brand, title, meta }) {
  const contact = [brand.address, [brand.phone, brand.email].filter(Boolean).join(" · "), brand.ntn && `NTN ${brand.ntn}`].filter(Boolean)
  return (
    <View style={[pdf.row, { borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingBottom: 12 }]}>
      <View style={{ maxWidth: "60%" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
        {brand.logoUrl ? <Image src={brand.logoUrl} style={{ maxHeight: 40, maxWidth: 160, objectFit: "contain" }} /> : <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold" }}>{brand.name}</Text>}
        {brand.logoUrl && <Text style={[pdf.bold, { marginTop: 4 }]}>{brand.legalName || brand.name}</Text>}
        {contact.map((line) => (
          <Text key={line} style={[pdf.muted, { fontSize: 8 }]}>
            {line}
          </Text>
        ))}
      </View>
      <View>
        {title && <Text style={{ fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "right" }}>{title}</Text>}
        {meta && <Text style={[pdf.muted, { fontSize: 8, textAlign: "right", marginTop: 2 }]}>{meta}</Text>}
      </View>
    </View>
  )
}

// cols: [{ header, width: "30%", align? }]; rows: arrays of cell text
export function Table({ cols, rows, header = true }) {
  return (
    <View>
      {header && (
        <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d1d5db" }}>
          {cols.map((c) => (
            <Text key={c.header} style={[pdf.th, { width: c.width, textAlign: c.align ?? "left", paddingRight: 6 }]}>
              {c.header}
            </Text>
          ))}
        </View>
      )}
      {rows.map((r, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE }}>
          {r.map((cell, j) => (
            <Text key={j} style={[pdf.td, { width: cols[j].width, textAlign: cols[j].align ?? "left", paddingRight: 6 }, cols[j].style ?? {}]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

// "PL-0001 · page 1 of 2" at the foot of every page
export const Footer = ({ text }) => <Text fixed style={{ position: "absolute", bottom: 26, left: 45, right: 45, fontSize: 7.5, color: MUTED, textAlign: "center" }} render={({ pageNumber, totalPages }) => `${text} · page ${pageNumber} of ${totalPages}`} />
