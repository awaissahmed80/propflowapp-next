"use client"

import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { useList } from "@/modules/lookups/context"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"
import { GOAL_METRIC, channelIcon, formatGoal, pct } from "../constants"

// Small shared pieces for Campaigns screens. Statuses, objectives and channels (CRM lead sources)
// read their labels, colors and icons from the workspace's Lists & Labels.

// A campaign's status as it is today (displayStatus), in its list color
export function CampaignStatusBadge({ status, className }) {
  const s = useList("campaign-status").map[status]
  return (
    <Badge color={toHex(s?.color) ?? "gray"} dot className={className}>
      {s?.label ?? status}
    </Badge>
  )
}

// Objective with its list icon, e.g. rocket + "Project launch"
export function Objective({ value, className }) {
  const o = useList("campaign-objective").map[value]
  if (!value) return <span className={className}>No objective</span>
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <Icon name={o?.icon ?? "focus-3-line"} />
      <span className="truncate">{o?.label ?? value}</span>
    </span>
  )
}

// Row of channel icons, the name on hover
export function ChannelIcons({ channels, className }) {
  const sources = useList("lead-source")
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {channels.map((ch) => (
        <Tooltip key={ch} side="top" content={sources.label(ch)}>
          <span className="flex size-6 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
            <Icon name={sources.map[ch]?.icon ?? channelIcon(ch)} />
          </span>
        </Tooltip>
      ))}
    </span>
  )
}

// A channel's icon and name
export function ChannelName({ channel, className }) {
  const sources = useList("lead-source")
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon name={sources.map[channel]?.icon ?? channelIcon(channel)} />
      </span>
      <span className="truncate">{sources.label(channel)}</span>
    </span>
  )
}

// Thin progress bar; tone turns amber / red when over (spend) or green when a goal is met
export function Meter({ value, max, tone = "primary", className }) {
  const width = Math.min(100, pct(value, max))
  return (
    <span className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <span
        className={cn("block h-full rounded-full", tone === "primary" && "bg-primary", tone === "green" && "bg-emerald-500", tone === "amber" && "bg-amber-500", tone === "red" && "bg-red-500")}
        style={{ width: `${width}%` }}
      />
    </span>
  )
}

// One goal: label, actual of target, and a meter. Cost per lead is met when at or below target.
export function GoalRow({ goal, actual }) {
  const m = GOAL_METRIC[goal.metric]
  const met = m?.lowerIsBetter ? actual != null && actual <= goal.target : actual >= goal.target
  const progress = m?.lowerIsBetter ? (actual == null ? 0 : Math.min(goal.target, (goal.target * goal.target) / Math.max(actual, 1))) : actual
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5">
          <Icon name={m?.icon ?? "flag-line"} className="text-muted-foreground" />
          {m?.label ?? goal.metric}
        </span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatGoal(goal.metric, actual)}</span>
          <span className="text-muted-foreground">
            {m?.lowerIsBetter ? " · target ≤ " : " of "}
            {formatGoal(goal.metric, goal.target)}
          </span>
          {met && <Icon name="checkbox-circle-fill" className="ml-1 text-emerald-600" aria-label="Goal met" />}
        </span>
      </div>
      <Meter className="mt-1.5 h-2" value={progress} max={goal.target} tone={met ? "green" : m?.lowerIsBetter && actual != null ? "amber" : "primary"} />
    </div>
  )
}
