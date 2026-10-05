"use client"

import { sameMonths } from "@/lib/format"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toHex } from "@/lib/color"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"
import { interestText } from "../constants"
import { AgentChip, LeadStatusBadge, TempIcon, dueText } from "./lead-parts"
import { ScoreBadge } from "./lead-score"

// CRM Overview: tiles, the pipeline by stage, new leads per week, sources, what's due and the
// best prospects; managers also see their agents. Data: crmOverview() (server/overview.js).

const leadHref = (code) => `/crm/leads?lead=${urlCode(code)}`
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Tile({ icon, label, value, hint, tone, href }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon name={icon} className="text-base" />
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className={cn("mt-1 text-[13px] text-muted-foreground", tone)}>{hint}</p>}
    </>
  )
  const cls = "rounded-xl border bg-background p-4 shadow-xs"
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-primary/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function Card({ title, description, action, children, className }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-background shadow-xs", className)}>
      <header className="flex items-start gap-3 border-b px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

function Empty({ children }) {
  return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{children}</p>
}

// Open leads by stage: one bar each, in the stage's color, labeled
function Stages({ stages }) {
  const statuses = useList("lead-status")
  const max = Math.max(1, ...stages.map((s) => s.count))
  return (
    <ul className="space-y-3 px-5 py-4">
      {stages.map((s) => (
        <li key={s.status}>
          <Link href={`/crm/leads`} className="group block">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate group-hover:text-primary">{statuses.label(s.status)}</span>
              <span className="font-semibold tabular-nums">{s.count}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-foreground/6">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(s.count ? 2 : 0, (s.count / max) * 100)}%`, backgroundColor: toHex(statuses.map[s.status]?.color) ?? "#64748b" }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// New leads per week: columns with the count on hover; the latest week is labeled
function Weeks({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.count))
  const label = (d) => sameMonths(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${d}T00:00:00`)))
  return (
    <div className="px-5 pt-5 pb-4">
      <div className="flex h-40 items-end gap-1.5 border-b">
        {weeks.map((w, i) => (
          <Tooltip key={w.from} content={`Week of ${label(w.from)}: ${plural(w.count, "new lead")}${w.booked ? `, ${w.booked} booked` : ""}`}>
            <div className="group flex h-full flex-1 cursor-default flex-col justify-end">
              {i === weeks.length - 1 && <span className="mb-1 text-center text-[11px] font-semibold tabular-nums">{w.count}</span>}
              <div className={cn("min-h-[2px] rounded-t-[4px] transition-colors", i === weeks.length - 1 ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70")} style={{ height: `${(w.count / max) * 100}%` }} />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{label(weeks[0].from)}</span>
        <span>This week</span>
      </div>
    </div>
  )
}

function Sources({ sources }) {
  const list = useList("lead-source")
  const max = Math.max(1, ...sources.map((s) => s.leads))
  if (!sources.length) return <Empty>No leads in the last 90 days.</Empty>
  return (
    <ul className="space-y-3 px-5 py-4">
      {sources.slice(0, 7).map((s) => (
        <li key={s.source ?? "none"}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{s.source ? list.label(s.source) : "No source"}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{s.leads}</span>
              {s.booked > 0 && ` · ${s.booked} booked (${Math.round((s.booked / s.leads) * 100)}%)`}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-foreground/6">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${(s.leads / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function LeadRows({ leads, right }) {
  const types = useList("unit-type")
  return (
    <ul className="divide-y">
      {leads.map((l) => (
        <li key={l.code}>
          <Link href={leadHref(l.code)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50">
            <TempIcon priority={l.priority} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{l.name}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{interestText(l.interest, { typeLabel: types.label })}</span>
            </span>
            {right(l)}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function OverviewView({ data, me, canCreate }) {
  const t = data.tiles
  const types = useList("activity-type")
  const change = t.newLastMonth ? Math.round(((t.newThisMonth - t.newLastMonth) / t.newLastMonth) * 100) : null
  const hours = t.medianHours == null ? "—" : t.medianHours < 1 ? `${Math.max(1, Math.round(t.medianHours * 60))}m` : t.medianHours < 48 ? `${Math.round(t.medianHours)}h` : `${Math.round(t.medianHours / 24)}d`

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Overview"
        description={data.scope === "own" ? "Your leads at a glance" : data.scope === "team" ? "Your team's leads at a glance" : "Every lead at a glance"}
        actions={
          <>
            <Button variant="outline" leftIcon="user-star-line" nativeButton={false} render={<Link href="/crm/leads" />}>
              All leads
            </Button>
            {canCreate && (
              <Button leftIcon="add-line" nativeButton={false} render={<Link href="/crm/leads?new=1" />}>
                New lead
              </Button>
            )}
          </>
        }
      />

      {data.total === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-background px-4 py-16 text-center">
          <Icon name="dashboard-line" className="text-4xl text-muted-foreground" />
          <p className="mt-3 font-medium">Nothing to show yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add your first leads and this page fills with your pipeline, follow-ups and conversions.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon="user-star-line" label="Open leads" value={t.open} hint={`${t.newThisWeek} new this week${t.untouched ? ` · ${t.untouched} not contacted yet` : ""}`} href="/crm/leads" />
            <Tile
              icon="calendar-check-line"
              label="Follow-ups due today"
              value={t.due}
              hint={t.overdue ? `${t.overdue} overdue` : "Nothing overdue"}
              tone={t.overdue ? "text-red-600 dark:text-red-400 font-medium" : undefined}
              href="/crm/leads?tab=due"
            />
            <Tile
              icon="add-circle-line"
              label="New this month"
              value={t.newThisMonth}
              hint={change == null ? "First month with leads" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% on last month so far`}
              tone={change == null ? undefined : change >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}
            />
            <Tile
              icon="trophy-line"
              label="Booked this month"
              value={t.bookedThisMonth}
              hint={t.conversion == null ? "No leads closed in 90 days" : `${t.conversion}% of ${t.closed90} closed in 90 days were booked`}
              href="/crm/leads?tab=booked"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Pipeline" description="Open leads by stage">
              <Stages stages={data.stages} />
            </Card>
            <Card title="New leads" description="Per week, last 12 weeks" className="lg:col-span-2">
              <Weeks weeks={data.weeks} />
              <div className="grid grid-cols-2 border-t text-sm">
                <div className="px-5 py-3">
                  <p className="text-muted-foreground">First response (median)</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{hours}</p>
                </div>
                <div className="border-l px-5 py-3">
                  <p className="text-muted-foreground">Gone quiet</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{t.stale == null ? "—" : `${plural(t.stale, "lead")} · ${t.staleDays}+ days`}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card
              title="Due today"
              description={t.overdue ? `${t.overdue} overdue first` : "Follow-ups for today"}
              action={
                t.due > 0 && (
                  <Link href="/crm/leads?tab=due" className="text-sm font-medium text-primary hover:underline">
                    All {t.due}
                  </Link>
                )
              }
            >
              {data.due.length ? (
                <LeadRows
                  leads={data.due}
                  right={(l) => {
                    const d = dueText(l.next.at)
                    return (
                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[13px]">
                        <span className={cn("whitespace-nowrap", d.tone)}>{d.text}</span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Icon name={types.map[l.next.type]?.icon ?? "phone-line"} />
                          {types.label(l.next.type)}
                        </span>
                      </span>
                    )
                  }}
                />
              ) : (
                <Empty>Nothing due today. Nice.</Empty>
              )}
            </Card>
            <Card title="Top prospects" description="Open leads with the best score">
              {data.top == null ? (
                <Empty>Lead scoring is switched off in CRM settings.</Empty>
              ) : data.top.length ? (
                <LeadRows leads={data.top} right={(l) => <ScoreBadge score={l.score} />} />
              ) : (
                <Empty>No open leads yet.</Empty>
              )}
            </Card>
            <Card title="Sources" description="Last 90 days, and how many booked">
              <Sources sources={data.sources} />
            </Card>
          </div>

          {data.agents && data.agents.length > 0 && (
            <Card title="Agents" description="Open leads, what's due today, and bookings this month">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[13px] text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">Agent</th>
                      <th className="px-3 py-2.5 text-right font-medium">Open</th>
                      <th className="px-3 py-2.5 text-right font-medium">Due today</th>
                      <th className="px-3 py-2.5 text-right font-medium">Avg score</th>
                      <th className="px-5 py-2.5 text-right font-medium">Booked this month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.agents.map((a) => (
                      <tr key={a.agent?.id ?? "none"}>
                        <td className="px-5 py-2.5">
                          <AgentChip agent={a.agent ? { ...a.agent, name: a.agent.id === me ? `${a.agent.name} (me)` : a.agent.name } : null} />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{a.open}</td>
                        <td className={cn("px-3 py-2.5 text-right tabular-nums", a.due > 0 && "font-medium")}>{a.due}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{a.avgScore ?? "—"}</td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{a.booked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
