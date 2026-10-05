import { A4Page, A4_LANDSCAPE_PRINT } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { cn } from "@/lib/utils"
import { dayLabel, groupByProject, shiftTime } from "../roster"

// The week's duty roster on a landscape A4 sheet, for the print preview and the print page
// (mirrored in server/documents/roster-pdf.jsx for the PDF; change both together).
//   week: rosterWeek() · brand: getWorkspaceBrand()

const td = "border border-gray-300 px-1.5 py-1 align-top"
const tag = (p) => (p.status === "leave" ? " (leave)" : p.status === "absent" ? " (absent)" : p.cover ? " (cover)" : "")

export function RosterDocument({ week, brand }) {
  return (
    <A4Page landscape label={`Duty roster ${week.label}`}>
      <WorkspaceLetterhead brand={brand} title="Duty roster" meta={`Week ${week.week} · ${week.label}`} />
      <table className="mt-4 w-full border-collapse text-[9.5px] leading-snug">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className={cn(td, "w-[19%] font-semibold")}>Post and shift</th>
            {week.days.map((d) => (
              <th key={d} className={cn(td, "font-semibold")}>
                {dayLabel(d, { weekday: "short", day: "numeric", month: "short" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupByProject(week.rows).map((g) => [
            <tr key={g.name}>
              <td colSpan={8} className={cn(td, "bg-gray-50 font-semibold tracking-wide uppercase")}>
                {g.name}
              </td>
            </tr>,
            ...g.rows.flatMap((post) =>
              post.shifts.map((shift, si) => (
                <tr key={`${post.code}:${shift.key}`} className="break-inside-avoid">
                  <td className={td}>
                    {si === 0 && <span className="block font-semibold">{post.name}</span>}
                    <span className="block text-gray-600">
                      {shift.label} · {shiftTime(shift)} · {shift.needed}
                    </span>
                  </td>
                  {shift.cells.map((c) => (
                    <td key={c.date} className={cn(td, !c.applies && "bg-gray-50 text-gray-400", c.short > 0 && "bg-red-50")}>
                      {!c.applies
                        ? "Off"
                        : c.people.map((p) => (
                            <span key={p.code} className={cn("block", ["leave", "absent"].includes(p.status) && "text-gray-500 line-through")}>
                              {p.name}
                              {tag(p)}
                            </span>
                          ))}
                      {c.applies && c.short > 0 && <span className="block font-semibold text-red-700">{c.short} short</span>}
                    </td>
                  ))}
                </tr>
              )),
            ),
          ])}
        </tbody>
      </table>
      {!week.rows.length && <p className="mt-6 text-sm text-gray-500">No duty posts on the roster.</p>}
      <p className="mt-3 text-[9px] text-gray-500">Shift times are 24-hour; the number after the time is how many people the shift needs. Cover is someone added for that day only.</p>
    </A4Page>
  )
}

// The print page: the roster alone, printing itself (landscape) on load
export function RosterPrint({ week, brand }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <style>{A4_LANDSCAPE_PRINT}</style>
      <RosterDocument week={week} brand={brand} />
      <PrintOnLoad />
    </div>
  )
}
