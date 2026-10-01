"use client"

import { useList } from "@/modules/lookups/context"
import { Select } from "@/components/ui/select"

// Pick an area unit from Lists & Labels › Area units, limited to the ones that make sense here
// (units: e.g. unitsFor(type) from estate/constants). Shows each unit's short form.
export function AreaUnitSelect({ units, value, onChange, label, size, triggerClassName = "w-28", className, "aria-label": ariaLabel }) {
  const list = useList("area-unit")
  const options = units.map((u) => ({ value: u, label: list.map[u]?.meta?.short || list.label(u) }))
  return <Select label={label} aria-label={ariaLabel ?? (label ? undefined : "Unit")} size={size} className={className} triggerClassName={triggerClassName} value={units.includes(value) ? value : units[0]} onChange={onChange} options={options} />
}
