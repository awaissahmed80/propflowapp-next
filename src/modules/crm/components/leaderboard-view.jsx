"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { Select } from "@/components/ui/select"
import { ToggleGroup } from "@/components/ui/toggle-group"

// CRM leaderboard: agents ranked for a period by bookings (or value, visits, calls & messages),
// a podium for the top three, everyone below, and team standings. Data: leaderboard().

const PERIODS = [
  { value: "this-week", label: "This week" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
]
const METRICS = {
  booked: { label: "Bookings", short: "booked", format: (n) => String(n), tie: "value" },
  value: { label: "Value booked", short: "booked", format: formatPkr, tie: "booked" },
  visits: { label: "Site visits", short: "visits", format: (n) => String(n), tie: "booked" },
  touches: { label: "Calls & messages", short: "calls & messages", format: (n) => String(n), tie: "visits" },
}
// Gold, silver, bronze, with the place written next to the colour
const MEDALS = [
  { ring: "ring-amber-400", tint: "bg-amber-400/15 text-amber-700 dark:text-amber-300", label: "1st" },
  { ring: "ring-slate-300 dark:ring-slate-500", tint: "bg-slate-400/15 text-slate-600 dark:text-slate-300", label: "2nd" },
  { ring: "ring-orange-400/80", tint: "bg-orange-400/15 text-orange-700 dark:text-orange-300", label: "3rd" },
]

function Podium({ top, metric, me }) {
  const m = METRICS[metric]
  // 2nd, 1st, 3rd so the winner stands in the middle
  const order = [top[1], top[0], top[2]].map((a, i) => a && { a, place: [1, 0, 2][i] })
  return (
    <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
      {order.map((x, i) =>
        x ? (
          <div key={x.a.id} className={cn("flex flex-col items-center rounded-xl border bg-background px-3 text-center shadow-xs", x.place === 0 ? "pt-6 pb-5" : "pt-4 pb-4", x.a.id === me && "border-primary/40")}>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", MEDALS[x.place].tint)}>
              <Icon name="trophy-line" className="mr-0.5 align-[-2px]" />
              {MEDALS[x.place].label}
            </span>
            <span className={cn("mt-3 rounded-full ring-4", MEDALS[x.place].ring)}>
              <Avatar name={x.a.name} source={x.a.avatarUrl} size={x.place === 0 ? "xl" : "lg"} />
            </span>
            <p className="mt-3 w-full truncate font-semibold">
              {x.a.name}
              {x.a.id === me && <span className="font-normal text-muted-foreground"> (me)</span>}
            </p>
            {x.a.team && <p className="w-full truncate text-xs text-muted-foreground">{x.a.team}</p>}
            <p className={cn("mt-2 font-semibold tracking-tight tabular-nums", x.place === 0 ? "text-3xl" : "text-2xl")}>{m.format(x.a[metric])}</p>
            <p className="text-xs text-muted-foreground">{m.short}</p>
          </div>
        ) : (
          <div key={`empty-${i}`} />
        ),
      )}
    </div>
  )
}

export function LeaderboardView({ data, period, me }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [metric, setMetric] = useState("booked")
  const m = METRICS[metric]
  const ranked = [...data.board].sort((a, b) => b[metric] - a[metric] || b[m.tie] - a[m.tie] || a.name.localeCompare(b.name))
  const anyActivity = ranked.some((a) => a.booked || a.value || a.visits || a.touches || a.meetings)
  const myRank = ranked.findIndex((a) => a.id === me)
  const teamMax = Math.max(1, ...data.teams.map((t) => t[metric]))

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Leaderboard"
        description={myRank >= 0 && anyActivity ? `You're #${myRank + 1} of ${ranked.length} on ${m.label.toLowerCase()}` : "How each agent and team is doing"}
        actions={
          <>
            <Select aria-label="Rank by" triggerClassName="w-44" value={metric} onChange={setMetric} options={Object.entries(METRICS).map(([value, x]) => ({ value, label: `By ${x.label.toLowerCase()}` }))} />
            <ToggleGroup aria-label="Period" value={period} onChange={(v) => v && startTransition(() => router.replace(`${pathname}?period=${v}`, { scroll: false }))} options={PERIODS} />
          </>
        }
      />

      <div className={cn("space-y-6 transition-opacity", pending && "pointer-events-none opacity-60")} aria-busy={pending}>
        {!ranked.length ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed bg-background py-16 text-center">
            <Icon name="trophy-line" className="text-3xl text-muted-foreground" />
            <p className="mt-2 font-medium">No agents yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Invite your sales team in Users &amp; Teams to see them here.</p>
          </div>
        ) : (
          <>
            {anyActivity ? (
              <Podium top={ranked.slice(0, 3)} metric={metric} me={me} />
            ) : (
              <p className="rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted-foreground">Nothing logged in this period yet. The board fills as calls, visits and bookings come in.</p>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <SectionCard title="Everyone" bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="w-12 px-4 py-2.5 font-medium">#</th>
                        <th className="px-3 py-2.5 font-medium">Agent</th>
                        {[
                          ["booked", "Booked"],
                          ["value", "Value"],
                          ["visits", "Visits"],
                          ["meetings", "Meetings"],
                          ["touches", "Calls & msgs"],
                          ["conversion", "Booked %"],
                          ["responseText", "First response"],
                        ].map(([k, h]) => (
                          <th key={k} className={cn("px-3 py-2.5 text-right font-medium whitespace-nowrap", k === metric && "text-foreground")}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ranked.map((a, i) => (
                        <tr key={a.id} className={cn(a.id === me && "bg-primary/5")}>
                          <td className="px-4 py-2.5 font-semibold text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={a.name} source={a.avatarUrl} size="sm" />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">
                                  {a.name}
                                  {a.id === me && <span className="font-normal text-muted-foreground"> (me)</span>}
                                </span>
                                {a.team && <span className="block truncate text-xs text-muted-foreground">{a.team}</span>}
                              </span>
                            </span>
                          </td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", metric === "booked" && "font-semibold")}>{a.booked}</td>
                          <td className={cn("px-3 py-2.5 text-right whitespace-nowrap tabular-nums", metric === "value" && "font-semibold")}>{a.value ? formatPkr(a.value) : "—"}</td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", metric === "visits" && "font-semibold")}>{a.visits}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{a.meetings}</td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", metric === "touches" && "font-semibold")}>{a.touches}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{a.closed ? `${a.conversion}%` : "—"}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{a.responseText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="Teams">
                {data.teams.length ? (
                  <ul className="space-y-3">
                    {[...data.teams]
                      .sort((a, b) => b[metric] - a[metric])
                      .map((t) => (
                        <li key={t.id}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate font-medium">{t.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{m.format(t[metric])}</span>
                          </div>
                          <div className="mt-1.5 h-2 rounded-full bg-foreground/6">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(t[metric] / teamMax) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t.members} {t.members === 1 ? "agent" : "agents"}
                          </p>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Put agents in teams (Users &amp; Teams) to compare teams here.</p>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
