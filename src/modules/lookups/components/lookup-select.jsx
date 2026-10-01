"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Combobox } from "@/components/ui/combobox"
import { activeOptions } from "../options"
import { lookupList } from "../catalog"
import { useLookupsContext } from "../context"
import { addLookupValue } from "../actions"

// Pick a value from a workspace list, searchable. On custom lists, people allowed to edit them
// can type something new and pick "+ Add “…”": it's added to the list on the spot and selected.
//   <LookupSelect list="project-document-type" label="Type" value={v} onChange={setV} />
// values / canAdd / app default to the app's LookupsProvider; pass them where there's none.
// empty: label for "none" (adds that option), e.g. "Not set"
// formatLabel(option): how options read, e.g. authorities as "LDA · Lahore Development Authority"
export function LookupSelect({ list: listKey, values, value, onChange, label, error, placeholder, empty, canAdd, app, size, className, formatLabel, "aria-label": ariaLabel }) {
  const router = useRouter()
  const context = useLookupsContext()
  const [added, setAdded] = useState([]) // values added here, until the page reloads with them
  const [addError, setAddError] = useState("")
  const [pending, startTransition] = useTransition()
  const def = lookupList(listKey)
  const allowAdd = def?.kind === "custom" && (canAdd ?? context.canAdd)

  const all = values ?? context.lists[listKey] ?? []
  const options = [...activeOptions(all), ...added.filter((a) => !all.some((v) => v.value === a.value))]
  // A value switched off since still shows on records that have it
  if (value && !options.some((o) => o.value === value)) options.push({ value, label: all.find((v) => v.value === value)?.label ?? value })
  if (formatLabel) options.forEach((o, i) => (options[i] = { ...o, label: formatLabel(o) }))
  if (empty) options.unshift({ value: "", label: empty })

  const create = (text) =>
    startTransition(async () => {
      setAddError("")
      const result = await addLookupValue(listKey, text, { app: app ?? context.app })
      if (result?.error) return setAddError(result.error)
      setAdded((a) => [...a, { value: result.value, label: result.label }])
      onChange(result.value)
      router.refresh()
    })

  return (
    <Combobox
      aria-label={ariaLabel}
      label={label}
      size={size}
      className={className}
      options={options}
      value={value ?? (empty ? "" : null)}
      // Cleared: an empty choice
      onChange={(v) => onChange(v ?? "")}
      creatable={allowAdd && !pending}
      createLabel="Add"
      onCreate={create}
      placeholder={placeholder ?? (allowAdd ? "Search or add…" : "Search…")}
      error={addError || error}
    />
  )
}
