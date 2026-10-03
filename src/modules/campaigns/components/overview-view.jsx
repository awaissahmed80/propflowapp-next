"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { vizColor } from "@/lib/chart-colors"
import { useList } from "@/modules/lookups/context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { BarChart } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { dateRange, timing } from "../constants"
import { CampaignStatusBadge, ChannelName, Meter } from "./campaign-parts"

// Campaigns › Overview: live campaigns, recent campaign leads, spend and cost per lead by
// channel, and what's coming up. data: campaignActivity() → { campaigns, leads }

const DAY = 86_400_000
const number = (n) => new Intl.NumberFormat("en-PK").format(n)
const href = (c) => `/campaigns/all/${urlCode(c.code)}`

function ViewAll({ href: to, children = "View all" }) {
  return (
    <Link href={to} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}

export function CampaignsOverview({ data, canCreate = false }) {
  const [now] = useState(() => Date.now())
  const sources = useList("lead-source")
  const objectives = useList("campaign-objective")

  const v = useMemo(() => {
    const { campaigns, leads } = data
    const running = campaigns.filter((c) => ["active", "paused"].includes(c.displayStatus))
    const upcoming = campaigns.filter((c) => ["draft", "scheduled"].includes(c.displayStatus)).sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"))
    const recent = leads.filter((l) => now - new Date(l.createdAt).getTime() < 30 * DAY)
    const sum = (list, fn) => list.reduce((s, x) => s + (Number(fn(x)) || 0), 0)
    const runSpend = sum(running, (c) => c.results.spend)
    const runLeads = sum(running, (c) => c.results.leads)
    const runBooked = sum(running, (c) => c.results.bookings)

    // Spend from each campaign's channels; leads and bookings from the leads' sources
    const byChannel = new Map()
    for (const c of campaigns)
      for (const ch of c.channels) {
        const row = byChannel.get(ch.channel) ?? { channel: ch.channel, spend: 0, leads: 0, bookings: 0 }
        row.spend += Number(ch.spend) || 0
        byChannel.set(ch.channel, row)
      }
    for (const l of leads) {
      const row = byChannel.get(l.source)
      if (!row) continue
      row.leads += 1
      if (l.booked) row.bookings += 1
    }
    const channels = [...byChannel.values()]
      .filter((r) => r.spend || r.leads)
      .map((r) => ({ ...r, cpl: r.leads ? Math.round(r.spend / r.leads) : null }))
      .sort((a, b) => b.leads - a.leads)

    const recentByChannel = [...recent.reduce((m, l) => m.set(l.source, (m.get(l.source) ?? 0) + 1), new Map()).entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)

    return {
      running,
      live: running.filter((c) => c.displayStatus === "active").length,
      paused: running.filter((c) => c.displayStatus === "paused").length,
      upcoming,
      leads30: recent.length,
      booked30: recent.filter((l) => l.booked).length,
      runSpend,
      runBudget: sum(running, (c) => c.results.budget),
      cpl: runLeads ? Math.round(runSpend / runLeads) : null,
      cpb: runBooked ? Math.round(runSpend / runBooked) : null,
      channels,
      recentByChannel,
    }
  }, [data, now])
  const chart = v.recentByChannel.map((r) => ({ channel: r.source ? sources.label(r.source) : "Other", count: r.count }))

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Overview"
        description="Campaign results come from CRM: every lead is linked to the campaign and channel it came from"
        actions={
          canCreate && (
            <Button leftIcon="add-line" nativeButton={false} render={<Link href="/campaigns/all/new" />}>
              New campaign
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon="megaphone-line" label="Live campaigns" value={v.live} hint={`${v.paused} paused · ${v.upcoming.length} upcoming`} />
        <StatTile icon="user-add-line" tone="sky" label="Campaign leads · 30 days" value={number(v.leads30)} hint={`${v.booked30} booked so far`} />
        <StatTile icon="wallet-3-line" tone="violet" label="Spend on running campaigns" value={formatPkr(v.runSpend)} hint={`of ${formatPkr(v.runBudget)} budget`} />
        <StatTile icon="price-tag-3-line" tone="amber" label="Cost per lead" value={v.cpl != null ? formatPkr(v.cpl) : "—"} hint={v.cpb != null ? `${formatPkr(v.cpb)} per booking` : "No bookings yet"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Running campaigns" bodyClassName="p-0" action={<ViewAll href="/campaigns/all" />}>
          {v.running.length ? (
            <ul className="divide-y">
              {v.running.map((c) => {
                const goal = c.goals.find((g) => g.metric === "leads")
                return (
                  <li key={c.code}>
                    <Link href={href(c)} className="group grid gap-3 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_6rem] sm:items-center">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium group-hover:text-primary">{c.name}</span>
                          <CampaignStatusBadge status={c.displayStatus} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[c.objective && objectives.label(c.objective), c.project?.name ?? "All projects", timing(c, now)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <span className="text-sm text-foreground tabular-nums">
                          {c.results.leads}
                          {goal ? ` / ${goal.target}` : ""}
                        </span>{" "}
                        leads
                        {goal && <Meter className="mt-1" value={c.results.leads} max={goal.target} tone={c.results.leads >= goal.target ? "green" : "primary"} />}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <span className="text-sm text-foreground tabular-nums">{formatPkr(c.results.spend)}</span> spent
                        <Meter className="mt-1" value={c.results.spend} max={c.results.budget} />
                      </span>
                      <span className="text-right text-xs text-muted-foreground">
                        <span className="block text-sm text-foreground tabular-nums">{c.results.cpl != null ? formatPkr(c.results.cpl) : "—"}</span>
                        per lead
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No campaigns running.</p>
          )}
        </SectionCard>

        <SectionCard title="Leads by channel · 30 days">
          {chart.length ? (
            <BarChart
              data={chart}
              xKey="channel"
              horizontal
              categoryWidth={110}
              showLegend={false}
              valueFormatter={number}
              series={[{ key: "count", label: "Leads", color: vizColor("blue") }]}
              style={{ height: Math.max(180, chart.length * 34 + 50) }}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No campaign leads in 30 days.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Cost per lead by channel" bodyClassName="p-0">
          {v.channels.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Channel</th>
                    <th className="px-4 py-2 text-right font-medium">Spend</th>
                    <th className="px-4 py-2 text-right font-medium">Leads</th>
                    <th className="px-4 py-2 text-right font-medium">Cost / lead</th>
                    <th className="px-4 py-2 text-right font-medium">Bookings</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {v.channels.map((r) => (
                    <tr key={r.channel}>
                      <td className="px-4 py-2">
                        <ChannelName channel={r.channel} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatPkr(r.spend)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.leads}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{r.cpl != null ? formatPkr(r.cpl) : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.bookings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No spend or leads recorded yet.</p>
          )}
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">All campaigns to date. Expo spend includes stall, branding and staff.</p>
        </SectionCard>

        <SectionCard title="Upcoming" bodyClassName="p-0">
          {v.upcoming.length ? (
            <ul className="divide-y">
              {v.upcoming.map((c) => (
                <li key={c.code}>
                  <Link href={href(c)} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <Icon name={objectives.map[c.objective]?.icon ?? "megaphone-line"} className="mt-0.5 text-base text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {dateRange(c)} · {formatPkr(c.results.budget)}
                      </span>
                    </span>
                    <CampaignStatusBadge status={c.displayStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing planned.</p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
