"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { useList } from "@/modules/lookups/context"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"
import { dueLabel } from "../constants"

// Small shared pieces for Estate Management screens. Types, statuses, priorities and complaint
// categories read their labels, colors and icons from the workspace's Lists & Labels.

// Request type with its list icon and color, e.g. key + "Possession"
export function TypeBadge({ type, className }) {
  const t = useList("service-request-type").map[type]
  return (
    <Badge color={toHex(t?.color) ?? "gray"} className={className}>
      {t?.icon && <Icon name={t.icon} />}
      {t?.label ?? type}
    </Badge>
  )
}

// Where a request is: New, In progress, Waiting on customer, Done, Rejected
export function StatusBadge({ status, className }) {
  const s = useList("service-status").map[status]
  return (
    <Badge color={toHex(s?.color) ?? "gray"} dot className={className}>
      {s?.label ?? status}
    </Badge>
  )
}

// A complaint's priority
export function PriorityBadge({ priority, className }) {
  const p = useList("service-priority").map[priority]
  if (!priority) return null
  return (
    <Badge color={toHex(p?.color) ?? "gray"} className={className}>
      {p?.label ?? priority}
    </Badge>
  )
}

// A complaint's category with its list icon
export function CategoryLabel({ category, className }) {
  const c = useList("complaint-category").map[category]
  if (!category) return null
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Icon name={c?.icon ?? "question-line"} className="shrink-0 text-muted-foreground" />
      <span className="truncate">{c?.label ?? category}</span>
    </span>
  )
}

// Time left before it's due ("Due in 2 days"), red once late; nothing once closed
//   request: { dueAt, closed?, closedAt?, overdue? }
export function DueLabel({ request, className }) {
  const [now] = useState(() => Date.now())
  const closed = request.closed ?? Boolean(request.closedAt)
  const text = dueLabel(request.dueAt, closed, now)
  if (!text) return null
  const late = request.overdue ?? new Date(request.dueAt).getTime() < now
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground", className)}>
      <Icon name={late ? "alarm-warning-line" : "time-line"} />
      {text}
    </span>
  )
}

// Who has it: avatar (and name unless compact), or "Unassigned"
//   person: { id, name, avatarUrl } | null
export function Assignee({ person, compact = false, className }) {
  if (!person)
    return compact ? (
      <Tooltip content="Unassigned">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground", className)}>
          <Icon name="user-line" className="text-xs" />
        </span>
      </Tooltip>
    ) : (
      <span className={cn("text-xs text-muted-foreground", className)}>Unassigned</span>
    )
  if (compact)
    return (
      <Tooltip content={person.name}>
        <span className={cn("shrink-0", className)}>
          <Avatar name={person.name} source={person.avatarUrl} size="sm" />
        </span>
      </Tooltip>
    )
  return (
    <span className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
      <Avatar name={person.name} source={person.avatarUrl} size="sm" />
      <span className="truncate">{person.name}</span>
    </span>
  )
}

// Checklist progress as small pills and "3/5"
//   steps: [{ key, done }]
export function StepsProgress({ steps, className }) {
  if (!steps?.length) return null
  const done = steps.filter((s) => s.done).length
  return (
    <span className={cn("flex items-center gap-2 text-xs text-muted-foreground tabular-nums", className)} title={`${done} of ${steps.length} steps done`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {steps.map((s) => (
          <span key={s.key} className={cn("h-1.5 w-3 rounded-full", s.done ? "bg-emerald-500" : "bg-muted-foreground/25")} />
        ))}
      </span>
      {done}/{steps.length}
    </span>
  )
}

// "DHA Phase 2 · 125" from a request's unit
export const unitLine = (unit) => (unit ? [unit.project?.name, unit.block, unit.number].filter(Boolean).join(" · ") : "")
