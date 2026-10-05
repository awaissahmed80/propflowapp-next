import "server-only"
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { dayLabel, groupByProject, shiftTime } from "@/modules/hr/roster"
import { Footer, LINE, Letterhead, MUTED, pdf } from "./workspace-pdf"

// The week's duty roster as a landscape PDF. Mirrors modules/hr/components/roster-document.jsx;
// change both together.   week: rosterWeek() · brand: getWorkspaceBrand()

const FIRST = "19%"
const DAYCOL = `${81 / 7}%`
const cell = { borderRightWidth: 1, borderRightColor: LINE, paddingVertical: 3, paddingHorizontal: 4 }
const tag = (p) => (p.status === "leave" ? " (leave)" : p.status === "absent" ? " (absent)" : p.cover ? " (cover)" : "")

function RosterPdf({ week, brand }) {
  const title = `Duty roster · week ${week.week}`
  return (
    <Document title={`Duty roster ${week.label}`} author={brand.name}>
      <Page size="A4" orientation="landscape" style={[pdf.page, { fontSize: 7.5, paddingHorizontal: 30, paddingVertical: 30, paddingBottom: 44 }]}>
        <Letterhead brand={brand} title="Duty roster" meta={`Week ${week.week} · ${week.label}`} />
        <View style={{ marginTop: 10, borderTopWidth: 1, borderLeftWidth: 1, borderColor: LINE }}>
          <View fixed style={{ flexDirection: "row", backgroundColor: "#f3f4f6", borderBottomWidth: 1, borderBottomColor: LINE }}>
            <Text style={[cell, pdf.bold, { width: FIRST }]}>Post and shift</Text>
            {week.days.map((d) => (
              <Text key={d} style={[cell, pdf.bold, { width: DAYCOL }]}>
                {dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}
              </Text>
            ))}
          </View>
          {groupByProject(week.rows).map((g) => (
            <View key={g.name}>
              <Text
                style={[pdf.bold, { backgroundColor: "#f9fafb", padding: 3, borderBottomWidth: 1, borderBottomColor: LINE, borderRightWidth: 1, borderRightColor: LINE, textTransform: "uppercase", letterSpacing: 0.5 }]}
              >
                {g.name}
              </Text>
              {g.rows.flatMap((post) =>
                post.shifts.map((shift, si) => (
                  <View key={`${post.code}:${shift.key}`} wrap={false} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE }}>
                    <View style={[cell, { width: FIRST }]}>
                      {si === 0 && <Text style={pdf.bold}>{post.name}</Text>}
                      <Text style={pdf.muted}>
                        {shift.label} · {shiftTime(shift)} · {shift.needed}
                      </Text>
                    </View>
                    {shift.cells.map((c) => (
                      <View key={c.date} style={[cell, { width: DAYCOL }, !c.applies ? { backgroundColor: "#f9fafb" } : c.short ? { backgroundColor: "#fef2f2" } : {}]}>
                        {!c.applies ? (
                          <Text style={{ color: MUTED }}>Off</Text>
                        ) : (
                          c.people.map((p) => (
                            <Text key={p.code} style={["leave", "absent"].includes(p.status) ? { color: MUTED, textDecoration: "line-through" } : {}}>
                              {p.name}
                              {tag(p)}
                            </Text>
                          ))
                        )}
                        {c.applies && c.short > 0 && <Text style={[pdf.bold, { color: "#b91c1c" }]}>{c.short} short</Text>}
                      </View>
                    ))}
                  </View>
                )),
              )}
            </View>
          ))}
        </View>
        {!week.rows.length && <Text style={[pdf.muted, { marginTop: 10 }]}>No duty posts on the roster.</Text>}
        <Text style={[pdf.muted, { marginTop: 6, fontSize: 7 }]}>Shift times are 24-hour; the number after the time is how many people the shift needs. Cover is someone added for that day only.</Text>
        <Footer text={title} />
      </Page>
    </Document>
  )
}

export const renderRosterPdf = (props) => renderToBuffer(<RosterPdf {...props} />)
