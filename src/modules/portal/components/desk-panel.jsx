"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

const EVERY = 4500 // ms per item

// Shows `shown` items at a time (in the same two-line height) and moves on by one (sliding up). Pauses while hovered or focused,
// and doesn't move by itself when the system asks for reduced motion; the dots jump to an item.
function Rotator({ label, items, render, empty, shown = 2 }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = items.length
  const rotates = count > shown
  const i = count ? index % count : 0
  const visible = rotates ? Array.from({ length: shown }, (_, n) => items[(i + n) % count]) : items
  useEffect(() => {
    if (!rotates || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined
    const id = setInterval(() => setIndex((n) => n + 1), EVERY)
    return () => clearInterval(id)
  }, [rotates, paused])
  return (
    <div className="min-w-0 px-3 py-2" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</h3>
        {rotates && (
          <div className="flex shrink-0 items-center gap-1" role="tablist" aria-label={label}>
            {items.map((_, n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={`${label} ${n + 1} of ${count}`}
                onClick={() => setIndex(n)}
                className={cn("h-1.5 cursor-pointer rounded-full transition-all", n === i ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60")}
              />
            ))}
          </div>
        )}
      </div>
      <div className="relative mt-1 h-14 overflow-hidden" aria-live={paused ? "polite" : "off"}>
        {count ? (
          <div key={i} className="absolute inset-0 flex flex-col animate-in duration-500 fade-in slide-in-from-bottom-3 motion-reduce:animate-none">
            {visible.map((item, n) => (
              <div key={n} className={cn("flex items-center", shown === 1 ? "h-14" : "h-7")}>
                {render(item)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-7 items-center text-sm text-muted-foreground">{empty}</div>
        )}
      </div>
    </div>
  )
}

function Stat({ href, icon, value, label, tone }) {
  return (
    <Link href={href} title={label} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs transition-colors hover:border-primary/40">
      <Icon name={icon} className={cn("text-sm", value ? tone : "text-muted-foreground")} />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="sr-only">{label}</span>
    </Link>
  )
}

// My Desk on the launcher, kept short: a header line (who you are, counts, Open My Desk), then
// the latest to-dos (two at a time) and recent activity (one at a time), rotating. desk: deskSummary(); app: the My Desk app
export function DeskPanel({ desk, app, apps }) {
  const appOf = (code) => apps.find((a) => a.code === code)
  const { me, counts } = desk
  const line = (a, text, extra) => (
    <>
      {a ? <AppIcon icon={a.icon} color={a.color} size="sm" className="mr-2 size-5 shrink-0 rounded text-[11px]" /> : <Icon name="history-line" className="mr-2 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate text-sm first-letter:uppercase">{text}</span>
      {extra}
    </>
  )
  return (
    <section aria-labelledby="desk-title" data-tour="desk" className="rounded-xl border bg-background shadow-xs">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
        <Link href="/desk" className="group flex min-w-0 items-center gap-2.5">
          {app && <AppIcon icon={app.icon} color={app.color} className="size-10 rounded-xl text-xl" />}
          <span className="min-w-0">
            <span id="desk-title" className="block text-lg leading-tight font-semibold tracking-tight group-hover:text-primary">
              My Desk
            </span>
            <span className="block truncate text-xs text-muted-foreground">{[me.designation, me.role].filter(Boolean).join(" · ") || "Your day and requests"}</span>
          </span>
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Stat href="/desk" icon="checkbox-circle-line" value={counts.tasks} label={`${counts.tasks} to-dos`} tone="text-amber-500" />
          <Stat href="/desk/approvals" icon="shield-check-line" value={counts.approvals} label={`${counts.approvals} approvals waiting`} tone="text-blue-500" />
          <Stat href="/estate/inventory" icon="lock-line" value={counts.holds} label={`${counts.holds} units on hold`} tone="text-violet-500" />
          <Button size="sm" variant="outline" rightIcon="arrow-right-line" className="ml-1.5" nativeButton={false} render={<Link href="/desk" />}>
            Open My Desk
          </Button>
        </div>
      </header>

      <div className="grid md:grid-cols-2 md:divide-x max-md:divide-y">
        <Rotator
          label="To-do"
          items={desk.tasks}
          empty={
            <>
              <Icon name="checkbox-circle-line" className="mr-1.5 text-emerald-500" /> You&apos;re all caught up
            </>
          }
          render={(t) => (
            <Link href={t.href} className="flex min-w-0 flex-1 items-center rounded-md hover:text-primary" title={t.detail || undefined}>
              {line(appOf(t.app), t.title)}
            </Link>
          )}
        />
        <Rotator
          label="Recent"
          shown={1}
          items={desk.recent}
          empty="What you do across the apps shows here."
          render={(r) => {
            const a = appOf(r.app)
            const body = (
              <>
                {a ? <AppIcon icon={a.icon} color={a.color} size="sm" className="mr-2.5 size-8 shrink-0 rounded-lg text-sm" /> : <Icon name="history-line" className="mr-2.5 shrink-0 text-lg text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm first-letter:uppercase">{r.summary}</span>
                  <span className="block text-xs text-muted-foreground">{timeAgo(r.at)}</span>
                </span>
              </>
            )
            return r.href ? (
              <Link href={r.href} className="flex min-w-0 flex-1 items-center rounded-md hover:text-primary">
                {body}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 items-center">{body}</div>
            )
          }}
        />
      </div>
    </section>
  )
}
