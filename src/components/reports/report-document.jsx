import { cn } from "@/lib/utils"
import { formatCell, isNumeric } from "@/lib/reports"
import { A4Page } from "@/components/document/a4-page"
import { WorkspaceLetterhead } from "@/components/document/workspace-letterhead"

// A report on A4 under the workspace letterhead: title, filters, summary and the full table.
// Mirrors server/documents/report-pdf.jsx; change both together.
export function ReportDocument({ report, result, brand, generatedBy, generatedAt = new Date() }) {
  const meta = [
    result.scope,
    `Generated ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" }).format(new Date(generatedAt))}${generatedBy ? ` by ${generatedBy}` : ""}`,
  ].filter(Boolean)
  const small = result.columns.length > 7
  return (
    <A4Page label={report.title}>
      <WorkspaceLetterhead brand={brand} title={report.title} meta={meta.join(" · ")} />
      {result.summary?.length > 0 && (
        <dl className="mt-5 grid grid-cols-4 gap-3 rounded-md border border-gray-200 p-3 text-sm">
          {result.summary.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-gray-500">{s.label}</dt>
              <dd className="font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <table className={cn("mt-5 w-full", small ? "text-[11px]" : "text-sm")}>
        <thead>
          <tr className="border-b border-gray-300 text-xs text-gray-500">
            {result.columns.map((c) => (
              <th key={c.key} className={cn("py-1.5 pr-2 font-semibold", isNumeric(c) ? "text-right" : "text-left")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100">
              {result.columns.map((c) => (
                <td key={c.key} className={cn("py-1 pr-2", isNumeric(c) && "text-right whitespace-nowrap tabular-nums")}>
                  {formatCell(c, r, { print: true })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 && <p className="mt-4 text-sm text-gray-500">No data for this selection.</p>}
      {result.note && <p className="mt-4 text-xs text-gray-500">{result.note}</p>}
    </A4Page>
  )
}
