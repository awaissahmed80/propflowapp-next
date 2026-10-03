"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr, timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { vizColor } from "@/lib/chart-colors"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { LeadStatusBadge } from "@/modules/crm/components/lead-parts"
import { DetailRow } from "@/components/detail-row"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { BarChart } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { Tabs } from "@/components/ui/tabs"
import { moveCampaign } from "../server/campaign-actions"
import { AD_PLATFORMS, dateRange, pct, timing, utmFor } from "../constants"
import { CampaignStatusBadge, ChannelName, GoalRow, Meter, Objective } from "./campaign-parts"

// One campaign: its results (goals, lead-to-booking funnel, leads per day), each channel's spend
// and cost per lead, the leads it brought in (linked to CRM when this person can see them) and
// tracking links for its ads. Launch / pause / resume / end for people who can edit.
//   campaign: getCampaign() with pages[].url filled in; baseUrl: tracking link fallback when
//   there's no landing page

const DAY = 86_400_000
const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const slugify = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
// Goals are worked out from CRM results, so they mirror goalActual() on the server
const goalActual = (metric, r) => ({ leads: r.leads, "site-visits": r.visits, bookings: r.bookings, cpl: r.cpl })[metric] ?? null

function ViewAll({ href, children }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}

function Empty({ icon, text }) {
  return (
    <div className="rounded-xl border border-dashed bg-background py-10 text-center text-sm text-muted-foreground">
      <Icon name={icon} className="text-2xl" />
      <p className="mt-1">{text}</p>
    </div>
  )
}

// Leads per day across the campaign (up to today), for the chart
function perDay(c, now) {
  if (!c.startDate) return []
  const start = new Date(`${c.startDate}T00:00:00`).getTime()
  const end = Math.min(c.endDate ? new Date(`${c.endDate}T00:00:00`).getTime() : now, now)
  if (end < start) return []
  const days = Math.min(120, Math.floor((end - start) / DAY) + 1)
  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date(start + i * DAY)
    return { key: d.toDateString(), day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), leads: 0 }
  })
  const index = new Map(rows.map((r, i) => [r.key, i]))
  for (const l of c.leads) {
    const i = index.get(new Date(l.createdAt).toDateString())
    if (i != null) rows[i].leads += 1
  }
  return rows
}

function Funnel({ r }) {
  const steps = [
    { label: "Leads", value: r.leads },
    { label: "Contacted", value: r.contacted },
    { label: "Site visit", value: r.visits },
    { label: "Booked", value: r.bookings },
  ]
  return (
    <ul className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.label} className="grid grid-cols-[6rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm">
          <span>{s.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${pct(s.value, Math.max(1, r.leads))}%`, background: vizColor("blue") }} />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-medium">{s.value}</span>
            {i > 0 && <span className="text-xs text-muted-foreground"> · {pct(s.value, r.leads)}%</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

// UTM-tagged links per channel, from the landing page address (editable), plus the campaign's
// pages and forms
function TrackingLinks({ c, baseUrl }) {
  const live = c.pages.find((p) => p.status === "published") ?? c.pages[0]
  const [base, setBase] = useState(live?.url ?? baseUrl)
  const [copied, setCopied] = useState(null)
  const link = (channel) => {
    const [source, medium] = utmFor(channel)
    const params = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: slugify(c.name) })
    return `${base.trim()}${base.includes("?") ? "&" : "?"}${params}`
  }
  const copy = async (channel) => {
    try {
      await navigator.clipboard.writeText(link(channel))
      setCopied(channel)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }
  return (
    <div className="space-y-4">
      <SectionCard title="Tracking links">
        <p className="mb-3 text-sm text-muted-foreground">Use these links in each channel&apos;s ads. Leads from the landing page or form are matched to this campaign and channel automatically.</p>
        <Input label="Landing page address" value={base} onChange={(e) => setBase(e.target.value)} />
        <ul className="mt-4 divide-y rounded-lg border">
          {c.channels.map((ch) => (
            <li key={ch.channel} className="flex items-center gap-3 px-3 py-2.5">
              <ChannelName channel={ch.channel} className="w-40 shrink-0 text-sm" />
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{link(ch.channel)}</code>
              <IconButton icon={copied === ch.channel ? "check-line" : "file-copy-line"} variant="ghost" tooltip={copied === ch.channel ? "Copied" : "Copy link"} onClick={() => copy(ch.channel)} />
            </li>
          ))}
        </ul>
      </SectionCard>
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Landing pages" bodyClassName="p-0" action={<ViewAll href="/campaigns/pages">All pages</ViewAll>}>
          {c.pages.length ? (
            <ul className="divide-y">
              {c.pages.map((p) => (
                <li key={p.code}>
                  <Link href={`/campaigns/pages/${urlCode(p.code)}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <Icon name="pages-line" className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm group-hover:text-primary">{p.name}</span>
                    <Badge color={p.status === "published" ? "green" : "gray"} dot>
                      {p.status === "published" ? "Published" : "Draft"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No landing page yet.</p>
          )}
        </SectionCard>
        <SectionCard title="Lead forms" bodyClassName="p-0" action={<ViewAll href="/campaigns/forms">All forms</ViewAll>}>
          {c.forms.length ? (
            <ul className="divide-y">
              {c.forms.map((f) => (
                <li key={f.code}>
                  <Link href={`/campaigns/forms/${urlCode(f.code)}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <Icon name="survey-line" className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm group-hover:text-primary">{f.name}</span>
                    <Icon name="arrow-right-s-line" className="text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No lead form yet.</p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

// What can happen next from where the campaign is today (moveCampaign moves)
const NEXT = {
  draft: [{ move: "launch", label: "Launch", icon: "rocket-2-line", done: "Campaign launched." }],
  scheduled: [{ move: "draft", label: "Back to draft", icon: "draft-line", outline: true, done: "Back to draft." }],
  active: [
    { move: "pause", label: "Pause", icon: "pause-line", outline: true, done: "Campaign paused." },
    { move: "end", label: "End campaign", icon: "stop-circle-line", outline: true, done: "Campaign ended." },
  ],
  paused: [
    { move: "resume", label: "Resume", icon: "play-line", done: "Campaign resumed." },
    { move: "end", label: "End campaign", icon: "stop-circle-line", outline: true, done: "Campaign ended." },
  ],
  completed: [],
}

export function CampaignDetail({ campaign: c, baseUrl, canEdit = false }) {
  const router = useRouter()
  const sources = useList("lead-source")
  const [now] = useState(() => Date.now())
  const [busy, setBusy] = useState(null)
  const daily = useMemo(() => perDay(c, now), [c, now])

  const r = c.results
  const goal = (metric) => c.goals.find((g) => g.metric === metric)
  const goalHint = (metric, actual) => (goal(metric) ? `${pct(actual, goal(metric).target)}% of ${number(goal(metric).target)} goal` : "No goal set")
  const showDigital = c.channels.some((ch) => AD_PLATFORMS.includes(ch.channel))

  const move = async (a) => {
    setBusy(a.move)
    const res = await toastAction(() => moveCampaign(c.code, a.move), { loading: "Updating…", success: a.done })
    setBusy(null)
    if (res?.ok) router.refresh()
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/campaigns/all" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Campaigns
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{c.name}</h1>
              <CampaignStatusBadge status={c.displayStatus} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{c.code}</span>
              <Objective value={c.objective} />
              <span className="flex items-center gap-1">
                <Icon name="community-line" /> {c.project?.name ?? "All projects"}
              </span>
              <span className="flex items-center gap-1">
                <Icon name="calendar-line" /> {dateRange(c)} · {timing(c, now)}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {(NEXT[c.displayStatus] ?? []).map((a) => (
                <Button key={a.move} variant={a.outline ? "outline" : "default"} leftIcon={a.icon} loading={busy === a.move} disabled={Boolean(busy) || (a.move === "launch" && !c.startDate)} onClick={() => move(a)}>
                  {a.label}
                </Button>
              ))}
              <Button variant="outline" leftIcon="edit-line" nativeButton={false} render={<Link href={`/campaigns/all/${urlCode(c.code)}/edit`} />}>
                Edit
              </Button>
            </div>
          )}
        </div>
        {c.displayStatus === "draft" && !c.startDate && (
          <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Icon name="information-line" /> Set a start date before launching.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile icon="user-add-line" label="Leads" value={number(r.leads)} hint={goalHint("leads", r.leads)} />
        <StatTile icon="map-pin-user-line" tone="sky" label="Site visits" value={number(r.visits)} hint={goalHint("site-visits", r.visits)} />
        <StatTile icon="hand-coin-line" tone="green" label="Bookings" value={number(r.bookings)} hint={goalHint("bookings", r.bookings)} />
        <StatTile icon="wallet-3-line" tone={r.spend > r.budget ? "red" : "violet"} label="Spend" value={formatPkr(r.spend)} hint={`${pct(r.spend, r.budget)}% of ${formatPkr(r.budget)}`} />
        <StatTile icon="price-tag-3-line" tone="amber" label="Cost per lead" value={r.cpl != null ? formatPkr(r.cpl) : "—"} hint={r.cpb != null ? `${formatPkr(r.cpb)} per booking` : "No bookings yet"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Tabs
            tabs={[
              {
                value: "performance",
                label: "Performance",
                icon: "line-chart-line",
                content: (
                  <div className="space-y-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <SectionCard title="Goals" bodyClassName="space-y-4">
                        {c.goals.length ? c.goals.map((g) => <GoalRow key={g.metric} goal={g} actual={goalActual(g.metric, r)} />) : <p className="text-sm text-muted-foreground">No goals set.</p>}
                      </SectionCard>
                      <SectionCard title="Lead to booking">
                        <Funnel r={r} />
                        {r.lost > 0 && (
                          <p className="mt-4 text-xs text-muted-foreground">
                            {r.lost} lost · {r.open} still open in CRM
                          </p>
                        )}
                      </SectionCard>
                    </div>
                    <SectionCard title="Leads per day">
                      {daily.length ? (
                        <BarChart data={daily} xKey="day" showLegend={false} valueFormatter={number} series={[{ key: "leads", label: "Leads", color: vizColor("blue") }]} style={{ height: 220 }} />
                      ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">{c.startDate ? "Starts soon; leads will show here." : "Not scheduled yet."}</p>
                      )}
                    </SectionCard>
                  </div>
                ),
              },
              {
                value: "channels",
                label: "Channels",
                icon: "broadcast-line",
                count: c.channels.length,
                content: (
                  <div className="overflow-x-auto rounded-xl border bg-background shadow-xs">
                    <table className="w-full min-w-[46rem] text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Channel</th>
                          <th className="px-4 py-2 text-left font-medium">Spend</th>
                          {showDigital && (
                            <>
                              <th className="px-4 py-2 text-right font-medium">Impressions</th>
                              <th className="px-4 py-2 text-right font-medium">Clicks</th>
                            </>
                          )}
                          <th className="px-4 py-2 text-right font-medium">Leads</th>
                          <th className="px-4 py-2 text-right font-medium">Cost / lead</th>
                          <th className="px-4 py-2 text-right font-medium">Visits</th>
                          <th className="px-4 py-2 text-right font-medium">Bookings</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {c.channels.map((ch) => (
                          <tr key={ch.channel}>
                            <td className="px-4 py-2.5">
                              <ChannelName channel={ch.channel} />
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="block tabular-nums">
                                {formatPkr(ch.spend)}
                                <span className="text-xs text-muted-foreground"> of {formatPkr(ch.budget).replace("Rs ", "")}</span>
                              </span>
                              <Meter className="mt-1 w-28" value={ch.spend} max={ch.budget} tone={ch.spend > ch.budget ? "red" : "primary"} />
                            </td>
                            {showDigital && (
                              <>
                                <td className="px-4 py-2.5 text-right tabular-nums">{ch.impressions ? number(ch.impressions) : "—"}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">
                                  {ch.clicks ? (
                                    <>
                                      {number(ch.clicks)}
                                      {ch.ctr != null && <span className="block text-xs text-muted-foreground">{(ch.ctr * 100).toFixed(1)}% CTR</span>}
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              </>
                            )}
                            <td className="px-4 py-2.5 text-right font-medium tabular-nums">{ch.leads}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{ch.cpl != null ? formatPkr(ch.cpl) : "—"}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{ch.visits}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{ch.bookings}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ),
              },
              {
                value: "leads",
                label: "Leads",
                icon: "user-star-line",
                count: c.leads.length,
                content: c.leads.length ? (
                  <div className="divide-y rounded-xl border bg-background shadow-xs">
                    {c.leads.map((l, i) => {
                      const body = (
                        <>
                          <Avatar name={l.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <span className="block truncate font-medium group-hover:text-primary">{l.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{[l.code, sources.label(l.source), timeAgo(l.createdAt)].filter(Boolean).join(" · ")}</span>
                          </div>
                          <span className="hidden w-36 items-center gap-1.5 truncate text-sm text-muted-foreground md:flex">
                            {l.agent ? (
                              <>
                                <Avatar name={l.agent.name} source={l.agent.avatarUrl} size="xs" />
                                <span className="truncate">{l.agent.name}</span>
                              </>
                            ) : (
                              "Unassigned"
                            )}
                          </span>
                          <LeadStatusBadge status={l.status} />
                        </>
                      )
                      return l.code ? (
                        <Link key={l.code} href={`/crm/leads?lead=${urlCode(l.code)}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                          {body}
                        </Link>
                      ) : (
                        <div key={`hidden-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                          {body}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <Empty icon="user-star-line" text="No leads from this campaign yet." />
                ),
              },
              {
                value: "tracking",
                label: "Tracking",
                icon: "links-line",
                content: <TrackingLinks c={c} baseUrl={baseUrl} />,
              },
            ]}
          />
        </div>

        <aside className="space-y-6">
          <SectionCard title="About">
            <div className="divide-y">
              <DetailRow icon="group-line" label="Audience">
                {c.audience || "—"}
              </DetailRow>
              <DetailRow icon="gift-line" label="Offer">
                {c.offer || "—"}
              </DetailRow>
              <DetailRow icon="user-3-line" label="Campaign owner">
                {c.owner ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar name={c.owner.name} source={c.owner.avatarUrl} size="xs" />
                    {c.owner.name}
                  </span>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow icon="calendar-2-line" label="Created">
                {formatDate(c.createdAt)}
              </DetailRow>
            </div>
          </SectionCard>
          {c.notes && (
            <SectionCard title="Notes">
              <p className="text-sm whitespace-pre-line">{c.notes}</p>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  )
}
