"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { confirm } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconPicker } from "@/components/ui/icon-picker"
import { BaseSwitch } from "@/components/ui/switch"
import { Tooltip } from "@/components/ui/tooltip"
import { slugify } from "@/modules/lookups/catalog"
import { saveLookupList } from "@/modules/lookups/actions"

// Sales › Customize › Booking documents: the checklist every booking's Documents tab follows,
// grouped by the step a document is needed before. Compact rows: icon, name, step, required, on.
// Saved as the "booking-document" list (meta.gate, meta.required), like any other list.
//   list: getLookupLists(...) entry for "booking-document"; canEdit: may change it

const GATES = [
  { value: "allotment", label: "Before the allotment letter", short: "Allotment letter", icon: "file-paper-2-line" },
  { value: "handover", label: "Before handover", short: "Handover", icon: "key-2-line" },
  { value: "possession", label: "Before possession", short: "Possession", icon: "home-smile-line" },
  { value: "", label: "Any time", short: "Any time", icon: "folder-2-line" },
]

const fromList = (list) => list.values.map((v) => ({ ...v, meta: { gate: v.meta?.gate ?? "", required: v.meta?.required ?? "no" } }))
const snapshot = (rows) => JSON.stringify(rows.map((r) => [r.value, r.label, r.icon, r.meta.gate, r.meta.required, r.active]))

export function BookingDocumentsEditor({ list, canEdit }) {
  const router = useRouter()
  const [rows, setRows] = useState(() => fromList(list))
  const [saved, setSaved] = useState(() => snapshot(fromList(list)))
  const [pending, startTransition] = useTransition()
  const dirty = snapshot(rows) !== saved
  const counts = useMemo(() => ({ total: rows.filter((r) => r.active).length, required: rows.filter((r) => r.active && r.meta.required === "yes").length }), [rows])

  const update = (value, patch) => setRows((rs) => rs.map((r) => (r.value === value ? { ...r, ...patch, meta: { ...r.meta, ...(patch.meta ?? {}) } } : r)))
  // Move within its group: swap with the nearest row of the same step
  const move = (value, dir) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.value === value)
      const gate = rs[i].meta.gate
      let j = i + dir
      while (j >= 0 && j < rs.length && rs[j].meta.gate !== gate) j += dir
      if (j < 0 || j >= rs.length) return rs
      const next = [...rs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const add = (gate) => {
    let n = 1
    while (rows.some((r) => r.value === `document-${n}`)) n++
    setRows((rs) => [...rs, { value: `document-${n}`, label: "", icon: "file-text-line", color: null, active: true, isDefault: false, isNew: true, meta: { gate, required: "yes" } }])
  }
  const remove = (value) => setRows((rs) => rs.filter((r) => r.value !== value))

  const save = () =>
    startTransition(async () => {
      if (rows.some((r) => !r.label.trim())) return toast.error("Give every document a name.")
      // New rows get a key from their name (kept once saved)
      const taken = new Set(rows.filter((r) => !r.isNew).map((r) => r.value))
      const values = rows.map((r) => {
        if (!r.isNew) return r
        let key = slugify(r.label) || r.value
        for (let n = 2; taken.has(key); n++) key = `${slugify(r.label)}-${n}`
        taken.add(key)
        return { ...r, value: key }
      })
      const res = await saveLookupList(
        "booking-document",
        values.map((r) => ({ value: r.value, label: r.label.trim(), icon: r.icon || null, meta: r.meta, active: r.active })),
      )
      if (res?.error) return toast.error(res.error)
      const clean = values.map((r) => ({ ...r, isNew: false }))
      setRows(clean)
      setSaved(snapshot(clean))
      toast.success("Booking documents saved.")
      router.refresh()
    })
  const discard = async () => {
    if (await confirm({ title: "Discard unsaved changes?", description: "Your changes to the booking documents checklist will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }))
      setRows(fromList(list))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Booking documents</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The checklist on every booking&apos;s Documents tab. {counts.total} documents, {counts.required} required.
          </p>
        </div>
        {canEdit && dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={discard} disabled={pending}>
              Discard
            </Button>
            <Button leftIcon="check-line" loading={pending} onClick={save}>
              Save changes
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {GATES.map((g) => {
          const items = rows.filter((r) => r.meta.gate === g.value)
          return (
            <section key={g.value || "any"} className="overflow-hidden rounded-xl border bg-background shadow-xs">
              <header className="flex h-11 items-center gap-2 border-b bg-muted/40 px-3">
                <Icon name={g.icon} className="text-base text-muted-foreground" />
                <h2 className="text-sm font-semibold">{g.label}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">{items.filter((r) => r.active).length}</span>
                {canEdit && (
                  <Button size="sm" variant="ghost" leftIcon="add-line" className="ml-auto h-7" onClick={() => add(g.value)}>
                    Add
                  </Button>
                )}
              </header>
              {items.length ? (
                <ul className="divide-y">
                  {items.map((r, i) => (
                    <li key={r.value} className={cn("flex items-center gap-2 px-2 py-1.5", !r.active && "bg-muted/30")}>
                      <IconPicker iconOnly size="sm" aria-label={`Icon for ${r.label || "document"}`} value={r.icon} onChange={(v) => update(r.value, { icon: v })} disabled={!canEdit} className="w-auto shrink-0" />
                      <input
                        aria-label="Document name"
                        placeholder="Document name"
                        value={r.label}
                        autoFocus={r.isNew && !r.label}
                        readOnly={!canEdit}
                        onChange={(e) => update(r.value, { label: e.target.value })}
                        className={cn(
                          "h-control-sm min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground",
                          canEdit && "hover:border-input focus:border-ring focus:ring-[1px] focus:ring-ring/50",
                          !r.active && "text-muted-foreground line-through decoration-muted-foreground/40",
                        )}
                      />
                      <Tooltip content={r.meta.required === "yes" ? "Required: click to make it optional" : "Optional: click to make it required"}>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => update(r.value, { meta: { required: r.meta.required === "yes" ? "no" : "yes" } })}
                          className="shrink-0 cursor-pointer disabled:cursor-default"
                        >
                          <Badge color={r.meta.required === "yes" ? "amber" : "gray"}>{r.meta.required === "yes" ? "Required" : "Optional"}</Badge>
                        </button>
                      </Tooltip>
                      <Tooltip content={r.active ? "On: shown on bookings" : "Off: hidden on bookings"}>
                        <span className="flex shrink-0">
                          <BaseSwitch size="sm" aria-label={`${r.label || "Document"} on`} checked={r.active} disabled={!canEdit} onCheckedChange={(v) => update(r.value, { active: Boolean(v) })} />
                        </span>
                      </Tooltip>
                      {canEdit && (
                        <DropdownMenu
                          align="end"
                          items={[
                            { label: "Move up", icon: <Icon name="arrow-up-line" />, disabled: i === 0, onClick: () => move(r.value, -1) },
                            { label: "Move down", icon: <Icon name="arrow-down-line" />, disabled: i === items.length - 1, onClick: () => move(r.value, 1) },
                            { type: "separator" },
                            ...GATES.filter((o) => o.value !== g.value).map((o) => ({ label: `Move to ${o.short}`, icon: <Icon name={o.icon} />, onClick: () => update(r.value, { meta: { gate: o.value } }) })),
                            ...(r.isDefault ? [] : [{ type: "separator" }, { label: "Delete", icon: <Icon name="delete-bin-line" />, variant: "destructive", onClick: () => remove(r.value) }]),
                          ]}
                          trigger={
                            <button
                              type="button"
                              aria-label={`More for ${r.label || "document"}`}
                              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Icon name="more-2-line" />
                            </button>
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">Nothing needed here.</p>
              )}
            </section>
          )
        })}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon name="information-line" />
        Required documents hold up their step when the workspace enforces documents. Documents that came with PropFlow can be switched off, not deleted.
      </p>
    </div>
  )
}
