"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { CATEGORY_ORDER } from "../access"
import { AppCard } from "./app-card"
import { DeskPanel } from "./desk-panel"
import { GettingStarted } from "./getting-started"
import { LAUNCHER_TOUR, Tour } from "./tour"

// Greeting, then My Desk across the full width; below, apps take 3/4 of the width on large
// screens and the "Critical" column the rest
const CARD_GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"

// Pins are a per-browser convenience, so localStorage is enough (guarded for private mode).
// Read through an external store so the server render (no pins) and the browser agree.
const pinListeners = new Set()
function readPins(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key))
    return Array.isArray(saved) ? JSON.stringify(saved) : null
  } catch {
    return null
  }
}
function usePinnedApps(key) {
  const raw = useSyncExternalStore(
    (cb) => {
      pinListeners.add(cb)
      return () => pinListeners.delete(cb)
    },
    () => readPins(key),
    () => null,
  )
  const pinned = useMemo(() => (raw ? JSON.parse(raw) : null), [raw])
  const toggle = useCallback(
    (code, defaults) => {
      const base = pinned ?? defaults
      const next = base.includes(code) ? base.filter((c) => c !== code) : [...base, code]
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // storage unavailable: pins last until the page reloads
      }
      pinListeners.forEach((cb) => cb())
    },
    [key, pinned],
  )
  return [pinned, toggle]
}

// Plan, or the trial countdown (links to billing once it exists)
function PlanChip({ tenant }) {
  if (!tenant.plan) return null
  const trial = tenant.trialDaysLeft != null
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", trial ? "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-background text-foreground")}>
      {trial ? `${tenant.plan} trial · ${tenant.trialDaysLeft} day${tenant.trialDaysLeft === 1 ? "" : "s"} left` : `${tenant.plan} plan`}
    </span>
  )
}

// The "Critical" column: urgent items from every app (tasks, approvals, overdue follow-ups).
// Empty until the apps that raise them are ported.
function CriticalPanel({ items = [] }) {
  return (
    <section aria-labelledby="critical-title" data-tour="critical">
      <header className="flex items-center gap-2 px-3 pb-1">
        <span className="size-2 rounded-full bg-red-500" aria-hidden />
        <h2 id="critical-title" className="text-sm font-semibold">
          Critical
        </h2>
        {items.length > 0 && <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>}
      </header>
      {items.length === 0 && (
        <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
          <Icon name="checkbox-circle-line" className="text-base text-emerald-600 dark:text-emerald-400" />
          Nothing critical right now
        </p>
      )}
    </section>
  )
}

export function Launcher({ user, role, tenant, apps: allApps, desk = null, greeting, today, setupSteps = null, team = null, startTour = false }) {
  // My Desk sits on its own at the top, not in the app grid
  const deskApp = allApps.find((a) => a.code === "desk")
  const apps = useMemo(() => allApps.filter((a) => a.code !== "desk"), [allApps])
  const router = useRouter()
  const searchRef = useRef(null)
  // The guided tour: right after setup (?tour=1) or from the account menu
  const [touring, setTouring] = useState(startTour)
  const [query, setQuery] = useState("")
  const [savedPins, togglePin] = usePinnedApps(`propflow-pinned:v3:${tenant.id}:${user.id}`)

  // "/" focuses the search box from anywhere on the page
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "/" || e.target.closest("input, textarea, [contenteditable]")) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Until they pin something, suggest their first three apps
  const defaultPins = useMemo(
    () =>
      apps
        .filter((a) => a.code !== "dashboards")
        .slice(0, 3)
        .map((a) => a.code),
    [apps],
  )
  const pinnedCodes = savedPins ?? defaultPins
  const pinnedApps = apps.filter((a) => pinnedCodes.includes(a.code))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? apps.filter((a) => [a.name, a.description, a.category].some((t) => t?.toLowerCase().includes(q))) : apps
  }, [apps, query])

  const groups = useMemo(() => {
    const known = CATEGORY_ORDER.map((category) => ({ category, apps: filtered.filter((a) => a.category === category) }))
    const other = filtered.filter((a) => !CATEGORY_ORDER.includes(a.category))
    return [...known, { category: "Other", apps: other }].filter((g) => g.apps.length > 0)
  }, [filtered])

  const onSearchKeyDown = (e) => {
    if (e.key === "Enter" && filtered.length > 0) router.push(`/${filtered[0].code}`)
    if (e.key === "Escape") setQuery("")
  }

  return (
    // Phones: greeting, critical, apps. Large screens: critical is a right column split off by a
    // single border, growing with the page
    <main className="grid lg:min-h-[calc(100svh-3.5rem)] lg:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)] lg:grid-rows-[auto_auto_1fr]">
      <div className="min-w-0 px-4 pt-6 sm:px-6 lg:col-span-2 lg:px-8 lg:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{today}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>
                {role.name} · {tenant.name}
              </span>
              {role.isOwner && <PlanChip tenant={tenant} />}
            </p>
          </div>
          <div className="w-full sm:w-80" data-tour="search">
            <Input
              ref={searchRef}
              type="search"
              placeholder="Search apps…"
              aria-label="Search apps"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              startElement={<Icon name="search-line" />}
              endElement={<kbd className="mr-2 hidden rounded border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground sm:inline-block">/</kbd>}
            />
          </div>
        </div>

        {!query && pinnedApps.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2" data-tour="pinned">
            <span className="mr-1 flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Icon name="star-fill" className="text-amber-500" /> Pinned
            </span>
            {pinnedApps.map((app) => (
              <Link
                key={app.code}
                href={`/${app.code}`}
                className="flex items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1 text-sm font-medium shadow-xs transition outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AppIcon icon={app.icon} color={app.color} size="sm" className="size-7 rounded-full text-base" />
                {app.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {desk && !query && (
        <div className="min-w-0 px-4 pt-6 sm:px-6 lg:col-span-2 lg:px-8">
          <DeskPanel desk={desk} app={deskApp} apps={allApps} />
        </div>
      )}

      <aside aria-label="Critical" className="mt-6 border-y px-4 py-4 sm:px-6 lg:col-start-2 lg:row-start-3 lg:mt-0 lg:border-y-0 lg:border-l lg:py-8">
        <div className="-mx-3">
          <CriticalPanel />
          <GettingStarted steps={setupSteps} team={team} onStartTour={() => setTouring(true)} />
        </div>
      </aside>

      <div className="min-w-0 px-4 pt-6 pb-8 sm:px-6 lg:col-start-1 lg:row-start-3 lg:px-8 lg:pt-8">
        <div className="space-y-8">
          {apps.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-background py-12 text-center">
              <Icon name="lock-2-line" className="text-3xl text-muted-foreground" />
              <p className="mt-2 font-medium">No apps assigned yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Your role doesn&apos;t have access to any app yet. Please ask your company administrator.</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-background py-12 text-center">
              <Icon name="search-eye-line" className="text-3xl text-muted-foreground" />
              <p className="mt-2 font-medium">No apps match “{query}”</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different name or keyword.</p>
            </div>
          ) : (
            groups.map((group, i) => (
              // The tour points at the first group: the whole grid is taller than the screen
              <section key={group.category} aria-labelledby={`cat-${group.category}`} data-tour={i === 0 ? "apps" : undefined}>
                <h2 id={`cat-${group.category}`} className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {group.category}
                </h2>
                <div className={CARD_GRID}>
                  {group.apps.map((app) => (
                    <AppCard key={app.code} app={app} pinned={pinnedCodes.includes(app.code)} onTogglePin={(code) => togglePin(code, defaultPins)} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
        {query && filtered.length > 0 && <p className="mt-6 text-center text-xs text-muted-foreground">Press Enter to open {filtered[0].name}.</p>}
      </div>
      {touring && (
        <Tour
          steps={LAUNCHER_TOUR}
          onClose={() => {
            setTouring(false)
            // Drop ?tour=1 so a reload doesn't start it again
            if (startTour) router.replace("/")
          }}
        />
      )}
    </main>
  )
}
