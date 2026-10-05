"use client"

import Link from "next/link"
import { useState } from "react"
import { AppIcon } from "@/components/app-icon"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { APP_GUIDES } from "../content"
import { APP_BLOCKS } from "../blocks"
import { Block } from "./blocks"
import { Access, RolePicker, SectionTitle, TaskCard, allowed, guideHref } from "./guide-parts"

// One app's page in the User Guide: what it's for, the role's access, screenshots with numbered
// areas, flow diagrams and tables, then the how-tos (the ones the role can't do on request), with
// the other apps alongside.
//   code: the app · loadGuide(): { role, apps, grants, roles, grantLabels }

export function GuideArticle({ code, role, apps, grants, roles, grantLabels }) {
  const [everything, setEverything] = useState(false)
  const i = apps.findIndex((a) => a.code === code)
  const app = apps[i]
  const guide = APP_GUIDES[code]
  const blocks = APP_BLOCKS[code] ?? []
  const tasks = guide.tasks.map((t) => ({ ...t, ok: allowed(t.need, app, role, grants) }))
  const shown = tasks.filter((t) => everything || t.ok)
  const hidden = tasks.length - tasks.filter((t) => t.ok).length
  const withGuide = apps.filter((a) => APP_GUIDES[a.code])
  const at = withGuide.findIndex((a) => a.code === code)
  const prev = withGuide[at - 1]
  const next = withGuide[at + 1]
  // Anchors for the outline: every block but callouts
  const ids = blocks.map((b, k) => (b.type === "callout" ? null : `b${k}`))
  const outline = [
    ...blocks.flatMap((b, k) => (ids[k] ? [{ id: ids[k], label: b.caption ?? b.title, icon: b.type === "screen" ? "image-line" : b.type === "flow" ? "flow-chart" : "table-line" }] : [])),
    { id: "how-to", label: "How-tos", icon: "list-check-3" },
  ]

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 p-4 sm:p-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:p-8">
      <nav aria-label="User Guide" className="hidden lg:block">
        <div className="sticky top-20 space-y-5">
          <Link href={guideHref("/guide", role)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Icon name="arrow-left-line" /> User Guide
          </Link>
          <div>
            <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">On this page</p>
            <ul className="space-y-0.5">
              {outline.map((o) => (
                <li key={o.id}>
                  <a href={`#${o.id}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Icon name={o.icon} className="shrink-0" /> <span className="truncate">{o.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Apps</p>
            <ul className="space-y-0.5">
              {withGuide.map((a) => (
                <li key={a.code}>
                  <Link
                    href={guideHref(`/guide/${a.code}`, role)}
                    aria-current={a.code === code ? "page" : undefined}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-primary"
                  >
                    <AppIcon icon={a.icon} color={a.color} size="sm" className="size-5 rounded-md text-xs" />
                    <span className="truncate">{a.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>

      <article className="min-w-0 space-y-8">
        <header className="space-y-4">
          <Link href={guideHref("/guide", role)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
            <Icon name="arrow-left-line" /> User Guide
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <AppIcon icon={app.icon} color={app.color} className="size-12 rounded-2xl text-2xl" />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
                <p className="mt-1 max-w-2xl text-muted-foreground">{guide.intro}</p>
              </div>
            </div>
            <RolePicker role={role} roles={roles} />
          </div>
          {code !== "desk" && <Access app={app} role={role} />}
        </header>

        {blocks.map((b, k) => (
          <div key={k} id={ids[k] ?? undefined} className="scroll-mt-20">
            <Block block={b} />
          </div>
        ))}

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionTitle
              id="how-to"
              icon="list-check-3"
              title="How-tos"
              text={`Step by step, with a link to where it starts.${hidden && !everything ? ` ${hidden} more need${hidden === 1 ? "s" : ""} permissions ${role.mine ? "your" : "this"} role doesn't have.` : ""}`}
            />
            {hidden > 0 && <Switch checked={everything} onChange={setEverything} label="Show them all" />}
          </div>
          {shown.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {shown.map((t) => (
                <TaskCard key={t.id} task={t} app={app} grantLabels={grantLabels} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No how-tos for {role.mine ? "your" : "this"} role here yet.</p>
          )}
        </section>

        <nav aria-label="Other apps" className="grid gap-3 border-t pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={guideHref(`/guide/${prev.code}`, role)} className="group rounded-xl border p-4 hover:border-primary/40">
              <span className="text-xs text-muted-foreground">Previous</span>
              <span className="mt-1 flex items-center gap-2 font-medium group-hover:text-primary">
                <Icon name="arrow-left-line" /> {prev.name}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={guideHref(`/guide/${next.code}`, role)} className="group rounded-xl border p-4 text-right hover:border-primary/40">
              <span className="text-xs text-muted-foreground">Next</span>
              <span className="mt-1 flex items-center justify-end gap-2 font-medium group-hover:text-primary">
                {next.name} <Icon name="arrow-right-line" />
              </span>
            </Link>
          )}
        </nav>
      </article>
    </div>
  )
}
