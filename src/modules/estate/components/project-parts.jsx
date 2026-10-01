"use client"

import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { useList } from "@/modules/lookups/context"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"

// Named colours keep their themed badge; hex colours get a tint
export const badgeColor = (color) => (!color ? "gray" : color.startsWith("#") ? color : color)

const MARK_SIZES = { sm: "size-9 rounded-lg text-lg", default: "size-11 rounded-xl text-xl", lg: "size-14 rounded-2xl text-2xl" }

// Bar colour for a status, from its list colour (a name or hex); sold reads as violet, not grey
export const barColor = (color) => (color === "gray" ? "#a78bfa" : (toHex(color) ?? "#94a3b8"))

// Coloured square with the project type's icon
export function ProjectMark({ project, size = "default", className }) {
  const types = useList("project-type")
  return (
    <span className={cn("flex shrink-0 items-center justify-center text-white shadow-sm", MARK_SIZES[size], className)} style={{ backgroundColor: project.color }}>
      <Icon name={types.map[project.type]?.icon ?? "building-2-line"} />
    </span>
  )
}

export function ProjectStatusBadge({ status }) {
  const s = useList("project-status").map[status]
  return <Badge color={badgeColor(s?.color)}>{s?.label ?? status}</Badge>
}

export function ApprovalBadge({ approval, authority }) {
  const a = useList("approval-status").map[approval]
  return (
    <Badge color={badgeColor(a?.color)}>
      <Icon name={a?.icon ?? "shield-line"} />
      {/* "LDA approved"; other states read on their own ("NOC applied") */}
      {approval === "approved" && authority ? `${authority} approved` : (a?.label ?? approval)}
    </Badge>
  )
}

// Stacked bar: available / on hold / booked / sold / blocked
export function AvailabilityBar({ stats, className }) {
  const statuses = useList("unit-status").values
  if (!stats.total) return <div className={cn("h-2 rounded-full bg-muted", className)} />
  return (
    <div className={cn("flex h-2 gap-px overflow-hidden rounded-full bg-muted", className)}>
      {statuses
        .filter((s) => stats.counts[s.value] > 0)
        .map((s) => (
          <Tooltip key={s.value} side="top" content={`${s.label}: ${stats.counts[s.value]}`}>
            <span className="h-full" style={{ width: `${(stats.counts[s.value] / stats.total) * 100}%`, backgroundColor: barColor(s.color) }} />
          </Tooltip>
        ))}
    </div>
  )
}

export function AvailabilityLegend({ stats, className }) {
  const statuses = useList("unit-status").values
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {statuses
        .filter((s) => stats.counts[s.value] > 0 || s.value !== "blocked")
        .map((s) => (
          <li key={s.value} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: barColor(s.color) }} />
            {s.label}
            <span className="font-medium text-foreground tabular-nums">{stats.counts[s.value] ?? 0}</span>
          </li>
        ))}
    </ul>
  )
}
