"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconPicker } from "@/components/ui/icon-picker"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { BaseSwitch } from "@/components/ui/switch"
import { Tooltip } from "@/components/ui/tooltip"
import { slugify } from "../catalog"
import { resetLookupList, saveLookupList } from "../actions"

// One pick-list as a compact card: a slim header (name, system/custom, Reset, Save when changed)
// and one short row per value: color, icon, name edited in place, the list's own fields, default
// star, on/off and a ⋯ menu (move, delete). Used by Lists & labels and by the Customize tabs that
// hold lists with extra fields (unit types, activity points…).
//   list: getLookupLists(...) entry · canEdit · fill: stretch to the parent's height (two-pane editor)
//   onDirtyChange(bool): unsaved edits, for "discard changes?"

const FIELD_WIDTH = { select: "w-40", number: "w-24", text: "w-28" }
const inline = "h-control-sm min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
const inlineEdit = "hover:border-input focus:border-ring focus:ring-[1px] focus:ring-ring/50"

function Field({ field, value, onChange, disabled }) {
  if (field.type === "select")
    return (
      <Select
        aria-label={field.label}
        size="sm"
        triggerClassName={cn(FIELD_WIDTH.select, "w-full")}
        className={FIELD_WIDTH.select}
        value={value ?? field.options[0].value}
        onChange={onChange}
        options={field.options}
        disabled={disabled}
      />
    )
  if (field.type === "number")
    return (
      <NumberInput
        aria-label={field.label}
        size="sm"
        className={FIELD_WIDTH.number}
        min={field.min}
        max={field.max}
        suffix={field.label.endsWith("%") ? "%" : undefined}
        value={value ?? null}
        onChange={(n) => onChange(n ?? 0)}
        disabled={disabled}
      />
    )
  return (
    <input aria-label={field.label} className={cn(inline, "border-input shadow-xs", FIELD_WIDTH.text)} maxLength={field.maxLength} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
  )
}

export function ListCard({ list, canEdit = true, fill = false, onDirtyChange, className }) {
  const router = useRouter()
  const [values, setValues] = useState(list.values)
  const [newLabel, setNewLabel] = useState("")
  const [pending, startTransition] = useTransition()
  const { confirm } = useAlert()
  const system = list.kind === "system"
  const dirty = JSON.stringify(values) !== JSON.stringify(list.values)
  const inlineFields = list.fields.filter((f) => f.type !== "longtext")
  const longFields = list.fields.filter((f) => f.type === "longtext")
  const activeCount = values.filter((v) => v.active).length

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const patch = (i, p) => setValues((vs) => vs.map((v, k) => (k === i ? { ...v, ...p } : v)))
  const setMeta = (i, key, val) => setValues((vs) => vs.map((v, k) => (k === i ? { ...v, meta: { ...v.meta, [key]: val } } : v)))
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
    if (values.some((v) => v.label.toLowerCase() === label.toLowerCase())) return toast.error(`"${label}" is already in the list.`)
    let key = list.valueIsLabel ? label.slice(0, 60) : slugify(label) || `value-${values.length + 1}`
    for (let n = 2; values.some((v) => v.value === key); n++) key = `${slugify(label)}-${n}`
    const meta = Object.fromEntries(list.fields.map((f) => [f.key, f.type === "number" ? (f.default ?? 0) : f.type === "select" ? f.options[0].value : ""]))
    setValues((vs) => [...vs, { value: key, label, color: list.colored ? "gray" : null, icon: null, meta, isDefault: false, active: true }])
    setNewLabel("")
  }
  const run = (fn, loading, success) =>
    startTransition(async () => {
      const result = await toastAction(fn, { loading, success })
      if (!result?.error) router.refresh()
    })
  const discard = async () => {
    if (await confirm({ title: "Discard unsaved changes?", description: `Your changes to ${list.name.toLowerCase()} will be lost.`, confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }))
      setValues(list.values)
  }
  const reset = async () => {
    const ok = await confirm({
      title: `Reset ${list.name.toLowerCase()} to defaults?`,
      description: "Your custom values, renames, colors and order are replaced with the ones PropFlow came with.",
      confirmLabel: "Reset list",
      destructive: true,
      icon: "arrow-go-back-line",
    })
    if (ok) run(() => resetLookupList(list.key), `Resetting ${list.name.toLowerCase()}…`, `${list.name} reset to defaults.`)
  }

  const header = (
    <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/40 px-3 py-1.5">
      <h2 className="text-sm font-semibold">{list.name}</h2>
      <span className="text-xs text-muted-foreground tabular-nums">{activeCount}</span>
      {system && (
        <Tooltip side="bottom" content="The app relies on these values. Rename, recolor and reorder them; they can't be added, removed or switched off.">
          <Icon name="lock-line" className="text-xs text-muted-foreground" aria-label="System list" />
        </Tooltip>
      )}
      {list.customized && !dirty && (
        <Badge color="amber" className="h-5 text-[11px]">
          Customized
        </Badge>
      )}
      {list.description && (
        <Tooltip side="bottom" content={list.description}>
          <Icon name="information-line" className="text-sm text-muted-foreground" aria-label={list.description} />
        </Tooltip>
      )}
      <div className="ml-auto flex items-center gap-1">
        {canEdit && dirty && (
          <>
            <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={discard}>
              Discard
            </Button>
            <Button size="sm" className="h-7" leftIcon="check-line" loading={pending} onClick={() => run(() => saveLookupList(list.key, values), `Saving ${list.name.toLowerCase()}…`, `${list.name} saved.`)}>
              Save
            </Button>
          </>
        )}
        {canEdit && !dirty && list.customized && (
          <Tooltip content="Back to the values PropFlow came with">
            <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" leftIcon="arrow-go-back-line" disabled={pending} onClick={reset}>
              Reset
            </Button>
          </Tooltip>
        )}
      </div>
    </header>
  )

  const rows = (
    <>
      {inlineFields.length > 0 && (
        <div className="flex items-center gap-2 border-b px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {list.colored && <span className="w-control-sm shrink-0" />}
          {list.icons && <span className="w-control-sm shrink-0" />}
          <span className="min-w-0 flex-1 px-2">Name</span>
          {inlineFields.map((f) => (
            <span key={f.key} className={cn("shrink-0 truncate", FIELD_WIDTH[f.type] ?? FIELD_WIDTH.text)}>
              {f.label}
            </span>
          ))}
          {list.defaultable && <span className="w-7 shrink-0" />}
          <span className="w-6 shrink-0" />
          {canEdit && <span className="w-7 shrink-0" />}
        </div>
      )}
      <ul className="divide-y">
        {values.map((v, i) => (
          <li key={v.value} className={cn("px-2 py-1", !v.active && "bg-muted/30")}>
            <div className="flex items-center gap-2">
              {list.colored && (
                <ColorPicker swatchOnly size="sm" aria-label={`Color for ${v.label}`} value={toHex(v.color) ?? "#64748b"} onChange={(color) => patch(i, { color })} disabled={!canEdit} className="w-auto shrink-0" />
              )}
              {list.icons && (
                <IconPicker iconOnly size="sm" aria-label={`Icon for ${v.label}`} value={v.icon ?? ""} onChange={(icon) => patch(i, { icon: icon ?? null })} disabled={!canEdit} className="w-auto shrink-0" />
              )}
              <input
                aria-label="Name"
                value={v.label}
                readOnly={!canEdit}
                onChange={(e) => patch(i, { label: e.target.value })}
                className={cn(inline, "flex-1", canEdit && inlineEdit, !v.active && "text-muted-foreground line-through decoration-muted-foreground/40")}
              />
              {!v.isDefault && (
                <Tooltip content="Added by your workspace">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary/60" aria-label="Added by your workspace" />
                </Tooltip>
              )}
              {inlineFields.map((f) => (
                <Field key={f.key} field={f} value={v.meta?.[f.key]} onChange={(val) => setMeta(i, f.key, val)} disabled={!canEdit} />
              ))}
              {list.defaultable && (
                <Tooltip content={v.preselected ? "Preselected in forms" : "Make it the one forms preselect"}>
                  <button
                    type="button"
                    aria-label={`Make ${v.label} the default`}
                    aria-pressed={Boolean(v.preselected)}
                    disabled={!canEdit || !v.active}
                    onClick={() => setValues((vs) => vs.map((x, k) => ({ ...x, preselected: k === i ? !v.preselected : false })))}
                    className={cn(
                      "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-base hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
                      v.preselected ? "text-amber-500" : "text-muted-foreground/50 hover:text-muted-foreground",
                    )}
                  >
                    <Icon name={v.preselected ? "star-fill" : "star-line"} />
                  </button>
                </Tooltip>
              )}
              <Tooltip content={system ? "System values are always on" : v.active ? "On" : "Off: hidden in forms"}>
                <span className="flex w-6 shrink-0 justify-center">
                  <BaseSwitch size="sm" aria-label={`${v.label} on`} checked={v.active} disabled={!canEdit || system} onCheckedChange={(on) => patch(i, { active: Boolean(on), ...(on ? {} : { preselected: false }) })} />
                </span>
              </Tooltip>
              {canEdit && (
                <DropdownMenu
                  align="end"
                  items={[
                    { label: "Move up", icon: "arrow-up-line", disabled: i === 0, onClick: () => move(i, -1) },
                    { label: "Move down", icon: "arrow-down-line", disabled: i === values.length - 1, onClick: () => move(i, 1) },
                    ...(v.isDefault ? [] : [{ type: "separator" }, { label: "Delete", icon: "delete-bin-line", variant: "destructive", onClick: () => setValues((vs) => vs.filter((_, k) => k !== i)) }]),
                  ]}
                  trigger={
                    <button
                      type="button"
                      aria-label={`More for ${v.label}`}
                      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Icon name="more-2-line" />
                    </button>
                  }
                />
              )}
            </div>
            {longFields.map((f) => (
              <div key={f.key} className={cn("pt-0.5 pb-1", list.icons ? "pl-[calc(var(--control-height-sm)+0.5rem)]" : "pl-0")}>
                <textarea
                  aria-label={`${f.label} for ${v.label}`}
                  rows={2}
                  maxLength={f.maxLength}
                  readOnly={!canEdit}
                  placeholder="The full text added when someone taps it"
                  value={v.meta?.[f.key] ?? ""}
                  onChange={(e) => setMeta(i, f.key, e.target.value)}
                  className={cn(
                    "block w-full resize-y rounded-md border bg-muted/30 px-2 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground",
                    canEdit && "focus:border-ring focus:ring-[1px] focus:ring-ring/50",
                  )}
                />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  )

  const footer = canEdit && !system && (
    <div className="flex shrink-0 items-center gap-2 border-t px-2 py-1.5">
      <Icon name="add-line" className="ml-1.5 text-muted-foreground" />
      <input
        aria-label={`Add to ${list.name}`}
        placeholder={`Add to ${list.name.toLowerCase()}…`}
        value={newLabel}
        onChange={(e) => setNewLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            add()
          }
        }}
        className={cn(inline, "flex-1", inlineEdit)}
      />
      {newLabel.trim() && (
        <Button size="sm" variant="outline" className="h-7" onClick={add}>
          Add
        </Button>
      )}
    </div>
  )

  return (
    <section className={cn("flex flex-col overflow-hidden rounded-xl border bg-background shadow-xs", fill && "h-full min-h-0", className)}>
      {header}
      {fill ? (
        <ScrollView variant="subtle" className="min-h-0 flex-1">
          {rows}
        </ScrollView>
      ) : (
        rows
      )}
      {footer}
    </section>
  )
}
