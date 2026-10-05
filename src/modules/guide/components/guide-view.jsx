"use client"

import Link from "next/link"
import { useState } from "react"
import { AppIcon } from "@/components/app-icon"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { APP_GUIDES, BASICS, OWNER_START } from "../content"
import { BASICS_BLOCKS } from "../blocks"
import { Block, GuideTable } from "./blocks"
import { RolePicker, SectionTitle, allowed, guideHref } from "./guide-parts"

// The User Guide's front page: getting started (owners and administrators), the basics with how
// approvals and deleting work, the role's apps (each opens its own page) and, for administrators,
// every role against every app. Searching lists the matching how-tos from every app.
//   loadGuide(): { me, role, apps, grants, roles, grantLabels, matrix }

export function GuideView({ me, role, apps, grants, roles, matrix }) {
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const owner = role.full || role.setup

  // Search: how-tos the role can do, and the basics
  const results = q
    ? apps.flatMap((app) => (APP_GUIDES[app.code]?.tasks ?? []).filter((t) => allowed(t.need, app, role, grants) && [t.title, ...t.steps].some((x) => x.toLowerCase().includes(q))).map((t) => ({ app, task: t })))
    : []
  const basicHits = q ? BASICS.filter((b) => [b.title, ...b.points].some((x) => x.toLowerCase().includes(q))) : []

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-4 sm:p-6 lg:p-8">
      <header className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <Icon name="book-open-line" /> User Guide
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{role.mine ? `Welcome to ${me.workspace}, ${me.name.split(" ")[0]}` : `The guide for ${role.name}`}</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              {role.mine ? `You're signed in as ${role.name}. ` : `What people with the ${role.name} role see. `}
              Learn your way around, then open an app below for screenshots, diagrams and step-by-step how-tos.
            </p>
          </div>
          <RolePicker role={role} roles={roles} />
        </div>
        <div className="max-w-xl">
          <Input
            type="search"
            placeholder="Search the guide, e.g. “refund” or “leave”…"
            aria-label="Search the guide"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startElement={<Icon name="search-line" />}
          />
        </div>
      </header>

      {q ? (
        <section className="space-y-3">
          <SectionTitle icon="search-line" title={`Results for “${search.trim()}”`} />
          {results.length || basicHits.length ? (
            <ul className="divide-y rounded-xl border bg-background">
              {basicHits.map((b) => (
                <li key={b.id}>
                  <a href={`#${b.id}`} onClick={() => setSearch("")} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <Icon name={b.icon} className="text-lg text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{b.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">The basics</span>
                    </span>
                    <Icon name="arrow-right-s-line" className="text-muted-foreground" />
                  </a>
                </li>
              ))}
              {results.map(({ app, task }) => (
                <li key={`${app.code}-${task.id}`}>
                  <Link href={`${guideHref(`/guide/${app.code}`, role)}#${task.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <AppIcon icon={app.icon} color={app.color} size="sm" className="size-7 rounded-lg text-sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{task.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {app.name} · {task.steps[0]}
                      </span>
                    </span>
                    <Icon name="arrow-right-s-line" className="text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">Nothing in the guide matches. Try another word.</p>
          )}
        </section>
      ) : (
        <>
          {owner && (
            <section className="space-y-3">
              <SectionTitle icon="rocket-2-line" title="Getting started" text="For owners and administrators: get the workspace ready for your team, in this order." />
              <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {OWNER_START.map((s, i) => (
                  <li key={s.to}>
                    <Link href={s.to} className="group flex h-full gap-3 rounded-xl border bg-background p-4 shadow-xs transition-colors hover:border-primary/40">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block font-medium group-hover:text-primary">{s.title}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">{s.text}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="space-y-4">
            <SectionTitle icon="apps-2-line" title={role.mine ? "Your apps" : `${role.name}'s apps`} text="Open one for its screens, diagrams and how-tos." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {apps
                .filter((a) => APP_GUIDES[a.code])
                .map((app) => {
                  const tasks = APP_GUIDES[app.code].tasks
                  const can = tasks.filter((t) => allowed(t.need, app, role, grants)).length
                  return (
                    <Link key={app.code} href={guideHref(`/guide/${app.code}`, role)} className="group flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-xs transition-colors hover:border-primary/40">
                      <span className="flex items-center gap-3">
                        <AppIcon icon={app.icon} color={app.color} className="size-10 rounded-xl text-lg" />
                        <span className="font-semibold group-hover:text-primary">{app.name}</span>
                      </span>
                      <span className="flex-1 text-sm text-muted-foreground">{APP_GUIDES[app.code].intro}</span>
                      <span className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {can} of {tasks.length} how-tos for {role.mine ? "you" : "this role"}
                        </span>
                        <Icon name="arrow-right-line" className="text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </Link>
                  )
                })}
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle icon="compass-3-line" title="The basics" text="How PropFlow works, whichever app you're in." />
            <div className="grid gap-3 md:grid-cols-2">
              {BASICS.map((b) => (
                <article key={b.id} id={b.id} className="scroll-mt-20 rounded-xl border bg-background p-4 shadow-xs">
                  <h3 className="flex items-center gap-2 font-medium">
                    <Icon name={b.icon} className="text-lg text-primary" /> {b.title}
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {b.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <Icon name="arrow-right-s-line" className="mt-0.5 shrink-0" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="space-y-4">
              {BASICS_BLOCKS.filter((x) => x.type === "flow").map((x) => (
                <Block key={x.title} block={x} />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {BASICS_BLOCKS.filter((x) => x.type === "table").map((x) => (
                <Block key={x.title} block={x} />
              ))}
            </div>
          </section>

          {matrix && (
            <section className="space-y-3">
              <SectionTitle
                icon="shield-user-line"
                title="Who can do what"
                text="Every role against every app: V view, C create, E edit, D delete, A approve, X export. Change them in Users & Teams › Roles & Permissions."
              />
              <GuideTable
                columns={["Role", ...matrix.apps.map((a) => a.name)]}
                rows={matrix.rows.map((r) => [
                  <Link key="n" href={`/guide?role=${encodeURIComponent(r.code)}`} className="font-medium hover:text-primary hover:underline">
                    {r.name}
                  </Link>,
                  ...r.cells.map((c, i) =>
                    r.full ? (
                      <span key={i} className="font-medium text-emerald-600 dark:text-emerald-400">
                        Full
                      </span>
                    ) : c ? (
                      <span key={i} className="font-mono text-xs tracking-wider text-foreground">
                        {c}
                      </span>
                    ) : (
                      <span key={i}>—</span>
                    ),
                  ),
                ])}
              />
            </section>
          )}

          <p className="border-t pt-6 text-sm text-muted-foreground">
            New here?{" "}
            <Link href="/?tour=1" className="font-medium text-primary hover:underline">
              Take the tour
            </Link>{" "}
            for a quick walk around the screen. Can&apos;t do something you need? Ask an administrator to change your role.
          </p>
        </>
      )}
    </div>
  )
}
