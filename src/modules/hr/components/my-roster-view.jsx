"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { addDays, dayLabel, shiftTime, weekLabel } from "../roster"
import { KindIcon, STATUS } from "./roster-parts"

// My Desk › My roster: my shifts this week and next, day by day, with attendance once marked.
//   duties: myDuties() · start: this week's Monday · today: "2026-10-04" · roster: may open the full roster

export function MyRosterView({ duties, start, today, roster = false }) {
  const weeks = [0, 7].map((offset) => Array.from({ length: 7 }, (_, i) => addDays(start, offset + i)))
  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My roster"
        description="Your shifts for this week and next. Ask your supervisor for a change."
        actions={
          roster && (
            <Button variant="outline" leftIcon="calendar-schedule-line" nativeButton={false} render={<Link href="/hrm/roster" />}>
              Full roster
            </Button>
          )
        }
      />
      {weeks.map((days, w) => (
        <section key={w} className="rounded-xl border bg-background shadow-xs">
          <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold">{w === 0 ? "This week" : "Next week"}</h2>
            <span className="text-xs text-muted-foreground">{weekLabel(days[0])}</span>
          </header>
          <ul className="divide-y">
            {days.map((key) => {
              const mine = duties.filter((d) => d.date === key)
              const isToday = key === today
              return (
                <li key={key} className={cn("flex items-start gap-3 px-4 py-2.5", isToday && "bg-primary/5")}>
                  <span className="w-20 shrink-0 pt-0.5 text-sm">
                    <span className={cn("block font-medium", isToday && "text-primary")}>{isToday ? "Today" : dayLabel(key, { weekday: "short" })}</span>
                    <span className="block text-xs text-muted-foreground">{dayLabel(key, { day: "numeric", month: "short" })}</span>
                  </span>
                  {mine.length ? (
                    <ul className="min-w-0 flex-1 space-y-2">
                      {mine.map((x) => {
                        const s = STATUS[x.status]
                        return (
                          <li key={`${x.post.code}-${x.shift.key}`} className="flex min-w-0 items-center gap-2.5 text-sm">
                            <KindIcon kind={x.post.kind} className="text-base text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {x.post.name} · {x.shift.label}
                                {x.cover && <span className="font-normal text-muted-foreground"> (cover)</span>}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">{[shiftTime(x.shift), x.post.project ?? "Head office"].join(" · ")}</span>
                            </span>
                            {s && x.status !== "on" && (
                              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs", s.className, "no-underline")}>
                                {s.icon && <Icon name={s.icon} />}
                                {s.label}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <span className="pt-0.5 text-sm text-muted-foreground">Day off</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
