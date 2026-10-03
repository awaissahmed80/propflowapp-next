"use client"

import Link from "next/link"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { groupApps } from "../access"
import { appPath } from "@/modules/portal/app-paths"

// Header dropdown to jump between apps: My Desk (the launcher) as a card on top, then every app
// the person can open in two columns
export function AppSwitcher({ apps, current }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  // In the launcher's order, section by section
  const ordered = groupApps(apps).flatMap((g) => g.apps)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Switch app"
            className="flex h-control cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            {current && <AppIcon icon={current.icon} color={current.color} size="sm" className="size-6 rounded-md text-sm" />}
            <span className="max-sm:hidden">{current?.name ?? "Apps"}</span>
            <Icon name="arrow-down-s-line" className="text-base text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-[28rem] max-w-[calc(100vw-2rem)] gap-3 p-3">
        <Link
          href="/"
          onClick={close}
          className="group flex items-center gap-2.5 rounded-lg border bg-gradient-to-br from-primary/[0.07] to-transparent px-2 py-1.5 outline-none transition-colors hover:border-primary/40 hover:from-primary/[0.12] focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AppIcon icon="user-smile-line" color="teal" size="sm" className="size-8 shrink-0 rounded-lg text-base" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">My Desk</span>
            <span className="block truncate text-xs text-muted-foreground">Your tasks, approvals and what needs you today</span>
          </span>
          <Icon name="arrow-right-line" className="text-base text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        <h2 className="px-1 pt-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Apps</h2>
        <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
          {ordered.map((app) => {
            const here = app.code === current?.code
            return (
              <li key={app.code} className="min-w-0">
                <Link
                  href={appPath(app.code)}
                  onClick={close}
                  aria-current={here ? "page" : undefined}
                  className={cn("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", here && "bg-accent font-medium")}
                >
                  <AppIcon icon={app.icon} color={app.color} size="sm" className="size-8 shrink-0 rounded-lg text-base" />
                  <span className="truncate">{app.name}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
