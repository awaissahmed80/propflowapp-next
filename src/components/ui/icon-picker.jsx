"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"
import { Label } from "./label"
import { ScrollView } from "./scroll-view"

// Pick any Remix icon, searchable by name and category. Looks and sizes like Input.
//   <IconPicker label="Icon" value="home-4-line" onChange={setIcon} />
// The icon list (src/lib/remix-icons.json, built by scripts/build-icon-index.mjs) loads the first
// time a picker opens. Values are full icon names: "home-4-line", "home-4-fill", "a-b".

const SHOWN = 360 // matches drawn at once; narrow the search for more

let indexPromise
const loadIndex = () => (indexPromise ??= import("@/lib/remix-icons.json").then((m) => m.default))

// "home-4-line" → { base: "home-4", style: "line" }
function split(name) {
  const m = /^(.*)-(line|fill)$/.exec(name ?? "")
  return m ? { base: m[1], style: m[2] } : { base: name ?? "", style: null }
}

function Panel({ value, onPick, onClear, allowEmpty }) {
  const [index, setIndex] = useState(null)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [style, setStyle] = useState(() => split(value).style ?? "line")

  useEffect(() => {
    let alive = true
    loadIndex().then((list) => alive && setIndex(list))
    return () => {
      alive = false
    }
  }, [])

  const categories = useMemo(() => (index ? [...new Set(index.map((i) => i.c))].sort() : []), [index])
  const matches = useMemo(() => {
    if (!index) return []
    const words = query
      .toLowerCase()
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
    return index
      .filter((i) => (!category || i.c === category) && words.every((w) => i.n.includes(w) || i.c.toLowerCase().includes(w)))
      .map((i) => (i.s ? `${i.n}-${i.s.includes(style[0]) ? style : i.s.includes("l") ? "line" : "fill"}` : i.n))
  }, [index, query, category, style])

  return (
    <div className="w-[min(24rem,calc(100vw-2rem))] space-y-2 p-2">
      <div className="flex items-center gap-2">
        <label className="flex h-control flex-1 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-within:border-ring focus-within:ring-[1px] focus-within:ring-ring/50 dark:bg-input/20">
          <Icon name="search-line" className="text-muted-foreground" />
          <input autoFocus aria-label="Search icons" placeholder="Search icons, e.g. home, money…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="cursor-pointer text-muted-foreground hover:text-foreground">
              <Icon name="close-line" />
            </button>
          )}
        </label>
        <div className="flex rounded-md border p-0.5 text-xs" role="radiogroup" aria-label="Style">
          {["line", "fill"].map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={style === s}
              onClick={() => setStyle(s)}
              className={cn("cursor-pointer rounded px-2 py-1 capitalize", style === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <select
        aria-label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="h-control-sm w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/20"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <ScrollView className="h-64 rounded-md border" viewportClassName="p-1.5">
        {!index ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading icons…</p>
        ) : !matches.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No icons match “{query}”.</p>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {matches.slice(0, SHOWN).map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={name === value}
                onClick={() => onPick(name)}
                className={cn(
                  "flex aspect-square cursor-pointer items-center justify-center rounded-md text-lg outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                  name === value && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                <Icon name={name} />
              </button>
            ))}
          </div>
        )}
      </ScrollView>
      <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <span>{index ? (matches.length > SHOWN ? `Showing ${SHOWN} of ${matches.length}. Search to narrow down.` : `${matches.length} icons`) : ""}</span>
        {allowEmpty && value && (
          <button type="button" onClick={onClear} className="cursor-pointer font-medium text-primary hover:underline">
            No icon
          </button>
        )}
      </div>
    </div>
  )
}

// size "sm" matches small inputs (e.g. inside tables)
export function IconPicker({ value, onChange, label, error, required = false, disabled, allowEmpty = true, placeholder = "Choose an icon", size = "default", iconOnly = false, className, "aria-label": ariaLabel }) {
  // iconOnly: a square button showing just the icon (compact rows)
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <div className={cn("grid w-full min-w-0", className)}>
      {label && (
        <Label htmlFor={id} className="mb-0.5 flex flex-row items-center text-base text-muted-foreground">
          {label}
          {required && <span className="text-sm text-destructive">*</span>}
        </Label>
      )}
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ?? (label ? undefined : "Icon")}
          aria-invalid={!!error}
          className={cn(
            "flex min-w-0 cursor-pointer items-center gap-2 rounded-md border text-sm transition-[color,box-shadow] outline-0",
            iconOnly
              ? cn("justify-center border-transparent bg-muted/70 px-0 hover:bg-muted", size === "sm" ? "h-control-sm w-control-sm" : "h-control w-control")
              : cn("w-full border-input bg-transparent px-3 shadow-xs dark:bg-input/20", size === "sm" ? "h-control-sm" : "h-control"),
            "focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring/50 data-popup-open:border-ring data-popup-open:ring-[1px] data-popup-open:ring-ring/50",
            "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {/* Like an input's start icon, then the name as plain text */}
          <Icon name={value || "question-line"} className={cn("shrink-0 text-base", !value && "text-muted-foreground")} />
          {!iconOnly && (
            <>
              <span className={cn("min-w-0 flex-1 truncate text-left", !value && "text-muted-foreground")}>{value || placeholder}</span>
              <Icon name="arrow-down-s-line" className="text-base text-muted-foreground" />
            </>
          )}
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
            <PopoverPrimitive.Popup className="z-50 origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0">
              {open && (
                <Panel
                  value={value}
                  allowEmpty={allowEmpty}
                  onPick={(name) => {
                    onChange(name)
                    setOpen(false)
                  }}
                  onClear={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                />
              )}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {error && <div className="text-[13px] text-destructive">{error}</div>}
    </div>
  )
}
