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
          onClick={() => track("app_store_click", { store: s.store, cta_location: location })}
          className={cn(
            // Styled like the official store badges: black, a thin grey outline, small corners
            "inline-flex items-center gap-2.5 border border-[#a6a6a6] bg-black text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#1a1a1a] hover:shadow-[0_10px_24px_-12px_rgb(0_0_0/0.6)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            size === "sm" ? "min-w-[10.5rem] gap-3 rounded-md px-5 py-2.5" : "min-w-[14rem] gap-3.5 rounded-lg px-8 py-4",
          )}
        >
          <Icon name={s.icon} className={size === "sm" ? "text-xl" : "text-[1.7rem]"} aria-hidden />
          <span className="text-left leading-none">
            <span className={cn("block font-medium text-white/85", size === "sm" ? "text-[0.6875rem]" : "text-[0.8125rem]")}>{s.small}</span>{" "}
            <span className={cn("mt-1 block font-semibold tracking-tight", size === "sm" ? "text-[0.9375rem]" : "text-[1.3rem]")}>{s.name}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
