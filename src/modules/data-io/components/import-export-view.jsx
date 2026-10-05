"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { timeAgo } from "@/lib/format"
import { AppIcon } from "@/components/app-icon"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ENTITIES, templateRows } from "../entities"
import { datedName, downloadCsv, downloadXlsx } from "../download"
import { exportData } from "../server/actions"
import { ImportDialog } from "./import-dialog"

// Settings › Import & Export: a card per kind of data (import, template, export as Excel or CSV),
// shown as each app's role allows, and the import history with the rows that failed.
//   access: { leads: { import, export }, … } · history: importHistory().list

const ORDER = ["leads", "activities", "contacts", "units", "employees"]
const COLOR = { leads: "blue", activities: "sky", contacts: "teal", units: "orange", employees: "violet" }
const nf = (n) => Number(n ?? 0).toLocaleString("en-US")

export function ImportExportView({ access, history }) {
  const router = useRouter()
  const [importing, setImporting] = useState(null)
  const [busy, setBusy] = useState(null)
  const shown = ORDER.filter((k) => access[k]?.import || access[k]?.export)

  const exportAs = async (key, format) => {
    setBusy(`${key}:${format}`)
    const id = toast.loading(`Exporting ${ENTITIES[key].label.toLowerCase()}…`)
    try {
      const r = await exportData(key)
      if (r?.error) return toast.error(r.error, { id })
      const table = [r.headers, ...r.rows]
      if (format === "csv") downloadCsv(table, datedName(ENTITIES[key].label))
      else await downloadXlsx(table, datedName(ENTITIES[key].label))
      toast.success(`${nf(r.rows.length)} exported.`, { id })
    } catch {
      toast.error("The export didn't work. Try again.", { id })
    } finally {
      setBusy(null)
    }
  }
  const failedRows = (h) => downloadXlsx([["Row", "Record", "What's wrong"], ...h.errors.map((x) => [x.row, x.label, x.errors.join("; ")])], `${ENTITIES[h.entity]?.label ?? "Import"} not imported`)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Import & Export" description="Bring data in from Excel or CSV (another CRM, old spreadsheets) and take it out again, as your role allows in each app" />
      {shown.length === 0 ? (
        <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Your role can&apos;t import or export any data.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((key) => {
            const e = ENTITIES[key]
            const a = access[key]
            return (
              <section key={key} aria-label={e.label} className="flex flex-col rounded-xl border bg-background p-5 shadow-xs">
                <header className="flex items-center gap-3">
                  <AppIcon icon={e.icon} color={COLOR[key]} size="sm" className="size-10 rounded-xl text-lg" />
                  <span>
                    <h2 className="font-semibold">{e.label}</h2>
                    <p className="text-xs text-muted-foreground">Matches by: {e.matchBy.toLowerCase()}</p>
                  </span>
                </header>
                {e.note && <p className="mt-3 text-sm text-muted-foreground">{e.note}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {a.import && (
                    <>
                      <Button size="sm" leftIcon="upload-2-line" onClick={() => setImporting(key)}>
                        Import
                      </Button>
                      <Button size="sm" variant="ghost" leftIcon="file-download-line" onClick={() => downloadXlsx(templateRows(e), `${e.label} import template`)}>
                        Template
                      </Button>
                    </>
                  )}
                  {a.export && (
                    <>
                      <Button size="sm" variant="outline" leftIcon="file-excel-2-line" loading={busy === `${key}:xlsx`} disabled={Boolean(busy)} onClick={() => exportAs(key, "xlsx")}>
                        Excel
                      </Button>
                      <Button size="sm" variant="outline" leftIcon="file-text-line" loading={busy === `${key}:csv`} disabled={Boolean(busy)} onClick={() => exportAs(key, "csv")}>
                        CSV
                      </Button>
                    </>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <SectionCard title="Import history" bodyClassName="p-0">
        {history.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <ul className="divide-y">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 basis-60">
                  <span className="flex items-center gap-2 font-medium">
                    {ENTITIES[h.entity]?.label ?? h.entity}
                    {h.mode === "update" && <Badge color="gray">Update</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {h.fileName ?? "File"} · {h.by ?? "Someone"} · {timeAgo(h.at)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {nf(h.created)} added{h.updated ? ` · ${nf(h.updated)} updated` : ""}
                  {h.skipped ? ` · ${nf(h.skipped)} skipped` : ""} of {nf(h.total)}
                </span>
                {h.failed > 0 ? (
                  <Button size="sm" variant="outline" leftIcon="download-2-line" onClick={() => failedRows(h)}>
                    {nf(h.failed)} failed
                  </Button>
                ) : (
                  <Badge color="green">All in</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {importing && (
        <ImportDialog
          entity={importing}
          onClose={() => {
            setImporting(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
