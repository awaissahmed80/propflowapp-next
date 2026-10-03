"use client"

import { useId, useMemo, useRef, useState } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"

// Pick a person (assign a lead, a task…). Looks and sizes like Input: label, full width, error.
// The button shows who's picked with their photo and team; the list has search, "me" first,
// and an optional "Unassigned" choice.
//   people: [{ id, name, avatarUrl?, team? }]; value: id or null; onChange(id | null)
export function PersonPicker({ people, value, onChange, me, label, error, allowNone = true, noneLabel = "Unassigned", placeholder = "Pick someone", disabled, className, "aria-label": ariaLabel }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const listRef = useRef(null)
  const picked = people.find((p) => p.id === value) ?? null

  // Me first, then by name; searching matches names and teams
  const options = useMemo(() => {
    const term = q.trim().toLowerCase()
    const sorted = [...people].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name)))
    const found = term ? sorted.filter((p) => p.name.toLowerCase().includes(term) || (p.team ?? "").toLowerCase().includes(term)) : sorted
    return [...found.map((p) => ({ ...p, key: String(p.id) })), ...(allowNone && !term ? [{ key: "none", id: null, name: noneLabel }] : [])]
  }, [people, q, me, allowNone, noneLabel])

  const choose = (o) => {
    onChange(o.id)
    setOpen(false)
    setQ("")
  }
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const next = Math.max(0, Math.min(options.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)))
      setActive(next)
      listRef.current?.children[next]?.scrollIntoView({ block: "nearest" })
    } else if (e.key === "Enter" && options[active]) {
      e.preventDefault()
      choose(options[active])
    }
  }

  return (
    <div className={cn("grid w-full min-w-0", className)}>
      {label && (
        <Label htmlFor={id} className="mb-0.5 flex flex-row items-center text-base text-muted-foreground">
          {label}
        </Label>
      )}
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (o)
            setActive(
              Math.max(
                0,
                options.findIndex((x) => x.id === value),
              ),
            )
          else setQ("")
        }}
      >
        <PopoverPrimitive.Trigger
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ?? (label ? undefined : "Person")}
          aria-invalid={!!error}
          className={cn(
            "flex h-control w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-0 dark:bg-input/20",
            "focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring/50 data-popup-open:border-ring data-popup-open:ring-[1px] data-popup-open:ring-ring/50",
            "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {picked ? (
            <>
              <Avatar name={picked.name} source={picked.avatarUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate text-left">
                {picked.name}
                {picked.id === me && <span className="text-muted-foreground"> (me)</span>}
                {picked.team && <span className="text-muted-foreground"> · {picked.team}</span>}
              </span>
            </>
          ) : (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                <Icon name="user-line" className="text-xs" />
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">{allowNone ? noneLabel : placeholder}</span>
            </>
          )}
          <Icon name="arrow-down-s-line" className="text-base text-muted-foreground" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={4} className="isolate z-50">
            <PopoverPrimitive.Popup className="z-50 w-(--anchor-width) min-w-64 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
              <div className="flex items-center gap-2 border-b px-3">
                <Icon name="search-line" className="text-muted-foreground" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value)
                    setActive(0)
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Search people…"
                  aria-label="Search people"
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <ul ref={listRef} role="listbox" aria-label={label ?? "People"} className="max-h-64 overflow-y-auto p-1">
                {options.map((o, i) => {
                  const selected = o.id === value
                  return (
                    <li
                      key={o.key}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5", i === active && "bg-accent", o.id === null && "mt-1 border-t pt-2")}
                    >
                      {o.id === null ? (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                          <Icon name="user-unfollow-line" className="text-xs" />
                        </span>
                      ) : (
                        <Avatar name={o.name} source={o.avatarUrl} size="sm" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", o.id === null && "text-muted-foreground")}>
                          {o.name}
                          {o.id === me && <span className="text-muted-foreground"> (me)</span>}
                        </span>
                        {o.team && <span className="block truncate text-xs text-muted-foreground">{o.team}</span>}
                      </span>
                      {selected && <Icon name="check-line" className="text-primary" />}
                    </li>
                  )
                })}
                {options.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No one matches “{q}”</li>}
              </ul>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {error && <div className="text-[13px] text-destructive">{error}</div>}
    </div>
  )
}
