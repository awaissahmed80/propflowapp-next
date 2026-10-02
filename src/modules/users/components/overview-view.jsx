"use client"

import Link from "next/link"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { vizColor } from "@/lib/chart-colors"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Avatar } from "@/components/ui/avatar"
import { BarChart } from "@/components/ui/chart"
import { Icon } from "@/components/ui/icon"
import { teamColor } from "../constants"
import { InviteButton } from "./invite-dialog"

const number = (n) => new Intl.NumberFormat("en-PK").format(n)

function ViewAll({ href, children = "View all" }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}

// Users & Teams overview: seats, people, invitations, roles, teams and recent activity
export function OverviewView({ members, invites, teams, seats, activity, options, allowed, workspaceName }) {
  const [now] = useState(() => Date.now())
  const active = members.filter((m) => m.status === "active")
  const suspended = members.filter((m) => m.status === "suspended")
  const online = members.filter((m) => m.lastActiveAt && now - new Date(m.lastActiveAt).getTime() < 15 * 60_000)
  const expired = invites.filter((i) => i.expired).length
  const byRole = [...members.reduce((map, m) => map.set(m.role, (map.get(m.role) ?? 0) + 1), new Map()).entries()].map(([role, people]) => ({ role, people })).sort((a, b) => b.people - a.people)
  const seatPct = seats.limit ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Overview" description={`${workspaceName} · people, teams and access`} actions={allowed.invite && <InviteButton options={options} workspaceName={workspaceName} />} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border bg-background p-4 shadow-xs">
          <p className="text-xs text-muted-foreground">Seats{seats.plan ? ` · ${seats.plan} plan` : ""}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {seats.used}
            <span className="text-sm font-normal text-muted-foreground">{seats.limit ? ` of ${seats.limit}` : " · unlimited"}</span>
          </p>
          {seats.limit ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={seatPct} aria-valuemin={0} aria-valuemax={100} aria-label="Seats used">
              <div className={cn("h-full rounded-full", seatPct >= 90 ? "bg-red-500" : "bg-primary")} style={{ width: `${seatPct}%` }} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Includes pending invitations</p>
          )}
        </div>
        <StatTile icon="user-3-line" tone="green" label="Active people" value={number(active.length)} hint={`${online.length} online now`} />
        <StatTile icon="mail-send-line" tone="amber" label="Pending invitations" value={invites.length} hint={expired ? `${expired} expired` : "Awaiting acceptance"} />
        <StatTile icon="user-forbid-line" tone={suspended.length ? "red" : "primary"} label="Suspended" value={suspended.length} hint="Can't sign in" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="People by role" action={<ViewAll href="/users/roles">Roles & permissions</ViewAll>}>
          <BarChart
            data={byRole}
            xKey="role"
            horizontal
            categoryWidth={130}
            showLegend={false}
            valueFormatter={number}
            series={[{ key: "people", label: "People", color: vizColor("blue") }]}
            style={{ height: Math.max(160, byRole.length * 34 + 50) }}
          />
        </SectionCard>

        <SectionCard title="Pending invitations" action={<ViewAll href="/users/invitations" />} bodyClassName="p-0">
          {invites.length ? (
            <ul className="divide-y">
              {invites.slice(0, 5).map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.role} · sent {timeAgo(i.sentAt)}
                    </span>
                  </span>
                  {i.expired && <span className="text-xs font-medium text-red-600 dark:text-red-400">Expired</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No pending invitations.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title="Teams this month" action={<ViewAll href="/users/teams" />} bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Team</th>
                <th className="px-4 py-2 text-left font-medium">Lead</th>
                <th className="px-4 py-2 text-right font-medium">People</th>
                <th className="px-4 py-2 text-right font-medium">Bookings</th>
                <th className="px-4 py-2 text-right font-medium">Of target</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teams.map((t) => {
                const p = t.target.bookings ? Math.round((t.achieved.bookings / t.target.bookings) * 100) : 0
                return (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="size-2 rounded-full" style={{ backgroundColor: teamColor(t.color) }} />
                        {t.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{t.lead?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t.members.length}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {t.achieved.bookings} / {t.target.bookings}
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-medium tabular-nums", p >= 100 ? "text-emerald-600 dark:text-emerald-400" : p < 60 && "text-amber-700 dark:text-amber-400")}>{p}%</td>
                  </tr>
                )
              })}
              {!teams.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No teams yet.{" "}
                    {allowed.edit && (
                      <Link href="/users/teams" className="text-primary hover:underline">
                        Create a team
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Recent activity" action={<ViewAll href="/users/activity" />} bodyClassName="p-0">
          {activity.length ? (
            <ul className="divide-y">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-2.5 text-sm">
                  <Avatar name={a.actor?.name ?? "?"} source={a.actor?.avatarUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="block leading-snug">
                      <span className="font-medium">{a.actor?.name ?? "Someone"}</span> {a.summary}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing yet. Invitations, role changes and team updates show up here.</p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
