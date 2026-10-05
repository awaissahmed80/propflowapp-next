"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toastAction } from "@/lib/toast-action"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/components/ui/icon"
import { filterQuery } from "../filters"
import { resetLayout, saveLayout } from "../server/layout-actions"
import { CardBody } from "./card-views"
import { DashboardFilters } from "./dashboard-filters"

// One dashboard: filters (in the URL), the person's cards in their order, "Edit dashboard" to
// hide, show and drag cards (or move them with the arrow buttons), and TV mode (?tv=1).
//   data: loadDashboard() (server/dashboard.js)

// Grid: tiles one column (two side by side on phones), cards two, wide cards four
// → narrow 1 card a row, medium 2, wide 3 (a wide card takes two of them). Sized by the space the
// page has (container queries), not the window, so the sidebar doesn't squeeze them
const SPAN = { tile: "col-span-1", card: "col-span-2", wide: "col-span-2 @3xl:col-span-4" }
const REFRESH_MS = 5 * 60_000
const ROTATE_MS = 60_000

export function DashboardView({ data }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const { dashboard, filters } = data
  const tv = filters.tv

  const saved = useMemo(() => ({ order: data.cards.map((c) => c.key), hidden: data.cards.filter((c) => c.hidden).map((c) => c.key) }), [data.cards])
  const [editing, setEditing] = useState(false)
  const [order, setOrder] = useState(saved.order)
  const [hidden, setHidden] = useState(saved.hidden)
  const [announce, setAnnounce] = useState("")
  // Fresh data from the server resets what's shown (unless mid-edit)
  const [seen, setSeen] = useState(saved)
  if (seen !== saved && !editing) {
    setSeen(saved)
    setOrder(saved.order)
    setHidden(saved.hidden)
  }

  const byKey = useMemo(() => new Map(data.cards.map((c) => [c.key, c])), [data.cards])
  const shown = order.map((k) => byKey.get(k)).filter((c) => c && !hidden.includes(c.key))
  const hiddenCards = order.map((k) => byKey.get(k)).filter((c) => c && hidden.includes(c.key))

  const go = (values) => startTransition(() => router.replace(`${pathname}${filterQuery(values)}`, { scroll: false }))

  // Hide one card straight from its menu
  const hideNow = async (key) => {
    const next = [...hidden, key]
    setHidden(next)
    const r = await saveLayout(dashboard.key, { order, hidden: next })
    if (r?.error) {
      setHidden(hidden)
      toast.error(r.error)
    } else toast.success("Card hidden. Bring it back with Edit dashboard.")
  }

  const move = (key, to) => {
    const from = order.indexOf(key)
    if (from === -1 || to < 0 || to >= order.length || from === to) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, key)
    setOrder(next)
    setAnnounce(`${byKey.get(key)?.title} moved to position ${next.filter((k) => !hidden.includes(k)).indexOf(key) + 1}`)
  }
  // Move a card past the visible card before or after it
  const step = (key, dir) => {
    const visible = order.filter((k) => !hidden.includes(k))
    const target = visible[visible.indexOf(key) + dir]
    if (target) move(key, order.indexOf(target))
  }

  const done = async () => {
    const shownAgain = hidden.length < saved.hidden.length || saved.hidden.some((k) => !hidden.includes(k))
    const r = await toastAction(() => saveLayout(dashboard.key, { order, hidden }), { loading: "Saving your layout…", success: "Layout saved." })
    if (r?.error) return
    setEditing(false)
    // Cards brought back weren't loaded; fetch them
    if (shownAgain) startTransition(() => router.refresh())
  }
  const cancel = () => {
    setOrder(saved.order)
    setHidden(saved.hidden)
    setEditing(false)
  }
  const reset = async () => {
    const r = await toastAction(() => resetLayout(dashboard.key), { loading: "Resetting…", success: "Back to the default layout." })
    if (r?.error) return
    setEditing(false)
    startTransition(() => router.refresh())
  }

  // Drag and drop (mouse); the arrow buttons do the same from the keyboard and on touch screens
  const dragged = useRef(null)
  const [over, setOver] = useState(null)
  const dragProps = (key) =>
    editing
      ? {
          draggable: true,
          onDragStart: (e) => {
            dragged.current = key
            e.dataTransfer.effectAllowed = "move"
            e.dataTransfer.setData("text/plain", key)
          },
          onDragOver: (e) => {
            if (!dragged.current || dragged.current === key) return
            e.preventDefault()
            setOver(key)
          },
          onDragLeave: () => setOver((o) => (o === key ? null : o)),
          onDrop: (e) => {
            e.preventDefault()
            if (dragged.current && dragged.current !== key) move(dragged.current, order.indexOf(key))
            dragged.current = null
            setOver(null)
          },
          onDragEnd: () => {
            dragged.current = null
            setOver(null)
          },
        }
      : {}

  const menu = (
    <DropdownMenu
      align="end"
      trigger={<IconButton icon="more-2-line" variant="outline" aria-label="Dashboard options" tooltip={false} />}
      items={[
        { label: "Edit dashboard", icon: "layout-masonry-line", onClick: () => setEditing(true) },
        { label: "TV mode", icon: "tv-2-line", onClick: () => router.push(`${pathname}${filterQuery(filters, { tv: true })}`) },
        { type: "separator" },
        { label: "Reset to default", icon: "restart-line", disabled: !data.customized, onClick: reset },
      ]}
    />
  )

  const grid = (
    <div className={cn("grid grid-cols-2 gap-4 @3xl:grid-cols-4 @6xl:grid-cols-6", tv && "gap-5")} aria-busy={pending}>
      {shown.map((card, i) => (
        <div
          key={card.key}
          className={cn(SPAN[card.size], "min-w-0", card.size === "tile" && "self-start", over === card.key && "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background")}
          {...dragProps(card.key)}
        >
          <CardShell
            card={card}
            tv={tv}
            editing={editing}
            first={i === 0}
            last={i === shown.length - 1}
            onHide={() => (editing ? setHidden((h) => [...h, card.key]) : hideNow(card.key))}
            onStep={(dir) => step(card.key, dir)}
            onEdit={() => setEditing(true)}
            onRetry={() => startTransition(() => router.refresh())}
          />
        </div>
      ))}
      {!shown.length && (
        <div className="col-span-full rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Every card on this dashboard is hidden.{" "}
          {!editing && (
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setEditing(true)}>
              Show some again
            </button>
          )}
        </div>
      )}
    </div>
  )

  if (tv)
    return (
      <TvFrame data={data}>
        <div className="@container">{grid}</div>
      </TvFrame>
    )

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={dashboard.label}
        description={dashboard.description}
        actions={
          editing ? (
            <>
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button variant="outline" leftIcon="restart-line" onClick={reset} disabled={!data.customized}>
                Reset to default
              </Button>
              <Button leftIcon="check-line" onClick={done}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" leftIcon="tv-2-line" className="max-sm:hidden" nativeButton={false} render={<Link href={`${pathname}${filterQuery(filters, { tv: true })}`} />}>
                TV mode
              </Button>
              {menu}
            </>
          )
        }
      />

      {editing ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-start gap-2 text-sm">
            <Icon name="drag-move-2-line" className="mt-0.5 text-base text-primary" />
            <span>Drag cards to put them in the order you like, or use the arrows on each card. Hide what you don&apos;t need. Only you see these changes.</span>
          </p>
          {hiddenCards.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Hidden:</span>
              {hiddenCards.map((c) => (
                <Button key={c.key} size="sm" variant="outline" leftIcon="eye-line" onClick={() => setHidden((h) => h.filter((k) => k !== c.key))}>
                  {c.title}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <DashboardFilters data={data} pending={pending} onChange={go} />
      )}

      <div className="@container">
        <div className={cn("transition-opacity", pending && "pointer-events-none opacity-60")}>{grid}</div>
      </div>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  )
}

// A card: title, period, what it shows, and a link to where the numbers come from
function CardShell({ card, tv, editing, first, last, onHide, onStep, onEdit, onRetry }) {
  const router = useRouter()
  const tile = card.size === "tile"
  const controls = editing ? (
    <div className="flex shrink-0 items-center gap-0.5">
      <Icon name="draggable" className="cursor-grab text-base text-muted-foreground max-md:hidden" aria-hidden />
      <IconButton icon="arrow-left-s-line" size="sm" aria-label={`Move ${card.title} earlier`} disabled={first} onClick={() => onStep(-1)} />
      <IconButton icon="arrow-right-s-line" size="sm" aria-label={`Move ${card.title} later`} disabled={last} onClick={() => onStep(1)} />
      <IconButton icon="eye-off-line" size="sm" aria-label={`Hide ${card.title}`} onClick={onHide} />
    </div>
  ) : tv ? null : (
    <DropdownMenu
      align="end"
      className="w-48"
      trigger={<IconButton icon="more-line" size="sm" aria-label={`${card.title} options`} tooltip={false} className="-mt-1 -mr-2" />}
      items={[
        ...(card.link ? [{ label: card.link.label, icon: "external-link-line", onClick: () => router.push(card.link.href) }] : []),
        { label: "Hide card", icon: "eye-off-line", onClick: onHide },
        { label: "Edit dashboard", icon: "layout-masonry-line", onClick: onEdit },
      ]}
    />
  )

  return (
    <section
      aria-label={card.title}
      // A size container named "card" (cn() would drop an @container class beside flex)
      style={{ containerType: "inline-size", containerName: "card" }}
      className={cn("flex h-full flex-col rounded-xl border bg-background shadow-xs", editing && "border-dashed select-none", tile ? "p-4" : "")}
    >
      {/* Small tiles get the edit controls on a row of their own, so the title stays readable */}
      {editing && tile && <div className="-mt-2 -mr-2 mb-1 flex justify-end">{controls}</div>}
      <header className={cn("flex items-start gap-2", tile ? "mb-2" : "px-4 pt-3 pb-2")}>
        <div className="min-w-0 flex-1">
          <h2 className={cn("truncate font-semibold", tile ? "text-xs font-medium text-muted-foreground" : "text-sm", tv && (tile ? "text-sm" : "text-base"))}>{card.title}</h2>
          <p className={cn("truncate text-xs text-muted-foreground", tile && "text-[11px] opacity-80")}>{card.subtitle}</p>
        </div>
        {!(editing && tile) && controls}
      </header>
      <div className={cn("min-w-0 flex-1", !tile && "px-4 pb-3")}>
        {card.error ? (
          <div className="flex min-h-20 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <Icon name="error-warning-line" className="text-xl text-amber-600 dark:text-amber-400" />
            Couldn&apos;t load this card.
            {!tv && (
              <button type="button" onClick={onRetry} className="text-xs font-medium text-primary hover:underline">
                Try again
              </button>
            )}
          </div>
        ) : card.view ? (
          <CardBody view={card.view} compares={card.compares} tv={tv} />
        ) : (
          <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">Loads when you&apos;re done editing.</div>
        )}
      </div>
      {card.link && !tv && !editing && (
        <footer className={cn(tile ? "mt-2" : "border-t px-4 py-2")}>
          <Link href={card.link.href} className="inline-flex max-w-full items-center gap-0.5 text-xs font-medium text-primary hover:underline">
            <span className="truncate">{card.link.label}</span>
            <Icon name="arrow-right-s-line" />
          </Link>
        </footer>
      )}
    </section>
  )
}

// TV / presentation mode: full screen over the app frame, bigger type, fresh numbers every five
// minutes, and (when switched on) the next dashboard every minute
function TvFrame({ data, children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { dashboard, dashboards, filters } = data
  const [now, setNow] = useState(null)
  const [full, setFull] = useState(false)

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const clock = setInterval(tick, 30_000)
    const refresh = setInterval(() => router.refresh(), REFRESH_MS)
    return () => {
      clearInterval(clock)
      clearInterval(refresh)
    }
  }, [router])

  useEffect(() => {
    if (!filters.rotate || dashboards.length < 2) return
    const i = dashboards.findIndex((d) => d.key === dashboard.key)
    const next = dashboards[(i + 1) % dashboards.length]
    const t = setTimeout(() => router.push(`${next.to}${filterQuery(filters)}`), ROTATE_MS)
    return () => clearTimeout(t)
  }, [filters, dashboards, dashboard.key, router])

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    router.push(`${pathname}${filterQuery(filters, { tv: false, rotate: false })}`)
  }
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="space-y-5 p-5 lg:p-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{data.tenant}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{dashboard.label}</h1>
            <p className="mt-0.5 text-base text-muted-foreground">
              {data.period.label}
              {data.period.prev && <span> · compared with {data.period.prev}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {now && <span className="text-2xl font-medium tabular-nums">{now.toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" })}</span>}
            {dashboards.length > 1 && (
              <Switch checked={filters.rotate} onChange={(on) => router.replace(`${pathname}${filterQuery(filters, { rotate: on })}`)} label="Rotate dashboards" description="Next one every minute" />
            )}
            <IconButton icon={full ? "fullscreen-exit-line" : "fullscreen-line"} variant="outline" aria-label={full ? "Leave full screen" : "Full screen"} onClick={toggleFull} />
            <Button variant="outline" leftIcon="close-line" onClick={exit}>
              Exit TV mode
            </Button>
          </div>
        </div>
        {children}
        <p className="text-center text-xs text-muted-foreground">Refreshes every 5 minutes.</p>
      </div>
    </div>
  )
}
