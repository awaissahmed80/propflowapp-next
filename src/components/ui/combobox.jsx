"use client"

import { useMemo, useState } from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { cn } from "cn"
import { Icon } from "./icon"
import { Label } from "./label"

const CREATE = "__create__"

function ComboboxContent({ className, children, ...props }) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) min-w-56 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxItem({ className, children, ...props }) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="pointer-events-none absolute right-2 flex items-center">
        <Icon name="check-line" className="text-base" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

// Searchable picker.
// options: [{ value, label, description?, icon? }]
// creatable + onCreate(text): offers "Add “text”" when nothing matches exactly
// clearOnSelect: acts as an "add item" picker (input resets, nothing stays selected)
// clearable: an × to empty the choice (on by default; off for required fields)
function Combobox({
  options = [],
  value = null,
  onChange,
  onCreate,
  creatable = false,
  createLabel = "Add",
  clearOnSelect = false,
  clearable = true,
  placeholder = "Search…",
  emptyText = "No matches",
  label,
  error,
  size = "default",
  className,
  ...props
}) {
  const selected = options.find((o) => o.value === value) ?? null
  // The input shows the selected option's label; typing filters from there
  const [query, setQuery] = useState(clearOnSelect ? "" : (selected?.label ?? ""))

  // Follow value changes made from outside (prefilled forms, "add new" dialogs)
  const [shownLabel, setShownLabel] = useState(selected?.label ?? null)
  if (!clearOnSelect && (selected?.label ?? null) !== shownLabel) {
    setShownLabel(selected?.label ?? null)
    setQuery(selected?.label ?? "")
  }

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const showingSelection = !clearOnSelect && selected && query === selected.label
    const matches = q && !showingSelection ? options.filter((o) => [o.label, o.description].some((t) => t?.toLowerCase().includes(q))) : options
    const exact = options.some((o) => o.label.toLowerCase() === q)
    return creatable && q && !exact && !showingSelection ? [...matches, { value: CREATE, label: query.trim() }] : matches
  }, [options, query, creatable, clearOnSelect, selected])

  const handleChange = (option) => {
    if (!option) return onChange?.(null)
    if (option.value === CREATE) onCreate?.(option.label)
    else onChange?.(option.value, option)
    setQuery(clearOnSelect ? "" : option.label)
  }

  return (
    <div className={className}>
      {label && <Label className="mb-0.5 text-base text-muted-foreground">{label}</Label>}
      <ComboboxPrimitive.Root
        items={items}
        filteredItems={items}
        inputValue={query}
        onInputValueChange={(v) => setQuery(v)}
        value={clearOnSelect ? null : selected}
        onValueChange={handleChange}
        itemToStringLabel={(o) => (clearOnSelect ? "" : (o?.label ?? ""))}
        isItemEqualToValue={(a, b) => a?.value === b?.value}
        autoHighlight
        {...props}
      >
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border border-input bg-transparent pr-1 pl-3 text-sm shadow-xs transition-[color,box-shadow] dark:bg-input/20",
            "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[1px] has-[input:focus-visible]:ring-ring/50",
            error && "border-destructive",
            size === "sm" ? "h-control-sm" : size === "lg" ? "h-control-lg" : "h-control",
          )}
        >
          <Icon name="search-line" className="shrink-0 text-base text-muted-foreground" />
          <ComboboxPrimitive.Input placeholder={placeholder} aria-invalid={!!error} className="h-full min-w-0 flex-1 bg-transparent outline-0 placeholder:text-muted-foreground" />
          {clearable && !clearOnSelect && (selected || query) && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                setQuery("")
                if (selected) onChange?.(null)
              }}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Icon name="close-line" className="text-base" />
            </button>
          )}
          <ComboboxPrimitive.Trigger aria-label="Show options" className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent">
            <Icon name="arrow-down-s-line" className="text-base" />
          </ComboboxPrimitive.Trigger>
        </div>
        <ComboboxContent>
          <ComboboxPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground empty:hidden">{emptyText}</ComboboxPrimitive.Empty>
          <ComboboxPrimitive.List className="max-h-72 overflow-y-auto p-1 empty:hidden">
            {(option) =>
              option.value === CREATE ? (
                <ComboboxItem key={CREATE} value={option} className="border-t text-primary">
                  <Icon name="add-circle-line" className="text-base" />
                  <span className="truncate">
                    {createLabel} “{option.label}”
                  </span>
                </ComboboxItem>
              ) : (
                <ComboboxItem key={option.value} value={option}>
                  {option.icon && <Icon name={option.icon} className="text-base text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                  </span>
                </ComboboxItem>
              )
            }
          </ComboboxPrimitive.List>
        </ComboboxContent>
      </ComboboxPrimitive.Root>
      {error && <div className="text-[13px] text-destructive">{error}</div>}
    </div>
  )
}

export { Combobox, ComboboxContent, ComboboxItem }
