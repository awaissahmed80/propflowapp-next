"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"

// Grouped multi-select filters behind one "Filters" button.
// groups: [{ key, label, icon?, options: [{ value, label, icon? }] }]
// value:  { [groupKey]: [selectedValues] }
// Groups with no options (e.g. Team before any team exists) are left out; with none left, no button.
export function FilterMenu({ groups: allGroups, value, onChange }) {
  const groups = allGroups.filter((g) => g.options.length > 0)
  const count = Object.values(value).reduce((n, list) => n + list.length, 0)

  const toggle = (key, option) => {
    const current = value[key] ?? []
    const next = current.includes(option) ? current.filter((v) => v !== option) : [...current, option]
    onChange({ ...value, [key]: next })
  }

  // One compact row per group; its options open as a checkbox submenu
  const items = groups.map((group) => {
    const selected = (value[group.key] ?? []).length
    return {
      key: group.key,
      label: group.label,
      icon: group.icon,
      shortcut: selected ? `${selected} selected` : undefined,
      contentClassName: "max-h-[min(22rem,var(--available-height))] min-w-48",
      items: group.options.map((o) => ({
        type: "checkbox",
        key: `${group.key}-${o.value}`,
        label: o.label,
        icon: o.icon,
        checked: (value[group.key] ?? []).includes(o.value),
        onCheckedChange: () => toggle(group.key, o.value),
      })),
    }
  })

  if (count > 0) {
    items.push(
      { type: "separator", key: "sep-clear" },
      {
        label: "Clear all filters",
        icon: "close-circle-line",
        onClick: () => onChange({ ...value, ...Object.fromEntries(groups.map((g) => [g.key, []])) }),
      },
    )
  }

  if (!groups.length) return null
  return (
    <DropdownMenu
      align="start"
      className="w-56"
      items={items}
      trigger={
        <Button variant="outline" leftIcon="filter-3-line" className="w-28 shrink-0 data-popup-open:bg-accent">
          Filters
          {count > 0 && <Badge className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 tabular-nums">{count}</Badge>}
        </Button>
      }
    />
  )
}

// Removable chips for the active filters, shown under the toolbar
export function ActiveFilters({ groups, value, onChange }) {
  const chips = groups.flatMap((g) =>
    (value[g.key] ?? []).map((v) => ({
      group: g,
      value: v,
      label: g.options.find((o) => o.value === v)?.label ?? v,
    })),
  )
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span key={`${chip.group.key}-${chip.value}`} className="flex items-center gap-1 rounded-full border bg-background py-0.5 pr-1 pl-2.5 text-xs">
          <span className="text-muted-foreground">{chip.group.label}:</span>
          <span className="font-medium">{chip.label}</span>
          <button
            type="button"
            aria-label={`Remove ${chip.group.label} ${chip.label}`}
            onClick={() => onChange({ ...value, [chip.group.key]: value[chip.group.key].filter((v) => v !== chip.value) })}
            className="flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="close-line" className="text-xs" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onChange(Object.fromEntries(groups.map((g) => [g.key, []])))}
        className="cursor-pointer rounded px-1.5 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear all
      </button>
    </div>
  )
}
