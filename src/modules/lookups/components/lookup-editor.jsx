"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { Badge } from "@/components/ui/badge"
import { ColorPicker } from "@/components/ui/color-picker"
import { IconPicker } from "@/components/ui/icon-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { ScrollView } from "@/components/ui/scroll-view"
import { Tooltip } from "@/components/ui/tooltip"
import { LOOKUP_APPS, slugify } from "../catalog"
import { resetLookupList, saveLookupList } from "../actions"

function Preview({ list, v }) {
  if (list.colored)
    return (
      <Badge color={toHex(v.color) ?? "gray"} dot={!v.icon}>
        {v.icon && <Icon name={v.icon} />}
        {v.label || "—"}
      </Badge>
    )
  return (
    <span className="flex items-center gap-1.5 text-sm">
      {v.icon && <Icon name={v.icon} className="text-base text-muted-foreground" />}
      {v.label || "—"}
      {v.meta?.premium != null && <span className="text-xs text-muted-foreground">+{v.meta.premium}%</span>}
    </span>
  )
}

// Extra per-list field: premium %, plural…
function MetaField({ field, value, onChange }) {
  if (field.type === "select") return <Select aria-label={field.label} size="sm" triggerClassName="w-44" value={value ?? field.options[0].value} onChange={onChange} options={field.options} />
  if (field.type === "number")
    return <NumberInput aria-label={field.label} size="sm" className="w-24" min={field.min} max={field.max} suffix={field.label.endsWith("%") ? "%" : undefined} value={value ?? null} onChange={(n) => onChange(n ?? 0)} />
  return <Input aria-label={field.label} size="sm" className="w-32" maxLength={field.maxLength} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
}

function ListEditor({ list, onDirtyChange, message, setMessage }) {
  const router = useRouter()
  const [values, setValues] = useState(list.values)
  const [newLabel, setNewLabel] = useState("")
  const [pending, startTransition] = useTransition()
  const system = list.kind === "system"
  const dirty = JSON.stringify(values) !== JSON.stringify(list.values)

  // Tell the list picker about unsaved edits
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  const patch = (i, p) => {
    setValues((vs) => vs.map((v, k) => (k === i ? { ...v, ...p } : v)))
    setMessage(null)
  }
  const move = (i, dir) =>
    setValues((vs) => {
      const next = [...vs]
      const [row] = next.splice(i, 1)
      next.splice(i + dir, 0, row)
      return next
    })

  const add = () => {
    const label = newLabel.trim()
    if (!label) return
    if (values.some((v) => v.label.toLowerCase() === label.toLowerCase())) {
      setMessage({ tone: "error", text: `"${label}" is already in the list.` })
      return
    }
    let key = list.valueIsLabel ? label.slice(0, 60) : slugify(label) || `value-${values.length + 1}`
    for (let n = 2; values.some((v) => v.value === key); n++) key = `${slugify(label)}-${n}`
    const meta = Object.fromEntries(list.fields.map((f) => [f.key, f.type === "number" ? (f.default ?? 0) : f.type === "select" ? f.options[0].value : ""]))
    setValues((vs) => [
      ...vs,
      {
        value: key,
        label,
        color: list.colored ? "gray" : null,
        icon: null,
        meta,
        isDefault: false,
        active: true,
      },
    ])
    setNewLabel("")
    setMessage(null)
  }

  const run = (fn, success) =>
    startTransition(async () => {
      const result = await fn()
      if (result?.error) setMessage({ tone: "error", text: result.error })
      else {
        setMessage({ tone: "success", text: success })
        router.refresh()
      }
    })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{list.name}</h2>
            {system ? (
              <Tooltip side="bottom" content="The app relies on these values. Rename, recolour and reorder them; they can't be added, removed or switched off.">
                <Badge color="gray">
                  <Icon name="lock-line" /> System list
                </Badge>
              </Tooltip>
            ) : (
              <Badge color="blue">Custom list</Badge>
            )}
            {list.customised && <Badge color="amber">Customised</Badge>}
          </div>
          {list.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{list.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {list.customised && (
            <Button variant="ghost" leftIcon="arrow-go-back-line" disabled={pending} onClick={() => run(() => resetLookupList(list.key), "Restored the default values.")}>
              Reset to defaults
            </Button>
          )}
          <Button variant="outline" disabled={!dirty} onClick={() => setValues(list.values)}>
            Discard
          </Button>
          <Button leftIcon="save-3-line" loading={pending} disabled={!dirty} onClick={() => run(() => saveLookupList(list.key, values), "Saved. Every screen in this workspace now uses the new values.")}>
            Save
          </Button>
        </div>
      </header>

      {message && (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("flex items-center gap-2 border-b px-5 py-2 text-sm", message.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300")}
        >
          <Icon name={message.tone === "error" ? "error-warning-line" : "checkbox-circle-line"} /> {message.text}
        </div>
      )}

      <ScrollView className="min-h-0 flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="w-20 px-3 py-2 text-left font-medium">Order</th>
              {list.colored && <th className="w-40 px-2 py-2 text-left font-medium">Colour</th>}
              <th className="min-w-56 px-2 py-2 text-left font-medium">Label</th>
              {list.icons && <th className="px-2 py-2 text-left font-medium">Icon</th>}
              {list.fields.map((f) => (
                <th key={f.key} className="px-2 py-2 text-left font-medium">
                  {f.label}
                </th>
              ))}
              <th className="hidden px-2 py-2 text-left font-medium lg:table-cell">Preview</th>
              {list.defaultable && (
                <th className="w-20 px-2 py-2 text-center font-medium" title="Preselected in forms">
                  Default
                </th>
              )}
              <th className="w-20 px-2 py-2 text-center font-medium">Active</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {values.map((v, i) => (
              <tr key={v.value} className={cn(!v.active && "bg-muted/40 text-muted-foreground")}>
                <td className="px-3 py-1.5">
                  <div className="flex">
                    <Button variant="ghost" size="smicon" leftIcon="arrow-up-s-line" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                    <Button variant="ghost" size="smicon" leftIcon="arrow-down-s-line" aria-label="Move down" disabled={i === values.length - 1} onClick={() => move(i, 1)} />
                  </div>
                </td>
                {list.colored && (
                  <td className="px-2 py-1.5">
                    <ColorPicker aria-label={`Colour for ${v.label}`} size="sm" className="w-36" value={toHex(v.color) ?? "#64748b"} onChange={(color) => patch(i, { color })} />
                  </td>
                )}
                <td className="min-w-56 px-2 py-1.5">
                  <Input aria-label="Label" size="sm" value={v.label} onChange={(e) => patch(i, { label: e.target.value })} />
                  {!v.isDefault && <span className="mt-0.5 block text-[10px] text-muted-foreground">Added by your workspace</span>}
                </td>
                {list.icons && (
                  <td className="px-2 py-1.5">
                    <IconPicker aria-label={`Icon for ${v.label}`} size="sm" className="w-52" value={v.icon ?? ""} onChange={(icon) => patch(i, { icon: icon ?? null })} />
                  </td>
                )}
                {list.fields.map((f) => (
                  <td key={f.key} className="px-2 py-1.5">
                    <MetaField field={f} value={v.meta?.[f.key]} onChange={(val) => patch(i, { meta: { ...v.meta, [f.key]: val } })} />
                  </td>
                ))}
                <td className="hidden px-2 py-1.5 lg:table-cell">
                  <Preview list={list} v={v} />
                </td>
                {list.defaultable && (
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="radio"
                      name={`default-${list.key}`}
                      aria-label={`Make ${v.label} the default`}
                      title="Preselected in forms"
                      className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
                      checked={Boolean(v.preselected)}
                      disabled={!v.active}
                      onChange={() => setValues((vs) => vs.map((x, k) => ({ ...x, preselected: k === i })))}
                      onClick={() => v.preselected && patch(i, { preselected: false })}
                    />
                  </td>
                )}
                <td className="px-2 py-1.5 text-center">
                  <Checkbox
                    aria-label={`${v.label} active`}
                    className="justify-center"
                    checked={v.active}
                    disabled={system}
                    onChange={(on) =>
                      patch(i, {
                        active: on,
                        ...(on ? {} : { preselected: false }),
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  {!v.isDefault && (
                    <Button
                      variant="ghost"
                      size="smicon"
                      leftIcon="delete-bin-6-line"
                      aria-label={`Delete ${v.label}`}
                      onClick={() => {
                        setValues((vs) => vs.filter((_, k) => k !== i))
                        setMessage(null)
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollView>

      {!system && (
        <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
          <div className="w-72 max-w-full">
            <Input
              aria-label="New value"
              placeholder={`Add to ${list.name.toLowerCase()}…`}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  add()
                }
              }}
            />
          </div>
          <Button variant="outline" leftIcon="add-line" disabled={!newLabel.trim()} onClick={add}>
            Add value
          </Button>
          <p className="text-xs text-muted-foreground">Values that came with PropFlow can be switched off but not deleted, so older records keep their label.</p>
        </div>
      )}
    </div>
  )
}

// Two-pane editor of pick-lists: lists on the left, the chosen list's values on the right.
// lists: getLookupLists(db, apps) from the page
// initialKey: open on this list (e.g. ?list=project-document-type); lists are A–Z within each app
export function LookupEditor({ lists: unsorted, initialKey }) {
  const lists = useMemo(() => [...unsorted].sort((a, b) => a.name.localeCompare(b.name)), [unsorted])
  const start = lists.find((l) => l.key === initialKey) ?? lists[0]
  const [selectedKey, setSelectedKey] = useState(start?.key)
  const [search, setSearch] = useState("")
  const [pendingKey, setPendingKey] = useState(null) // waiting on "discard changes?"
  const [dirty, setDirty] = useState(false)
  // Kept here so "Saved" survives the editor reloading with the saved values
  const [message, setMessage] = useState(null)

  const selected = lists.find((l) => l.key === selectedKey) ?? lists[0]
  const q = search.trim().toLowerCase()
  const shown = q ? lists.filter((l) => [l.name, l.description, ...l.values.map((v) => v.label)].some((t) => t?.toLowerCase().includes(q))) : lists
  const apps = [...new Set(lists.map((l) => l.app))]
  const groups = apps.map((app) => ({ app, lists: shown.filter((l) => l.app === app) })).filter((g) => g.lists.length)
  // Collapsed sections: all but the one holding the first list start folded
  const [collapsed, setCollapsed] = useState(() => new Set(apps.filter((a) => a !== start?.app)))
  const toggleGroup = (app) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(app)) next.delete(app)
      else next.add(app)
      return next
    })

  const choose = (key) => {
    if (dirty && key !== selected.key) setPendingKey(key)
    else {
      setSelectedKey(key)
      setMessage(null)
    }
  }

  return (
    <div className="grid h-full min-h-0 overflow-hidden rounded-xl border bg-background shadow-xs md:grid-cols-[17rem_minmax(0,1fr)]">
      <nav aria-label="Lists" className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
        <div className="border-b p-3">
          <Input type="search" size="sm" placeholder="Find a list or value…" aria-label="Find a list" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
        </div>
        <ScrollView className="max-h-60 min-h-0 flex-1 md:max-h-none" viewportClassName="p-2">
          {groups.map((g) => {
            // Sections fold away; searching opens every section with a match
            const open = apps.length === 1 || q || !collapsed.has(g.app)
            return (
              <div key={g.app} className="mb-2">
                {apps.length > 1 && (
                  <button
                    type="button"
                    aria-expanded={Boolean(open)}
                    onClick={() => toggleGroup(g.app)}
                    className="flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name="arrow-right-s-line" className={cn("text-sm transition-transform", open && "rotate-90")} />
                    <span className="flex-1">{LOOKUP_APPS[g.app] ?? g.app}</span>
                    <span className="font-normal tabular-nums">{g.lists.length}</span>
                  </button>
                )}
                {open &&
                  g.lists.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => choose(l.key)}
                      aria-current={l.key === selected?.key}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        // Under a section heading, line up with its text (after the arrow)
                        apps.length > 1 && "pl-[1.625rem]",
                        l.key === selected?.key && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      {l.customised && <span className="size-1.5 rounded-full bg-amber-500" aria-label="Customised" />}
                      {l.kind === "system" && <Icon name="lock-line" className="text-xs text-muted-foreground" />}
                      <span className="text-xs text-muted-foreground tabular-nums">{l.values.filter((v) => v.active).length}</span>
                    </button>
                  ))}
              </div>
            )
          })}
          {!groups.length && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No lists match.</p>}
        </ScrollView>
      </nav>

      <section className="min-h-0">
        {selected ? (
          // Remount when the list or its saved values change, so edits start from what's stored
          <ListEditor key={`${selected.key}:${JSON.stringify(selected.values)}`} list={selected} onDirtyChange={setDirty} message={message} setMessage={setMessage} />
        ) : (
          <p className="p-10 text-center text-sm text-muted-foreground">No lists.</p>
        )}
      </section>

      {pendingKey && (
        <Dialog
          open
          onOpenChange={(o) => !o && setPendingKey(null)}
          className="sm:max-w-sm"
          title="Discard unsaved changes?"
          description={`Your changes to ${selected.name.toLowerCase()} haven't been saved.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setPendingKey(null)}>
                Keep editing
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setSelectedKey(pendingKey)
                  setDirty(false)
                  setMessage(null)
                  setPendingKey(null)
                }}
              >
                Discard
              </Button>
            </>
          }
        />
      )}
    </div>
  )
}
