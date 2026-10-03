"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// The tab strip on an app's Customize pages (lists & labels, rules, settings), one link per page.
// It's 3.25rem tall: pages under it that fill the screen subtract var(--sub-nav).
//   tabs: [{ label, icon, to }]
export function CustomizeNav({ tabs }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Customize" className="flex h-13 shrink-0 items-center gap-3 overflow-x-auto border-b bg-background px-4 [scrollbar-width:none] sm:px-6 lg:px-8">
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
        <Icon name="equalizer-line" className="text-base text-muted-foreground" />
        Customize
      </span>
      <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
      <div className="inline-flex h-control shrink-0 items-center rounded-lg bg-muted p-[3px]">
        {tabs.map((t) => {
          const on = pathname === t.to || pathname.startsWith(`${t.to}/`)
          return (
            <Link
              key={t.to}
              href={t.to}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex h-full items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                on ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30" : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
              )}
            >
              <Icon name={t.icon} />
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
