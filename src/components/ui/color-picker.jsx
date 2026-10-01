"use client"

import { useId, useState } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "@/lib/utils"
import { normalizeHex, readableOn } from "@/lib/color"
import { Icon } from "./icon"
import { Label } from "./label"

// Colour picker: a swatch button that opens a card with a big preview of the colour and its hex,
// preset swatches, and a hex field for any other colour. Values are lowercase "#rrggbb".
//   <ColorPicker label="Colour" value={hex} onChange={setHex} />
//   colors: the preset swatches (defaults to PRESET_COLORS)

// Twenty to pick from: the rainbow, two greys and the brand blue
export const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#1528a0", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#f43f5e", "#64748b", "#78716c",
]

// The card on its own, for use inside other popovers or forms
export function ColorPickerPanel({ value, onChange, colors = PRESET_COLORS, className }) {
  const current = normalizeHex(value) ?? colors[0]
  // The field shows what's typed; it only sets the colour once it's a valid hex
  const [draft, setDraft] = useState(current.toUpperCase())
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : current.toUpperCase()

  return (
    <div className={cn("w-56 overflow-hidden rounded-lg bg-popover text-popover-foreground", className)}>
      <div className="flex h-24 items-center justify-center text-xl font-medium tracking-wide transition-colors" style={{ backgroundColor: current, color: readableOn(current) }}>
        {current}
      </div>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-5 gap-2" role="listbox" aria-label="Preset colours">
          {colors.map((c) => {
            const selected = c.toLowerCase() === current
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={c}
                title={c}
                onClick={() => {
                  onChange(c.toLowerCase())
                  setEditing(false)
                }}
                className={cn(
                  "flex aspect-square cursor-pointer items-center justify-center rounded-md outline-none ring-offset-2 ring-offset-popover transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "ring-2 ring-foreground/70"
                )}
                style={{ backgroundColor: c, color: readableOn(c) }}
              >
                {selected && <Icon name="check-line" className="text-sm" />}
              </button>
            )
          })}
        </div>
        <label className="flex h-control items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[1px] focus-within:ring-ring/50 dark:bg-input/20">
          <span className="size-4 shrink-0 rounded-sm border" style={{ backgroundColor: normalizeHex(shown) ?? current }} aria-hidden />
          <input
            aria-label="Hex colour"
            spellCheck={false}
            maxLength={7}
            value={shown}
            onFocus={(e) => {
              setDraft(current.toUpperCase())
              setEditing(true)
              e.target.select()
            }}
            onChange={(e) => {
              const text = e.target.value.toUpperCase()
              setDraft(text)
              const hex = normalizeHex(text)
              if (hex && (text.replace("#", "").length === 6 || text.replace("#", "").length === 3)) onChange(hex)
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            className="min-w-0 flex-1 bg-transparent uppercase outline-none"
          />
        </label>
      </div>
    </div>
  )
}

// Swatch field + popover card. Looks and sizes like Input (label, full width, error).
// size "sm" matches small inputs (e.g. inside tables)
export function ColorPicker({ value, onChange, colors = PRESET_COLORS, label, error, required = false, disabled, size = "default", className, "aria-label": ariaLabel }) {
  const id = useId()
  const errorId = `${id}-error`
  const current = normalizeHex(value) ?? colors[0]
  return (
    <div className={cn("grid w-full min-w-0", className)}>
      {label && (
        <Label htmlFor={id} className="mb-0.5 flex flex-row items-center text-base text-muted-foreground">
          {label}
          {required && <span className="text-sm text-destructive">*</span>}
        </Label>
      )}
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ?? (label ? undefined : "Colour")}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-0 dark:bg-input/20",
            size === "sm" ? "h-control-sm" : "h-control",
            "focus-visible:border-ring focus-visible:ring-[1px] focus-visible:ring-ring/50 data-popup-open:border-ring data-popup-open:ring-[1px] data-popup-open:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <span className="size-4 shrink-0 rounded-sm ring-1 ring-black/10 ring-inset" style={{ backgroundColor: current }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left uppercase">{current}</span>
          <Icon name="arrow-down-s-line" className="text-base text-muted-foreground" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={10} className="isolate z-50">
            <PopoverPrimitive.Popup className="z-50 origin-(--transform-origin) rounded-lg shadow-lg ring-1 ring-foreground/10 outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
              {/* Arrow in the preview's colour, like the card hangs from the button */}
              <PopoverPrimitive.Arrow className="data-[side=bottom]:-top-2 data-[side=top]:-bottom-2 data-[side=top]:rotate-180" style={{ "--arrow": current }}>
                <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden>
                  {/* Opened above the button, the arrow meets the white part of the card */}
                  <path d="M0 10 L10 0 L20 10 Z" className="fill-(--arrow) [[data-side=top]_&]:fill-popover" />
                </svg>
              </PopoverPrimitive.Arrow>
              <ColorPickerPanel value={current} onChange={onChange} colors={colors} />
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {error && (
        <div id={errorId} className="text-[13px] text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
