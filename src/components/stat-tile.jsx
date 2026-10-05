import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// Change against an earlier value, e.g. "↑ 12%" or "↓ 3 pts", colored by whether that's good:
//   kind    pct (relative change) | points (difference between two percentages)
//   good    up | down | neutral (which way is good; neutral stays grey)
//   format  shows the earlier value in the tooltip
// Nothing without an earlier value. Never color alone: always an arrow and words.
export function Delta({ value, previous, kind = "pct", good = "up", format = String, label = "previous period", className }) {
  if (previous == null || value == null) return null
  const diff = kind === "points" ? Math.round((value - previous) * 10) / 10 : previous === 0 ? null : Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10
  const was = `${format(previous)} in the ${label}`
  if (diff === null)
    return (
      <span title={was} className={cn("inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground", className)}>
        <Icon name={value ? "arrow-up-line" : "subtract-line"} aria-hidden />
        {value ? "New" : "No change"}
        <span className="sr-only">, {was}</span>
      </span>
    )
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat"
  const tone = dir === "flat" || good === "neutral" ? "text-muted-foreground" : dir === good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
  const amount = Math.abs(diff) >= 100 ? Math.round(Math.abs(diff)) : Math.abs(diff)
  const text = dir === "flat" ? "No change" : kind === "points" ? `${amount} ${amount === 1 ? "pt" : "pts"}` : `${amount}%`
  return (
    <span title={was} className={cn("inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap tabular-nums", tone, className)}>
      <Icon name={dir === "up" ? "arrow-up-line" : dir === "down" ? "arrow-down-line" : "subtract-line"} aria-hidden />
      <span className="sr-only">{dir === "up" ? "Up " : dir === "down" ? "Down " : ""}</span>
      {text}
      <span className="sr-only">, {was}</span>
    </span>
  )
}

// KPI tile used on dashboards and reports. delta: a <Delta> shown before the hint
export function StatTile({ icon, label, value, hint, delta, tone = "primary", className }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  }
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border bg-background p-4 shadow-xs", className)}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-lg max-sm:hidden", tones[tone])}>
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-xl leading-tight font-semibold whitespace-nowrap tabular-nums">{value}</div>
        {delta ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {delta}
            {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
          </div>
        ) : (
          hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>
        )}
      </div>
    </div>
  )
}
