"use client"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { track } from "@/modules/web/track"

// Download badges for the mobile app: one per store that has a link (Console › Settings › Mobile
// app). Clicks go to Google Analytics as app_store_click with the store and where it was clicked.
const STORES = [
  { key: "appStore", icon: "apple-fill", small: "Download on the", name: "App Store", store: "app_store" },
  { key: "playStore", icon: "google-play-fill", small: "Get it on", name: "Google Play", store: "google_play" },
]

export function StoreBadges({ links, location, size = "md", className }) {
  const stores = STORES.filter((s) => links[s.key])
  if (!stores.length) return null
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {stores.map((s) => (
        <a
          key={s.key}
          href={links[s.key]}
          target="_blank"
          rel="noopener"
          aria-label={`${s.small} ${s.name}`}
          onClick={() => track("app_store_click", { store: s.store, cta_location: location })}
          className={cn(
            "inline-flex items-center gap-2.5 rounded-xl bg-slate-950 text-white ring-1 ring-white/15 transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
            size === "sm" ? "h-10 px-3" : "h-13 px-4",
          )}
        >
          <Icon name={s.icon} className={size === "sm" ? "text-xl" : "text-[1.7rem]"} aria-hidden />
          <span className="text-left leading-none">
            <span className={cn("block", size === "sm" ? "text-[0.6rem]" : "text-[0.7rem]")}>{s.small}</span>
            <span className={cn("mt-0.5 block font-semibold tracking-tight", size === "sm" ? "text-sm" : "text-lg")}>{s.name}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
