"use client"

import { Fragment, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { confirm } from "@/components/alert-context"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Tabs } from "@/components/ui/tabs"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { useList } from "@/modules/lookups/context"
import { hrNavItem } from "../nav"
import { addDays, daysText, dayLabel, groupByProject, longDay, oddWeek, shiftIcon, shiftTime, weekStart } from "../roster"
import { RosterDocument } from "./roster-document"
import { CellDialog, KindIcon, MARK_OPTIONS, PatternDialog, PersonChip, PostDialog, STATUS, ShortBadge, mark } from "./roster-parts"
import { EmployeeCell } from "./people-parts"

// HR › Duty roster: the week grid (posts × shifts × days), a day's attendance, everyone's
// regular duties and the posts themselves. The last two, and every change, need hr.roster.
//   week: rosterWeek() · day: attendanceDay() · posts: listPosts() · duties: listDuties()
//   staff: rosterStaff() · projects: [{ code, name }] · brand: getWorkspaceBrand() · tab: from ?tab=

export function RosterView({ tab: initialTab, week, day, posts, duties, staff, projects, brand }) {
  const { label: title, description } = hrNavItem("/hrm/roster")
  const [tab, setTab] = useState(initialTab)
  const manage = week.canManage
  // Tabs switch at once; the URL follows so a reload (or a shared link) lands on the same tab
  const pick = (v) => {
    setTab(v)
    const q = new URLSearchParams(window.location.search)
    if (v === "week") q.delete("tab")
    else q.set("tab", v)
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`)
  }
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />
      <Tabs
        value={tab}
        onChange={pick}
        className="flex min-h-0 flex-1 flex-col"
        contentClassName="min-h-0 flex-1"
        tabs={[
          { value: "week", label: "Week", icon: "calendar-2-line", content: <WeekTab week={week} staff={staff} brand={brand} /> },
          { value: "attendance", label: "Attendance", icon: "user-follow-line", count: day.counts.unmarked || null, content: <AttendanceTab key={day.date} day={day} /> },
          ...(manage
            ? [
                { value: "duties", label: "Regular duties", icon: "repeat-line", content: <DutiesTab duties={duties} posts={posts} /> },
                { value: "posts", label: "Posts", icon: "map-pin-line", count: posts.length, content: <PostsTab posts={posts} projects={projects} /> },
              ]
            : []),
        ]}
      />
    </div>
  )
}

// Change the page's query (week, day) and load it from the server
function useQuery() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const go = (changes) => {
    const q = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) v == null ? q.delete(k) : q.set(k, v)
    startTransition(() => router.push(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }))
  }
  return { go, pending }
}

// ---------- week grid ----------

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      {["present", "late", "absent", "leave", "unmarked"].map((s) => (
        <PersonChip key={s} person={{ name: STATUS[s].label, status: s }} full />
      ))}
      <span className="inline-flex items-center gap-1">
        <Icon name="swap-line" className="text-primary" /> Cover for the day
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-red-500/15 ring-1 ring-red-500/40" /> Short
      </span>
    </div>
  )
}

function WeekTab({ week, staff, brand }) {
  const { go, pending } = useQuery()
  const [open, setOpen] = useState(null) // { post, shift, date } (codes, so it follows refreshes)
  const [printing, setPrinting] = useState(false)
  const thisWeek = weekStart(week.today)
  const t = week.totals

  const opened = useMemo(() => {
    if (!open) return null
    const post = week.rows.find((p) => p.code === open.post)
    const shift = post?.shifts.find((s) => s.key === open.shift)
    const cell = shift?.cells.find((c) => c.date === open.date)
    return cell?.applies ? { post, shift, cell } : null
  }, [open, week])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <IconButton icon="arrow-left-s-line" aria-label="Previous week" variant="outline" disabled={pending} onClick={() => go({ week: addDays(week.start, -7) })} />
          <Button variant="outline" disabled={pending || week.start === thisWeek} onClick={() => go({ week: null })}>
            This week
          </Button>
          <IconButton icon="arrow-right-s-line" aria-label="Next week" variant="outline" disabled={pending} onClick={() => go({ week: addDays(week.start, 7) })} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{week.label}</p>
          <p className="text-xs text-muted-foreground">
            Week {week.week} · {oddWeek(week.start) ? "odd" : "even"} week{week.start === thisWeek ? " · this week" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.short > 0 ? (
            <Badge color="red">
              {t.short} short on {t.shortShifts} {t.shortShifts === 1 ? "shift" : "shifts"}
            </Badge>
          ) : (
            week.rows.length > 0 && <Badge color="green">Fully covered</Badge>
          )}
          {t.covers > 0 && <Badge color="blue">{t.covers} cover</Badge>}
          {t.leave > 0 && <Badge color="sky">{t.leave} on leave</Badge>}
          {t.unmarked > 0 && <Badge color="amber">{t.unmarked} not marked</Badge>}
        </div>
        <Button variant="outline" leftIcon="printer-line" className="ml-auto" disabled={!week.rows.length} onClick={() => setPrinting(true)}>
          Print
        </Button>
      </div>
      <Legend />
      <div className={cn("min-h-0 flex-1 overflow-hidden rounded-xl border bg-background shadow-xs transition-opacity", pending && "opacity-60")}>
        {week.rows.length ? (
          <ScrollView orientation="both" className="h-full">
            <WeekGrid week={week} onOpen={week.canManage ? (post, shift, cell) => setOpen({ post: post.code, shift: shift.key, date: cell.date }) : null} />
          </ScrollView>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Icon name="calendar-schedule-line" className="text-3xl text-muted-foreground" />
            <p className="font-medium">{week.canManage ? "No duty posts yet" : "No duties to show"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {week.canManage ? "Add posts (a gate, the site office, transport) with their shifts, then give people regular duties." : "You and your team have no duties on the roster this week."}
            </p>
          </div>
        )}
      </div>
      {opened && <CellDialog {...opened} staff={staff} today={week.today} onClose={() => setOpen(null)} />}
      {printing && (
        <PrintPreviewDialog
          title={`Duty roster · ${week.label}`}
          description="Print preview (A4 landscape)"
          printUrl={`/hrm/roster/print?week=${week.start}`}
          pdfUrl={`/api/hrm/roster/pdf?week=${week.start}`}
          onClose={() => setPrinting(false)}
        >
          <RosterDocument week={week} brand={brand} />
        </PrintPreviewDialog>
      )}
    </div>
  )
}

const OFF = "bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-muted)_6px_7px)]"

function WeekGrid({ week, onOpen }) {
  return (
    <table className="w-full min-w-[68rem] border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-30 w-60 border-r border-b bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground">Post and shift</th>
          {week.days.map((d) => {
            const today = d === week.today
            return (
              <th key={d} className={cn("sticky top-0 z-20 border-b bg-muted px-2 py-1.5 text-left font-medium", today && "bg-primary/10")}>
                <span className="flex items-center gap-1.5">
                  <span className={cn("text-xs text-muted-foreground uppercase", today && "text-primary")}>{dayLabel(d, { weekday: "short" })}</span>
                  <span className={cn("flex size-6 items-center justify-center rounded-full text-sm tabular-nums", today && "bg-primary font-semibold text-primary-foreground")}>{dayLabel(d, { day: "numeric" })}</span>
                  {today && <span className="text-[11px] font-medium text-primary">Today</span>}
                </span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {groupByProject(week.rows).map((g) => (
          <Fragment key={g.name}>
            <tr>
              <td colSpan={8} className="border-b bg-muted/40 px-3 py-1.5">
                <span className="sticky left-3 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  <Icon name={g.name === "Head office" ? "building-2-line" : "community-line"} />
                  {g.name}
                </span>
              </td>
            </tr>
            {g.rows.map((post) =>
              post.shifts.map((shift, si) => (
                <tr key={`${post.code}:${shift.key}`} className="align-top">
                  <td className={cn("sticky left-0 z-10 border-r bg-background px-3 py-2", si === post.shifts.length - 1 && "border-b")}>
                    {si === 0 && (
                      <span className="mb-1 flex items-center gap-2 font-medium">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <KindIcon kind={post.kind} className="text-sm" />
                        </span>
                        <span className="truncate">{post.name}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 pl-8 text-xs text-muted-foreground">
                      <Icon name={shiftIcon(shift)} className={shiftIcon(shift) === "moon-line" ? "text-indigo-500" : "text-amber-500"} />
                      <span className="font-medium text-foreground/80">{shift.label}</span>
                      <span className="tabular-nums">{shiftTime(shift)}</span>
                      <span title={`Needs ${shift.needed}`} className="inline-flex items-center gap-0.5">
                        <Icon name="user-line" className="text-[11px]" />
                        {shift.needed}
                      </span>
                    </span>
                  </td>
                  {shift.cells.map((c) => (
                    <td key={c.date} className={cn("min-w-32 p-1", si === post.shifts.length - 1 && "border-b", c.date === week.today && "bg-primary/[0.035]", !c.applies && OFF)}>
                      {!c.applies ? <span className="block px-1.5 py-1 text-[11px] text-muted-foreground/70">Off</span> : <Cell post={post} shift={shift} cell={c} onOpen={onOpen} />}
                    </td>
                  ))}
                </tr>
              )),
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function Cell({ post, shift, cell, onOpen }) {
  const body = (
    <>
      {cell.people.map((p) => (
        <PersonChip key={p.code} person={p} />
      ))}
      {cell.short > 0 && (
        <span className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-red-500/50 px-1.5 text-xs text-red-700 dark:text-red-300">
          <Icon name="user-add-line" className="text-[12px]" /> {cell.short} short
        </span>
      )}
      {!cell.people.length && !cell.short && <span className="px-1.5 text-xs text-muted-foreground">—</span>}
    </>
  )
  const label = `${post.name}, ${shift.label}, ${longDay(cell.date)}: ${cell.people.map((p) => `${p.name} (${STATUS[p.status]?.label.toLowerCase()})`).join(", ") || "nobody"}${cell.short ? `, ${cell.short} short` : ""}`
  const cls = cn("flex min-h-12 w-full flex-col items-start gap-1 rounded-lg p-1 text-left", cell.short > 0 && "bg-red-500/[0.06] ring-1 ring-red-500/25 ring-inset")
  if (!onOpen)
    return (
      <div className={cls} aria-label={label}>
        {body}
      </div>
    )
  return (
    <button
      type="button"
      onClick={() => onOpen(post, shift, cell)}
      className={cn(cls, "cursor-pointer transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
      aria-label={label}
    >
      {body}
    </button>
  )
}

// ---------- a day's attendance ----------

function AttendanceTab({ day }) {
  const { go, pending } = useQuery()
  const router = useRouter()
  const designations = useList("designation")
  const [local, setLocal] = useState({}) // marks made here, shown before the page reloads
  const [busy, startTransition] = useTransition()
  const status = (p) => local[p.code] ?? p.status
  const c = day.counts
  const notMarked = useMemo(() => {
    const all = new Map([...day.duties.flatMap((d) => d.people), ...day.office].map((p) => [p.code, p]))
    return [...all.values()].filter((p) => ["unmarked", "on"].includes(local[p.code] ?? p.status))
  }, [day, local])

  const save = (people, value) => {
    setLocal((x) => ({ ...x, ...Object.fromEntries(people.map((p) => [p.code, value])) }))
    startTransition(async () => {
      const r = await mark(
        day.date,
        people.map((p) => ({ employee: p.code, status: value })),
      )
      if (r?.ok) router.refresh()
      else
        setLocal((x) => {
          const next = { ...x }
          for (const p of people) delete next[p.code]
          return next
        })
    })
  }
  const allPresent = async () => {
    if (
      !(await confirm({
        title: `Mark ${notMarked.length} present?`,
        description: `Everyone not marked yet on ${longDay(day.date)} is marked present. You can still change anyone after.`,
        confirmLabel: "Mark present",
        icon: "user-follow-line",
      }))
    )
      return
    save(notMarked, "present")
  }

  const row = (p) => (
    <li key={p.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
      <EmployeeCell
        employee={p}
        className="min-w-0 flex-1"
        extra={[designations.label(p.designation), p.cover && "covering", p.status === "leave" && `on ${(p.leaveType ?? "leave").toLowerCase()}`].filter(Boolean).join(" · ") || "—"}
      />
      {p.status === "leave" ? (
        <PersonChip person={{ name: "On leave", status: "leave" }} full />
      ) : day.canMark ? (
        <ToggleGroup aria-label={`Attendance for ${p.name}`} className="h-8" value={MARK_OPTIONS.some((o) => o.value === status(p)) ? status(p) : ""} onChange={(v) => save([p], v)} options={MARK_OPTIONS} />
      ) : (
        <PersonChip person={{ ...p, status: status(p), name: STATUS[status(p)]?.label ?? "" }} full />
      )}
    </li>
  )
  const section = ({ key, icon, title, sub, people, short, needed }) => {
    const open = people.filter((p) => ["unmarked", "on"].includes(status(p)))
    return (
      <section key={key} className="overflow-hidden rounded-xl border bg-background shadow-xs">
        <header className="flex items-center gap-2.5 border-b bg-muted/30 px-4 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{sub}</span>
          </span>
          {needed != null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {people.filter((p) => !["leave", "absent"].includes(status(p))).length}/{needed}
            </span>
          )}
          <ShortBadge n={short} />
          {day.canMark && open.length > 0 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(open, "present")}>
              All present
            </Button>
          )}
        </header>
        <ul className="divide-y">
          {people.map(row)}
          {!people.length && <li className="px-4 py-4 text-sm text-muted-foreground">Nobody on this shift.</li>}
        </ul>
      </section>
    )
  }

  return (
    <ScrollView className="h-full">
      <div className={cn("space-y-4 pb-2 transition-opacity", pending && "opacity-60")}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-1">
            <IconButton icon="arrow-left-s-line" aria-label="Day before" variant="outline" disabled={pending} onClick={() => go({ day: addDays(day.date, -1) })} />
            <DatePicker className="w-44" aria-label="Day" value={day.date} clearable={false} onChange={(v) => v && go({ day: v === day.today ? null : v })} />
            <IconButton icon="arrow-right-s-line" aria-label="Day after" variant="outline" disabled={pending} onClick={() => go({ day: addDays(day.date, 1) })} />
          </div>
          <Button variant="outline" disabled={pending || day.date === day.today} onClick={() => go({ day: null })}>
            Today
          </Button>
          <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
            <Badge>{c.people} expected</Badge>
            {c.present > 0 && <Badge color="green">{c.present} present</Badge>}
            {c.late > 0 && <Badge color="amber">{c.late} late</Badge>}
            {c.absent > 0 && <Badge color="red">{c.absent} absent</Badge>}
            {c.leave > 0 && <Badge color="sky">{c.leave} on leave</Badge>}
            {c.unmarked > 0 && <Badge color="gray">{c.unmarked} not marked</Badge>}
          </div>
          {day.canMark && notMarked.length > 0 && (
            <Button className="ml-auto" leftIcon="user-follow-line" disabled={busy} onClick={allPresent}>
              Mark the rest present
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {longDay(day.date)}
          {day.date > day.today ? ": attendance can be marked from the day itself." : day.canMark ? "" : "."}
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {day.duties.map((d) =>
            section({
              key: `${d.post.code}:${d.shift.key}`,
              icon: <KindIcon kind={d.post.kind} />,
              title: `${d.post.name} · ${d.shift.label}`,
              sub: [d.post.project ?? "Head office", shiftTime(d.shift)].join(" · "),
              people: d.people,
              short: d.short,
              needed: d.needed,
            }),
          )}
          {day.office.length > 0 &&
            section({ key: "office", icon: <Icon name="briefcase-4-line" />, title: "Office staff", sub: "No duties on the roster: office hours, Monday to Saturday", people: day.office, short: 0, needed: null })}
        </div>
        {!day.duties.length && !day.office.length && <p className="py-12 text-center text-sm text-muted-foreground">Nobody is expected on this day.</p>}
        <p className="text-xs text-muted-foreground">Absences are deducted in that month’s payroll (an open draft updates itself). Approved leave isn’t, and can’t be marked.</p>
      </div>
    </ScrollView>
  )
}

// ---------- regular duties ----------

function DutiesTab({ duties, posts }) {
  const designations = useList("designation")
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState(null)
  const active = posts.filter((p) => p.isActive)
  const byCode = new Map(posts.map((p) => [p.code, p]))
  const term = q.trim().toLowerCase()
  const shown = duties.filter((e) => !term || [e.name, e.code, designations.label(e.designation), ...e.duties.map((d) => byCode.get(d.post)?.name)].some((v) => v?.toLowerCase().includes(term)))
  const rostered = shown.filter((e) => e.duties.length)
  const others = shown.filter((e) => !e.duties.length)

  return (
    <ScrollView className="h-full">
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-72">
            <Input type="search" aria-label="Search people" placeholder="Name, designation or post…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
          <p className="text-sm text-muted-foreground">
            {duties.filter((e) => e.duties.length).length} on the roster · {duties.filter((e) => !e.duties.length).length} on office hours
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="w-64 px-4 py-2 text-left font-medium">Employee</th>
                <th className="px-4 py-2 text-left font-medium">Regular duties</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rostered.map((e) => (
                <tr key={e.code} className="align-top">
                  <td className="px-4 py-2.5">
                    <EmployeeCell employee={e} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ul className="space-y-1.5">
                      {e.duties.map((d, i) => {
                        const post = byCode.get(d.post)
                        const shift = post?.shifts.find((s) => s.key === d.shiftKey)
                        return (
                          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <KindIcon kind={post?.kind} className="text-muted-foreground" />
                            <span className={cn("font-medium", !post?.isActive && "text-muted-foreground line-through")}>{post?.name ?? "Removed post"}</span>
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              {shift && <Icon name={shiftIcon(shift)} className={shiftIcon(shift) === "moon-line" ? "text-indigo-500" : "text-amber-500"} />}
                              {shift?.label ?? d.shiftKey}
                              {shift && <span className="tabular-nums">· {shiftTime(shift)}</span>}
                            </span>
                            <Badge>{daysText(d.days)}</Badge>
                            {d.rotate && <Badge color="violet">Swaps day/night weekly</Badge>}
                            {d.weeks && <Badge color="blue">{d.weeks === "odd" ? "Odd weeks" : "Even weeks"}</Badge>}
                          </li>
                        )
                      })}
                    </ul>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!rostered.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {term ? "Nobody on the roster matches." : "Nobody has regular duties yet. Pick someone below."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {others.length > 0 && (
          <section className="rounded-xl border bg-background shadow-xs">
            <header className="border-b px-4 py-2.5">
              <p className="text-sm font-medium">Office hours ({others.length})</p>
              <p className="text-xs text-muted-foreground">No duties on the roster: they’re expected Monday to Saturday and marked in Attendance under Office staff.</p>
            </header>
            <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
              {others.map((e) => (
                <li key={e.code} className="flex items-center justify-between gap-2 border-b px-4 py-2 last:border-b-0">
                  <EmployeeCell employee={e} className="min-w-0 flex-1" />
                  <Button size="sm" variant="ghost" leftIcon="add-line" onClick={() => setEditing(e)}>
                    Duties
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {editing && <PatternDialog employee={editing} posts={active} onClose={() => setEditing(null)} />}
      </div>
    </ScrollView>
  )
}

// ---------- posts ----------

function PostsTab({ posts, projects }) {
  const kinds = useList("post-kind")
  const [editing, setEditing] = useState(null) // a post, or "new"
  return (
    <ScrollView className="h-full">
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Each post’s shifts and how many people they need. People get regular duties on them.</p>
          <Button className="ml-auto" leftIcon="add-line" onClick={() => setEditing("new")}>
            New post
          </Button>
        </div>
        {groupByProject(posts).map((g) => (
          <section key={g.name} className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.rows.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setEditing(p)}
                  className={cn("flex cursor-pointer flex-col rounded-xl border bg-background p-4 text-left shadow-xs transition-colors hover:border-primary/40", !p.isActive && "opacity-60")}
                >
                  <span className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <KindIcon kind={p.kind} className="text-lg" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {kinds.label(p.kind)} · <span className="font-mono">{p.code}</span>
                      </span>
                    </span>
                    {!p.isActive && <Badge color="gray">Off the roster</Badge>}
                  </span>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {p.shifts.map((s) => (
                      <li key={s.key} className="flex items-center gap-2">
                        <Icon name={shiftIcon(s)} className={shiftIcon(s) === "moon-line" ? "text-indigo-500" : "text-amber-500"} />
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground tabular-nums">{shiftTime(s)}</span>
                        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
                          {s.needed} {s.needed === 1 ? "person" : "people"} · {daysText(s.days ?? undefined)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <span className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                    {p.people ? `${p.people} ${p.people === 1 ? "person has" : "people have"} regular duties here` : "Nobody has regular duties here yet"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {!posts.length && (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="font-medium">No duty posts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">A post is a place or job that needs people on shifts: the main gate, the site office, transport.</p>
          </div>
        )}
        {editing && <PostDialog post={editing === "new" ? null : editing} projects={projects} onClose={() => setEditing(null)} />}
      </div>
    </ScrollView>
  )
}
