"use client"

import { Select } from "@/components/ui/select"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/components/ui/icon"
import { PERIODS, pkDay } from "../filters"

// Period, project and "compare with the period before", kept in the URL (filters.js).
//   data: loadDashboard() · onChange(values): the new filter values
export function DashboardFilters({ data, pending, onChange }) {
  const { filters, period, projects } = data
  const set = (patch) => onChange({ ...filters, ...patch })
  const today = pkDay()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Select
        aria-label="Period"
        className="w-48"
        value={filters.period}
        options={PERIODS.map((p) => ({ ...p, icon: p.value === "custom" ? "calendar-2-line" : "calendar-line" }))}
        onChange={(v) => set(v === "custom" ? { period: v, from: filters.from ?? `${today.slice(0, 7)}-01`, to: filters.to ?? today } : { period: v, from: null, to: null })}
      />
      {filters.period === "custom" && (
        <div className="flex items-center gap-2">
          <DatePicker aria-label="From" className="w-40" clearable={false} maxDate={filters.to ?? today} value={filters.from ?? ""} onChange={(from) => from && set({ from })} />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker aria-label="To" className="w-40" clearable={false} minDate={filters.from ?? undefined} value={filters.to ?? ""} onChange={(to) => to && set({ to })} />
        </div>
      )}
      {projects.length > 1 && (
        <Select
          aria-label="Project"
          className="w-52"
          value={filters.project ?? "all"}
          options={[{ value: "all", label: "Whole business", icon: "building-2-line" }, ...projects.map((p) => ({ ...p, icon: "community-line" }))]}
          onChange={(v) => set({ project: v === "all" ? null : v })}
        />
      )}
      <Switch checked={filters.compare} onChange={(compare) => set({ compare })} label="Compare" />
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:ml-auto">
        {pending && <Icon name="loader-3-fill" className="animate-spin" aria-hidden />}
        <span className="truncate">
          {period.label}
          {period.prev && ` · vs ${period.prev}`}
        </span>
      </p>
    </div>
  )
}
