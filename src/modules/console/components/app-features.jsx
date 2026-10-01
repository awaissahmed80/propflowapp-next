"use client"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { featuresOf } from "@/modules/portal/features"

// The features inside an app as small toggles (core one locked on). off: keys switched off;
// onChange(next off keys). Shown under an app that's switched on, in Plans and Workspaces.
export function AppFeatures({ app, off = [], onChange, disabled = false, className }) {
  const features = featuresOf(app)
  if (features.length < 2) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Features">
      {features.map((f) => {
        const on = f.core || !off.includes(f.key)
        return (
          <li key={f.key}>
            <button
              type="button"
              aria-pressed={on}
              disabled={f.core || disabled}
              title={f.core ? "Always included" : on ? "Included, click to leave out" : "Left out, click to include"}
              onClick={() => onChange(on ? [...off, f.key] : off.filter((k) => k !== f.key))}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors enabled:cursor-pointer",
                on ? "border-primary/40 bg-primary/10 text-primary" : "border-dashed text-muted-foreground line-through enabled:hover:text-foreground",
                f.core && "opacity-80",
              )}
            >
              <Icon name={f.core ? "lock-line" : on ? "check-line" : "close-line"} className="text-[11px]" />
              {f.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
