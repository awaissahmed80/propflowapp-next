"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "cn"
import { Icon } from "./icon"
import { Label } from "./label"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Select } from "./select"
import { RANGE_PRESETS, resolvePreset } from "@/lib/date-range"

// Date / date-time / time pickers (ported from the school-system DatePicker + TimePicker).
// Values are local strings to avoid UTC shifts:
//   DatePicker      → "yyyy-MM-dd"
//   DateTimePicker  → "yyyy-MM-ddTHH:mm"
//   TimePicker      → "HH:mm" (24-hour)
// No date library: calendar grid and labels use Date + Intl.

const WHEEL_ITEM_HEIGHT = 36
const DEFAULT_YEARS_RANGE = 10
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

const pad = (n) => String(n).padStart(2, "0")
const MONTHS = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(2026, m, 1)))

// ---------- value helpers ----------

export function parseDateValue(value) {
  if (!value) return undefined
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  const m = String(value)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return undefined
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0))
  return Number.isNaN(date.getTime()) ? undefined : date
}

export const toDateString = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "")
export const toDateTimeString = (d) => (d ? `${toDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}` : "")

export function parseTimeValue(value) {
  const m = typeof value === "string" && value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hours24 = Number(m[1])
  const minutes = Number(m[2])
  return hours24 > 23 || minutes > 59 ? null : { hours24, minutes }
}

export const toTimeValue = (hours24, minutes) => `${pad(hours24)}:${pad(minutes)}`

const to12Hour = (h) => ({ hour12: h % 12 === 0 ? 12 : h % 12, period: h >= 12 ? "PM" : "AM" })
const to24Hour = (h12, period) => (period === "AM" ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12)

export function formatDisplayTime(hours24, minutes, timeFormat = "12h") {
  if (timeFormat === "24h") return toTimeValue(hours24, minutes)
  const { hour12, period } = to12Hour(hours24)
  return `${pad(hour12)}:${pad(minutes)} ${period}`
}

const displayDate = (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d)
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// ---------- calendar ----------

function Calendar({ month, onMonthChange, selected, onSelect, minDate, maxDate, yearsRange }) {
  const today = new Date()
  const year = month.getFullYear()
  const years = useMemo(() => {
    const base = today.getFullYear()
    const list = []
    for (let y = base - yearsRange; y <= base + yearsRange; y++) list.push(y)
    if (!list.includes(year)) list.push(year)
    return list.sort((a, b) => a - b)
  }, [yearsRange, year]) // eslint-disable-line react-hooks/exhaustive-deps

  // 6 weeks starting on the Sunday on/before the 1st, so the grid height never jumps
  const first = new Date(year, month.getMonth(), 1)
  const days = Array.from({ length: 42 }, (_, i) => new Date(year, month.getMonth(), 1 - first.getDay() + i))
  const min = minDate ? startOfDay(minDate) : null
  const max = maxDate ? startOfDay(maxDate) : null
  const go = (delta) => onMonthChange(new Date(year, month.getMonth() + delta, 1))

  return (
    <div className="w-[17.5rem] p-3">
      <div className="mb-2 flex items-center gap-1">
        <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <Icon name="arrow-left-s-line" className="text-base" />
        </button>
        <Select
          size="sm"
          aria-label="Month"
          className="flex-1"
          triggerClassName="border-0 shadow-none font-medium justify-center gap-1"
          value={String(month.getMonth())}
          onChange={(m) => onMonthChange(new Date(year, Number(m), 1))}
          options={MONTHS.map((name, i) => ({ value: String(i), label: name }))}
        />
        <Select
          size="sm"
          aria-label="Year"
          className="w-24"
          triggerClassName="border-0 shadow-none font-medium justify-center gap-1"
          value={String(year)}
          onChange={(y) => onMonthChange(new Date(Number(y), month.getMonth(), 1))}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
        <button type="button" aria-label="Next month" onClick={() => go(1)} className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <Icon name="arrow-right-s-line" className="text-base" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div role="grid" className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const outside = day.getMonth() !== month.getMonth()
          const isSelected = sameDay(day, selected)
          const isToday = sameDay(day, today)
          const disabled = (min && day < min) || (max && day > max)
          return (
            <button
              key={day.toISOString()}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={displayDate(day)}
              disabled={disabled}
              onClick={() => onSelect(day)}
              className={cn(
                "mx-auto flex size-9 cursor-pointer items-center justify-center rounded-md text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                outside ? "text-muted-foreground/50" : "text-foreground",
                !isSelected && "hover:bg-muted",
                isToday && !isSelected && "bg-muted font-semibold",
                isSelected && "bg-primary font-semibold text-primary-foreground",
                disabled && "pointer-events-none opacity-30",
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------- time wheel ----------

// Scroll column whose selected value stays centered under the shared highlight band
function WheelColumn({ label, options, value, onSelect, disabled, format = (o) => (typeof o === "number" ? pad(o) : o) }) {
  const scrollerRef = useRef(null)
  const frameRef = useRef(0)
  const settleRef = useRef(0)
  const draggingRef = useRef(false)
  const [spacer, setSpacer] = useState(0)
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => String(o) === String(value)),
  )

  const scrollToIndex = useCallback((index, behavior = "auto") => {
    scrollerRef.current?.scrollTo({ top: index * WHEEL_ITEM_HEIGHT, behavior })
  }, [])

  // Top/bottom spacers let the first and last items reach the center
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return undefined
    const sync = () => setSpacer(Math.max(0, Math.round((el.clientHeight - WHEEL_ITEM_HEIGHT) / 2)))
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (spacer > 0 && !draggingRef.current) scrollToIndex(selectedIndex)
  }, [selectedIndex, spacer, scrollToIndex])

  const indexFromScroll = () => Math.max(0, Math.min(options.length - 1, Math.round((scrollerRef.current?.scrollTop ?? 0) / WHEEL_ITEM_HEIGHT)))

  const handleScroll = () => {
    draggingRef.current = true
    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = window.requestAnimationFrame(() => {
      const next = options[indexFromScroll()]
      if (next !== undefined && String(next) !== String(value)) onSelect(next)
    })
    window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      draggingRef.current = false
      scrollToIndex(indexFromScroll(), "smooth")
    }, 110)
  }

  return (
    <div ref={scrollerRef} role="listbox" aria-label={label} onScroll={handleScroll} className="relative z-0 h-full min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div style={{ height: spacer }} aria-hidden />
      {options.map((option, index) => {
        const selected = String(option) === String(value)
        return (
          <button
            key={String(option)}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => {
              onSelect(option)
              draggingRef.current = false
              scrollToIndex(index, "smooth")
            }}
            style={{ height: WHEEL_ITEM_HEIGHT }}
            className={cn(
              "flex w-full cursor-pointer items-center justify-center text-sm tabular-nums transition-colors",
              selected ? "text-base font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {format(option)}
          </button>
        )
      })}
      <div style={{ height: spacer }} aria-hidden />
    </div>
  )
}

// Hours / Minutes / AM-PM wheels. value "HH:mm"; fills its parent's height.
function TimeWheel({ value, onChange, timeFormat = "12h", minuteStep = 5, disabled }) {
  const parsed = parseTimeValue(value) ?? { hours24: 9, minutes: 0 }
  const { hours24, minutes } = parsed
  const { hour12, period } = to12Hour(hours24)
  const step = Math.max(1, Math.min(30, Number(minuteStep) || 5))
  const minuteOptions = useMemo(() => {
    const list = []
    for (let m = 0; m < 60; m += step) list.push(m)
    if (!list.includes(minutes)) list.push(minutes)
    return list.sort((a, b) => a - b)
  }, [step, minutes])
  const hourOptions = timeFormat === "24h" ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i + 1)
  const emit = (h, m) => onChange?.(toTimeValue(h, m))

  return (
    <div className="flex h-full min-h-0 flex-col px-2 pt-3 pb-2">
      <div className="flex shrink-0 pb-1 text-center text-xs font-medium text-muted-foreground">
        <div className="flex-1">Hours</div>
        <div className="flex-1">Minutes</div>
        {timeFormat === "12h" && <div className="w-12" aria-hidden />}
      </div>
      <div className="relative min-h-0 flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-9 -translate-y-1/2 rounded-md bg-primary/15 ring-1 ring-primary/30" />
        <div className="absolute inset-0 flex">
          <WheelColumn
            label="Hours"
            options={hourOptions}
            value={timeFormat === "24h" ? hours24 : hour12}
            disabled={disabled}
            onSelect={(h) => emit(timeFormat === "24h" ? Number(h) : to24Hour(Number(h), period), minutes)}
          />
          <WheelColumn label="Minutes" options={minuteOptions} value={minutes} disabled={disabled} onSelect={(m) => emit(hours24, Number(m))} />
          {timeFormat === "12h" && (
            <div className="w-12 shrink-0">
              <WheelColumn label="AM or PM" options={["AM", "PM"]} value={period} disabled={disabled} onSelect={(p) => emit(to24Hour(hour12, p), minutes)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- shared trigger ----------

function FieldShell({ id, label, required, error, className, children }) {
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <Label htmlFor={id} className="mb-0.5 flex flex-row items-center text-base text-muted-foreground">
          {label}
          {required && <span className="text-sm text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error && <div className="text-[13px] text-destructive">{error}</div>}
    </div>
  )
}

const triggerClasses = (size) =>
  cn(
    "inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none dark:bg-input/20",
    "hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "disabled:cursor-not-allowed disabled:opacity-50 data-popup-open:border-ring",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    size === "sm" ? "h-control-sm" : size === "lg" ? "h-control-lg" : "h-control",
  )

function ClearButton({ label, onClear }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={label}
      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClear()
      }}
    >
      <Icon name="close-line" className="text-sm" />
    </span>
  )
}

// ---------- DatePicker / DateTimePicker ----------

function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Select date…",
  error,
  required = false,
  disabled = false,
  clearable = true,
  showTime = false,
  timeFormat = "12h",
  minuteStep = 5,
  minDate,
  maxDate,
  yearsRange = DEFAULT_YEARS_RANGE,
  size = "default",
  side = "bottom",
  align = "start",
  className,
  triggerClassName,
  id,
  "aria-label": ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const selected = parseDateValue(value)
  const [month, setMonth] = useState(() => selected ?? new Date())
  const [draftTime, setDraftTime] = useState(() => (selected ? toTimeValue(selected.getHours(), selected.getMinutes()) : "09:00"))

  const min = parseDateValue(minDate)
  const max = parseDateValue(maxDate)
  const time = parseTimeValue(draftTime)
  const headerDate = selected ?? new Date()

  const emit = (date) => onChange?.(date ? (showTime ? toDateTimeString(date) : toDateString(date)) : "")
  const withTime = (date, t) => {
    const p = parseTimeValue(t) ?? { hours24: 9, minutes: 0 }
    const next = new Date(date)
    next.setHours(p.hours24, p.minutes, 0, 0)
    return next
  }

  const handleOpenChange = (next) => {
    // Re-sync the visible month and time with the current value each time it opens
    if (next) {
      setMonth(selected ?? new Date())
      if (selected) setDraftTime(toTimeValue(selected.getHours(), selected.getMinutes()))
    }
    setOpen(next)
  }

  const handleSelect = (day) => {
    if (showTime) return emit(withTime(day, draftTime))
    emit(day)
    setOpen(false)
  }

  const handleTime = (t) => {
    setDraftTime(t)
    if (selected) emit(withTime(selected, t))
  }

  const text = selected ? (showTime ? `${displayDate(selected)}, ${formatDisplayTime(selected.getHours(), selected.getMinutes(), timeFormat)}` : displayDate(selected)) : placeholder

  return (
    <FieldShell id={id} label={label} required={required} error={error} className={className}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger id={id} type="button" disabled={disabled} aria-label={ariaLabel ?? label} aria-invalid={Boolean(error) || undefined} className={cn(triggerClasses(size), triggerClassName)}>
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Icon name={showTime ? "calendar-schedule-line" : "calendar-line"} className="shrink-0 text-base text-muted-foreground" />
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{text}</span>
          </span>
          {clearable && selected && !disabled && <ClearButton label="Clear date" onClear={() => onChange?.("")} />}
        </PopoverTrigger>

        <PopoverContent align={align} side={side} sideOffset={4} className="w-auto gap-0 overflow-hidden rounded-xl p-0 shadow-lg">
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{headerDate.getFullYear()}</div>
              <div className="truncate text-base font-semibold tracking-tight">{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long" }).format(headerDate)}</div>
              {showTime && time && <div className="mt-0.5 text-sm text-muted-foreground">{formatDisplayTime(time.hours24, time.minutes, timeFormat)}</div>}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Icon name="close-line" className="text-base" />
            </button>
          </div>

          <div className={cn(showTime && "flex flex-col sm:flex-row")}>
            <Calendar month={month} onMonthChange={setMonth} selected={selected} onSelect={handleSelect} minDate={min} maxDate={max} yearsRange={yearsRange} />
            {showTime && (
              // Stretches to the calendar's height on wide screens; fixed height when stacked
              <div className="relative h-56 border-t sm:h-auto sm:w-48 sm:border-t-0 sm:border-l">
                <div className="absolute inset-0">
                  <TimeWheel value={draftTime} onChange={handleTime} timeFormat={timeFormat} minuteStep={minuteStep} disabled={disabled} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                emit(showTime ? now : startOfDay(now))
                setMonth(now)
                setDraftTime(toTimeValue(now.getHours(), now.getMinutes()))
                if (!showTime) setOpen(false)
              }}
              className="cursor-pointer rounded px-1.5 py-1 text-sm font-medium text-primary hover:bg-primary/10"
            >
              {showTime ? "Now" : "Today"}
            </button>
            {showTime && (
              <button type="button" onClick={() => setOpen(false)} className="cursor-pointer rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Done
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </FieldShell>
  )
}

// Same API as DatePicker, with time selection; value "yyyy-MM-ddTHH:mm"
function DateTimePicker(props) {
  return <DatePicker {...props} showTime />
}

// ---------- TimePicker ----------

function TimePicker({
  value,
  onChange,
  label,
  placeholder = "Select time…",
  error,
  required = false,
  disabled = false,
  clearable = true,
  timeFormat = "12h",
  minuteStep = 5,
  size = "default",
  side = "bottom",
  align = "start",
  className,
  triggerClassName,
  id,
  "aria-label": ariaLabel,
}) {
  const parsed = parseTimeValue(value)
  return (
    <FieldShell id={id} label={label} required={required} error={error} className={className}>
      <Popover>
        <PopoverTrigger id={id} type="button" disabled={disabled} aria-label={ariaLabel ?? label} aria-invalid={Boolean(error) || undefined} className={cn(triggerClasses(size), triggerClassName)}>
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Icon name="time-line" className="shrink-0 text-base text-muted-foreground" />
            <span className={cn("truncate", !parsed && "text-muted-foreground")}>{parsed ? formatDisplayTime(parsed.hours24, parsed.minutes, timeFormat) : placeholder}</span>
          </span>
          {clearable && parsed && !disabled && <ClearButton label="Clear time" onClear={() => onChange?.("")} />}
        </PopoverTrigger>
        <PopoverContent align={align} side={side} sideOffset={4} className="h-64 w-52 gap-0 overflow-hidden rounded-xl p-0 shadow-lg">
          <TimeWheel value={value || "09:00"} onChange={onChange} timeFormat={timeFormat} minuteStep={minuteStep} disabled={disabled} />
        </PopoverContent>
      </Popover>
    </FieldShell>
  )
}

// ---------- DateRangePicker ----------

// Preset ranges plus From / To pickers for a custom range.
// value / onChange: { preset, from: "yyyy-MM-dd", to: "yyyy-MM-dd" }
function DateRangePicker({ value, onChange, presets = RANGE_PRESETS, size = "default", className }) {
  const custom = value.preset === "custom"
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select
        size={size}
        aria-label="Date range"
        className="w-44"
        value={value.preset}
        onChange={(preset) => onChange(preset === "custom" ? { ...value, preset } : resolvePreset(preset))}
        options={presets.map((p) => ({ ...p, icon: p.value === "custom" ? "calendar-2-line" : "calendar-line" }))}
      />
      {custom && (
        <>
          <DatePicker size={size} aria-label="From" className="w-40" clearable={false} maxDate={value.to} value={value.from} onChange={(from) => from && onChange({ ...value, from })} />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker size={size} aria-label="To" className="w-40" clearable={false} minDate={value.from} value={value.to} onChange={(to) => to && onChange({ ...value, to })} />
        </>
      )}
    </div>
  )
}

export { DatePicker, DateTimePicker, TimePicker, DateRangePicker }
