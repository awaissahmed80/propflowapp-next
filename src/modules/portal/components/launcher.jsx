"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { useMediaQuery } from "@/hooks/use-media-query"
import { AppIcon } from "@/components/app-icon"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, useDefaultLayout } from "@/components/ui/resizable"
import { groupApps } from "../access"
import { GettingStarted } from "./getting-started"
import { LAUNCHER_TOUR, Tour } from "./tour"
import { appPath } from "@/modules/portal/app-paths"
import { usePinnedApps } from "./use-pinned-apps"

// The launcher, in two columns: apps on the left, My Desk on the right. On large screens each
// scrolls on its own and the divider can be dragged to make the apps column wider or narrower
// (remembered in this browser). On smaller screens My Desk comes first, then the apps.

// Plan, or the trial countdown
function PlanChip({ tenant }) {
  if (!tenant.plan) return null
  const trial = tenant.trialDaysLeft != null
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", trial ? "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200" : "bg-background text-foreground")}>
      {trial ? `${tenant.plan} trial · ${tenant.trialDaysLeft} day${tenant.trialDaysLeft === 1 ? "" : "s"} left` : `${tenant.plan} plan`}
    </span>
  )
}

// The icon for a to-do: its app's, or its own
function TaskIcon({ task, apps, className }) {
  const app = apps.find((a) => a.code === task.app)
  if (app) return <AppIcon icon={app.icon} color={app.color} size="sm" className={cn("size-8 shrink-0 rounded-lg text-base", className)} />
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base text-primary", className)}>
      <Icon name={task.icon ?? "checkbox-circle-line"} />
    </span>
  )
}

function Card({ title, count, action, children, className, ...props }) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-background shadow-xs", className)} {...props}>
      <header className="flex min-h-12 items-center gap-2 border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {count > 0 && <span className="rounded-full bg-muted px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums">{count}</span>}
        <span className="ml-auto">{action}</span>
      </header>
      {children}
    </section>
  )
}

function Empty({ icon = "checkbox-circle-line", tone = "text-emerald-600 dark:text-emerald-400", children }) {
  return (
    <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
      <Icon name={icon} className={cn("text-base", tone)} />
      {children}
    </p>
  )
}

// Left: the apps someone pinned (a row of chips; Dashboards until they choose), then every app
// they can open by category, two to a row, each with a star to pin or unpin it
function AppsColumn({ apps, userId, tenantId }) {
  const groups = useMemo(() => groupApps(apps), [apps])
  const [pinned, togglePin] = usePinnedApps(userId, tenantId, apps)
  const pinnedApps = groups.flatMap((g) => g.apps).filter((a) => pinned.has(a.code))

  if (!apps.length)
    return (
      <div className="rounded-xl border border-dashed bg-background py-10 text-center">
        <Icon name="lock-2-line" className="text-3xl text-muted-foreground" />
        <p className="mt-2 font-medium">No apps assigned yet</p>
        <p className="mt-1 px-4 text-sm text-muted-foreground">Your role doesn&apos;t open any app yet. Ask your company administrator.</p>
      </div>
    )

  return (
    <div className="@container space-y-5">
      {pinnedApps.length > 0 && (
        <section aria-labelledby="cat-pinned">
          <h2 id="cat-pinned" className="mb-2 flex items-center gap-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Icon name="star-fill" className="text-amber-500" /> Pinned
          </h2>
          <div className="flex flex-wrap gap-2">
            {pinnedApps.map((app) => (
              <Link
                key={app.code}
                href={appPath(app.code)}
                className="flex items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1 text-sm font-medium shadow-xs transition outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AppIcon icon={app.icon} color={app.color} size="sm" className="size-7 rounded-full text-base" />
                {app.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      {groups.map((group, i) => (
        <section key={group.category} aria-labelledby={`cat-${group.category}`} data-tour={i === 0 ? "apps" : undefined}>
          <h2 id={`cat-${group.category}`} className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {group.category}
          </h2>
          <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3 @5xl:grid-cols-4">
            {group.apps.map((app) => {
              const on = pinned.has(app.code)
              return (
                <div key={app.code} className="group relative">
                  <Link
                    href={appPath(app.code)}
                    className="flex h-full flex-col gap-2.5 rounded-xl border bg-background p-3 shadow-xs transition outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    <AppIcon icon={app.icon} color={app.color} className="size-13 rounded-2xl text-2xl transition-transform group-hover:scale-105 motion-reduce:transition-none" />
                    <span className="min-w-0">
                      <span className="block truncate pr-6 text-[15px] font-semibold">{app.name}</span>
                      <span className="mt-1 block text-sm leading-snug text-pretty text-muted-foreground">{app.description}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => togglePin(app.code)}
                    aria-pressed={on}
                    aria-label={on ? `Unpin ${app.name}` : `Pin ${app.name}`}
                    title={on ? "Unpin" : "Pin to top"}
                    className={cn(
                      "absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-md text-base transition outline-none hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "text-amber-500" : "text-muted-foreground opacity-0 group-hover:opacity-100 max-md:opacity-100",
                    )}
                  >
                    <Icon name={on ? "star-fill" : "star-line"} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// Right: My Desk, kept short. Greeting and its pages; what needs you now (only when something
// does); setup until it's done; then to-dos, requests waiting and recent activity, a few each.
const SHOWN = 5

function Row({ href, children }) {
  const cls = "flex items-center gap-3 px-4 py-2 transition-colors"
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-muted/50")}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  )
}

function DeskColumn({ user, role, tenant, desk, apps, greeting, today, setupSteps, team, selfService }) {
  const appOf = (code) => apps.find((a) => a.code === code)
  const { counts } = desk
  const [allTasks, setAllTasks] = useState(false)
  const tasks = allTasks ? desk.tasks : desk.tasks.slice(0, SHOWN)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{[desk.me.designation, role.name, tenant.name].filter(Boolean).join(" · ")}</span>
            {role.isOwner && <PlanChip tenant={tenant} />}
          </p>
        </div>
        {/* My Desk's own pages */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon="shield-check-line" nativeButton={false} render={<Link href="/approvals" />}>
            Approvals
            {counts.approvals > 0 && <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] leading-4 font-semibold text-primary-foreground tabular-nums">{counts.approvals}</span>}
          </Button>
          {/* HR self-service, for people on the payroll */}
          {selfService?.leave && (
            <Button variant="outline" size="sm" leftIcon="plane-line" nativeButton={false} render={<Link href="/my-leave" />}>
              My leave
            </Button>
          )}
          {selfService?.pay && (
            <Button variant="outline" size="sm" leftIcon="money-rupee-circle-line" nativeButton={false} render={<Link href="/my-pay" />}>
              My pay
            </Button>
          )}
          {selfService?.roster && (
            <Button variant="outline" size="sm" leftIcon="calendar-schedule-line" nativeButton={false} render={<Link href="/my-roster" />}>
              My roster
            </Button>
          )}
          {desk.hasTeam && (
            <Button variant="outline" size="sm" leftIcon="team-line" nativeButton={false} render={<Link href="/my-team" />}>
              My team
            </Button>
          )}
          <Button variant="outline" size="sm" leftIcon="user-3-line" nativeButton={false} render={<Link href="/profile" />}>
            Profile
          </Button>
          <Button variant="outline" size="sm" leftIcon="book-open-line" nativeButton={false} render={<Link href="/guide" />}>
            User guide
          </Button>
        </div>
      </div>

      {/* What can't wait, only when something can't */}
      {desk.critical.length > 0 && (
        <section aria-labelledby="critical-title" data-tour="critical" className="overflow-hidden rounded-xl border border-red-500/25 bg-red-500/[0.04] shadow-xs">
          <header className="flex items-center gap-2 px-4 pt-2.5 pb-1">
            <span className="size-2 rounded-full bg-red-500" aria-hidden />
            <h2 id="critical-title" className="text-sm font-semibold">
              Needs you now
            </h2>
            <span className="text-sm text-muted-foreground tabular-nums">{desk.critical.length}</span>
          </header>
          <ul className="pb-1.5">
            {desk.critical.slice(0, SHOWN).map((t) => (
              <li key={t.id}>
                <Row href={t.href}>
                  <TaskIcon task={t} apps={apps} className="size-6 rounded-md text-xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{t.title}</span>
                    {t.detail && <span className="text-red-600 dark:text-red-400"> · {t.detail}</span>}
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GettingStarted steps={setupSteps} team={team} />

      <div className="grid items-start gap-4 xl:grid-cols-2" data-tour="desk">
        <Card title="To-do" count={desk.tasks.length}>
          {desk.tasks.length ? (
            <>
              <ul className="divide-y">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Row href={t.href}>
                      <TaskIcon task={t} apps={apps} className="size-7 rounded-md text-sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.title}</span>
                        {t.detail && <span className="block truncate text-xs text-muted-foreground">{t.detail}</span>}
                      </span>
                    </Row>
                  </li>
                ))}
              </ul>
              {desk.tasks.length > SHOWN && (
                <button type="button" onClick={() => setAllTasks((v) => !v)} className="w-full cursor-pointer border-t px-4 py-2 text-left text-sm font-medium text-primary hover:bg-muted/50">
                  {allTasks ? "Show fewer" : `Show ${desk.tasks.length - SHOWN} more`}
                </button>
              )}
            </>
          ) : (
            <Empty>You&apos;re all caught up</Empty>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="Waiting for your sign-off"
            count={counts.approvals}
            action={
              counts.mine > 0 && (
                <Link href="/approvals" className="text-xs font-medium text-primary hover:underline">
                  Yours: {counts.mine} pending
                </Link>
              )
            }
          >
            {desk.approvals.length ? (
              <ul className="divide-y">
                {desk.approvals.slice(0, 3).map((a) => (
                  <li key={a.code}>
                    <Row href="/approvals">
                      <Avatar name={a.requester?.name ?? "?"} source={a.requester?.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <span className="font-medium">{a.title}</span>
                        <span className="text-muted-foreground"> · {a.requester?.name ?? "Someone"}</span>
                      </span>
                    </Row>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing waiting for you</Empty>
            )}
          </Card>

          <Card title="Recent">
            {desk.recent.length ? (
              <ul className="divide-y">
                {desk.recent.slice(0, 4).map((r, i) => {
                  const a = appOf(r.app)
                  return (
                    <li key={i}>
                      <Row href={r.href}>
                        {a ? <AppIcon icon={a.icon} color={a.color} size="sm" className="size-6 shrink-0 rounded-md text-xs" /> : <Icon name="history-line" className="shrink-0 text-base text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate text-sm first-letter:uppercase">{r.summary}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.at)}</span>
                      </Row>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty icon="history-line" tone="text-muted-foreground">
                What you do across the apps shows here
              </Empty>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// The width someone drags the apps column to is a per-browser preference: localStorage, guarded
// for private mode
const layoutStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // storage unavailable: the width lasts until reload
    }
  },
}

// Large screens: apps and My Desk side by side, the divider between them draggable
function ResizableColumns({ apps, desk }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "propflow-launcher", storage: layoutStorage, onlySaveAfterUserInteractions: true })
  return (
    <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} className="h-[calc(100svh-3.5rem)]">
      <ResizablePanel id="apps" defaultSize="34" minSize="24" maxSize="55">
        <aside aria-label="Apps" className="h-full">
          <ScrollView variant="subtle" className="h-full" viewportClassName="px-5 py-6">
            {apps}
          </ScrollView>
        </aside>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="desk" minSize="40">
        <ScrollView variant="subtle" className="h-full" viewportClassName="px-8 py-8">
          {desk}
        </ScrollView>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export function Launcher({ user, role, tenant, apps, desk, greeting, today, setupSteps = null, team = null, selfService = null, startTour = false }) {
  const router = useRouter()
  // Side by side from 56rem (896px): a ~1000px laptop window shouldn't fall back to the stacked layout
  const lg = useMediaQuery("(min-width: 56rem)")
  // The guided tour: right after setup (?tour=1) or from the account menu
  const [touring, setTouring] = useState(startTour)
  const appsColumn = <AppsColumn apps={apps} userId={user.id} tenantId={tenant.id} />
  const deskColumn = <DeskColumn user={user} role={role} tenant={tenant} desk={desk} apps={apps} greeting={greeting} today={today} setupSteps={setupSteps} team={team} selfService={selfService} />

  return (
    <main>
      {lg ? (
        <ResizableColumns apps={appsColumn} desk={deskColumn} />
      ) : (
        // Phones and tablets: My Desk first, then the apps
        <div className="flex flex-col">
          <div className="min-w-0 px-4 py-6 sm:px-6">{deskColumn}</div>
          <aside aria-label="Apps" className="border-t px-4 py-6 sm:px-6">
            {appsColumn}
          </aside>
        </div>
      )}

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
