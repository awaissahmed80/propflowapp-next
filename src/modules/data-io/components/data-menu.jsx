"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { ENTITIES, templateRows } from "../entities"
import { datedName, downloadCsv, downloadXlsx } from "../download"
import { exportData } from "../server/actions"
import { ImportDialog } from "./import-dialog"

// "Import / Export" on a list (Leads, Contacts, Inventory, Employees): import from Excel or CSV, a
// template, and export everything this person may see as Excel or CSV.
//   entity: leads | contacts | units | employees · can: { import, export }
//   extra: more entities to import from here (Leads: their activities)

export function DataMenu({ entity, can = {}, extra = [], size = "default" }) {
  const router = useRouter()
  const [importing, setImporting] = useState(null)
  const [busy, setBusy] = useState(false)
  const e = ENTITIES[entity]
  if (!can.import && !can.export) return null

  const exportAs = async (format, key = entity) => {
    setBusy(true)
    const id = toast.loading(`Exporting ${ENTITIES[key].label.toLowerCase()}…`)
    try {
      const r = await exportData(key)
      if (r?.error) return toast.error(r.error, { id })
      const table = [r.headers, ...r.rows]
      const name = datedName(ENTITIES[key].label)
      if (format === "csv") downloadCsv(table, name)
      else await downloadXlsx(table, name)
      toast.success(`${r.rows.length.toLocaleString("en-US")} ${r.rows.length === 1 ? ENTITIES[key].one : ENTITIES[key].label.toLowerCase()} exported.`, { id })
    } catch {
      toast.error("The export didn't work. Try again.", { id })
    } finally {
      setBusy(false)
    }
  }

  const items = [
    ...(can.import
      ? [
          { type: "label", label: "Import" },
          { label: `${e.label} from Excel or CSV…`, icon: "upload-2-line", onClick: () => setImporting(entity) },
          ...extra.map((k) => ({ label: `${ENTITIES[k].label}…`, icon: ENTITIES[k].icon, onClick: () => setImporting(k) })),
          { label: "Download the template", icon: "file-download-line", onClick: () => downloadXlsx(templateRows(e), `${e.label} import template`) },
        ]
      : []),
    ...(can.export
      ? [
          ...(can.import ? [{ type: "separator" }] : []),
          { type: "label", label: "Export" },
          { label: "Excel (.xlsx)", icon: "file-excel-2-line", disabled: busy, onClick: () => exportAs("xlsx") },
          { label: "CSV", icon: "file-text-line", disabled: busy, onClick: () => exportAs("csv") },
          ...extra.map((k) => ({ label: `${ENTITIES[k].label} (Excel)`, icon: ENTITIES[k].icon, disabled: busy, onClick: () => exportAs("xlsx", k) })),
        ]
      : []),
  ]
  return (
    <>
      <DropdownMenu
        align="end"
        items={items}
        trigger={
          <Button variant="outline" size={size} leftIcon="arrow-up-down-line" loading={busy}>
            Import / Export
          </Button>
        }
      />
      {importing && (
        <ImportDialog
          entity={importing}
          onClose={() => setImporting(null)}
          onDone={(r) => {
            if (r.created || r.updated) router.refresh()
          }}
        />
      )}
    </>
  )
}
