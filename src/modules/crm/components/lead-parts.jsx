"use client"

import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { useList } from "@/modules/lookups/context"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"

// Small pieces shared by the leads list, board and lead window

export function LeadStatusBadge({ status, className }) {
  const s = useList("lead-status").map[status]
  return (
    <Badge color={toHex(s?.color) ?? "gray"} dot className={className}>
      {s?.label ?? status}
    </Badge>
  )
}

// A lead's temperature as its coloured icon (snowflake … fire), name on hover
export function TempIcon({ priority, className }) {
  const p = useList("lead-priority").map[priority]
  return (
    <Tooltip content={p?.label ?? priority}>
      <Icon name={p?.icon ?? "temp-cold-line"} className={cn("shrink-0 text-base", className)} style={{ color: toHex(p?.color) ?? "#94a3b8" }} aria-label={p?.label ?? priority} />
    </Tooltip>
  )
}

// Very cold → very hot as five icon buttons; the picked one in its colour with its name beside
export function TempPicker({ value, onChange, disabled, label }) {
  const list = useList("lead-priority")
  const picked = list.map[value]
  return (
    <div className="space-y-1">
      {label && <p className="text-base text-muted-foreground">{label}</p>}
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label={label ?? "Temperature"} className="inline-flex rounded-md border p-0.5">
          {list.options.map((o) => {
            const on = o.value === value
            const color = toHex(list.map[o.value]?.color) ?? "#94a3b8"
            return (
              <Tooltip key={o.value} content={o.label}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={o.label}
                  disabled={disabled}
                  onClick={() => !on && onChange(o.value)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded text-lg transition enabled:cursor-pointer disabled:opacity-60",
                    on ? "text-white" : "opacity-55 enabled:hover:bg-muted enabled:hover:opacity-100",
                  )}
                  style={on ? { backgroundColor: color } : { color }}
                >
                  <Icon name={list.map[o.value]?.icon ?? "temp-cold-line"} />
                </button>
              </Tooltip>
            )
          })}
        </div>
        {picked && (
          <span className="text-sm font-medium" style={{ color: toHex(picked.color) ?? undefined }}>
            {picked.label}
          </span>
        )}
      </div>
    </div>
  )
}

export function AgentChip({ agent, className }) {
  if (!agent) return <span className={cn("text-sm text-muted-foreground", className)}>Unassigned</span>
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar name={agent.name} source={agent.avatarUrl} size="sm" />
      <span className="truncate text-sm">{agent.name}</span>
    </span>
  )
}

// "Overdue 2d", "Today 3:00 PM", "Tomorrow", "Fri 4 Oct"; tone: red overdue, amber today
export function dueText(at, now = Date.now()) {
  if (!at) return { text: "—", tone: "text-muted-foreground" }
  const d = new Date(at)
  const pk = (x) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(x)
  const today = pk(new Date(now))
  const tomorrow = pk(new Date(now + 86_400_000))
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true }).format(d)
  if (d.getTime() < now) {
    const days = Math.floor((now - d.getTime()) / 86_400_000)
    return { text: days >= 1 ? `Overdue ${days}d` : `Overdue · ${time}`, tone: "text-red-600 dark:text-red-400", overdue: true }
  }
  if (pk(d) === today) return { text: `Today ${time}`, tone: "text-amber-600 dark:text-amber-400", today: true }
  if (pk(d) === tomorrow) return { text: `Tomorrow ${time}`, tone: "text-foreground" }
  return { text: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short" }).format(d), tone: "text-muted-foreground" }
}

// tel: and WhatsApp links (with a friendly opening line)
export const telHref = (phone) => `tel:${phone}`
export const whatsappHref = (phone, name, company) =>
  `https://wa.me/${String(phone).replace(/\D/g, "")}?text=${encodeURIComponent(`Assalam o Alaikum ${String(name).split(" ")[0]}, this is regarding your property enquiry${company ? ` with ${company}` : ""}.`)}`

// The lead's status as a badge that opens a menu of every status (the lead header). Picking
// "Lost" is passed on so the caller can ask why. Without edit rights it's just the badge.
export function StatusMenu({ status, onPick, disabled = false, badgeClassName }) {
  const list = useList("lead-status")
  if (disabled) return <LeadStatusBadge status={status} className={badgeClassName} />
  return (
    <DropdownMenu
      align="start"
      items={list.options.map((o) => ({
        label: o.value === "lost" ? `${o.label}…` : o.label,
        icon: <span className="size-2 rounded-full" style={{ backgroundColor: toHex(list.map[o.value]?.color) ?? "#94a3b8" }} />,
        selected: o.value === status,
        onClick: () => o.value !== status && onPick(o.value),
      }))}
      trigger={
        <button type="button" aria-label="Change status" className="group inline-flex cursor-pointer items-center gap-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <LeadStatusBadge status={status} className={badgeClassName} />
          <Icon name="arrow-down-s-line" className="text-base text-muted-foreground transition-colors group-hover:text-foreground" />
        </button>
      }
    />
  )
}

// The lead's temperature icon as a menu: very cold → very hot (the lead header)
export function TempMenu({ value, onChange, disabled = false, className }) {
  const list = useList("lead-priority")
  if (disabled) return <TempIcon priority={value} className={className} />
  const p = list.map[value]
  return (
    <DropdownMenu
      align="start"
      items={list.options.map((o) => ({
        label: o.label,
        icon: <Icon name={list.map[o.value]?.icon ?? "temp-cold-line"} style={{ color: toHex(list.map[o.value]?.color) ?? "#94a3b8" }} />,
        selected: o.value === value,
        onClick: () => o.value !== value && onChange(o.value),
      }))}
      trigger={
        <button
          type="button"
          aria-label={`Temperature: ${p?.label ?? value}. Change`}
          title={p?.label ?? value}
          className="inline-flex cursor-pointer items-center rounded-md p-0.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name={p?.icon ?? "temp-cold-line"} className={cn("shrink-0 text-base", className)} style={{ color: toHex(p?.color) ?? "#94a3b8" }} />
        </button>
      }
    />
  )
}
