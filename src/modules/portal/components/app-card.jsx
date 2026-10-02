"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"

export function AppCard({ app, pending = 0, pinned, onTogglePin }) {
  return (
    <div className="group relative">
      <Link
        href={`/${app.code}`}
        className="flex h-full items-center gap-4 rounded-2xl border bg-background p-4 pr-10 shadow-xs transition outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <AppIcon icon={app.icon} color={app.color} size="lg" className="transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{app.name}</span>
            {pending > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[11px] leading-4 font-semibold text-primary-foreground" aria-label={`${pending} pending`}>
                {pending}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{app.description}</p>
        </div>
      </Link>

      <Tooltip content={pinned ? "Unpin" : "Pin to top"} side="top">
        <button
          type="button"
          onClick={() => onTogglePin(app.code)}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${app.name}` : `Pin ${app.name}`}
          className={cn(
            "absolute top-3 right-3 flex size-7 cursor-pointer items-center justify-center rounded-md text-base transition outline-none hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
            pinned ? "text-amber-500" : "text-muted-foreground opacity-0 group-hover:opacity-100 max-md:opacity-100",
          )}
        >
          <Icon name={pinned ? "star-fill" : "star-line"} />
        </button>
      </Tooltip>
    </div>
  )
}
