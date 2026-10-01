import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// KPI tile used on dashboards and reports
export function StatTile({ icon, label, value, hint, tone = "primary", className }) {
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
        {hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  )
}
