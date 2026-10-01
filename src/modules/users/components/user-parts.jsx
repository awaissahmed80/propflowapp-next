import { cn } from "@/lib/utils"
import { lookupMap } from "@/modules/lookups/options"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { teamColor } from "../constants"

// statuses: the workspace's member-status list (getLookups)
export function MemberStatusBadge({ status, statuses }) {
  const s = lookupMap(statuses)[status]
  return (
    <Badge color={s?.color ?? "gray"} dot>
      {s?.label ?? status}
    </Badge>
  )
}

export function RoleBadge({ role, isOwner }) {
  return (
    <Badge color={isOwner ? "violet" : "gray"}>
      {isOwner && <Icon name="vip-crown-line" />}
      {role}
    </Badge>
  )
}

export function TeamChip({ team, className }) {
  if (!team) return <span className={cn("text-muted-foreground", className)}>—</span>
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="size-2 rounded-full" style={{ backgroundColor: teamColor(team.color) }} />
      {team.name}
    </span>
  )
}

// Success or error line under a page header
export function Notice({ tone = "success", icon, children, action }) {
  const error = tone === "error"
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        error ? "border border-destructive/30 bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      )}
    >
      <Icon name={icon ?? (error ? "error-warning-line" : "checkbox-circle-line")} />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  )
}

// Seats line for the invite dialog and Users header
export function seatsText(seats) {
  if (!seats.limit) return `${seats.used} seats used${seats.plan ? ` · ${seats.plan} plan has unlimited seats` : ""}`
  return `${seats.used} of ${seats.limit} seats used${seats.plan ? ` on the ${seats.plan} plan` : ""}`
}

// Compact seats note for a page header: "1 person · 1/40 seats" with a small meter
export function SeatsLine({ count, seats }) {
  const pct = seats.limit ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0
  return (
    <span className="flex items-center gap-2" title={seatsText(seats)}>
      <Icon name="group-line" className="text-sm" />
      <span>
        {count} {count === 1 ? "person" : "people"} · {seats.limit ? `${seats.used}/${seats.limit} seats` : `${seats.used} seats, unlimited`}
      </span>
      {seats.limit && (
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Seats used">
          <span className={cn("block h-full rounded-full", pct >= 90 ? "bg-red-500" : "bg-primary")} style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  )
}
