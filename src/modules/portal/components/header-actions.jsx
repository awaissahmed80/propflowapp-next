"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDateTime, timeAgo } from "@/lib/format"
import { loadNotifications, markNotificationsRead, unreadNotifications } from "@/modules/portal/server/notifications"
import { IconButton, iconButtonVariants } from "@/components/ui/icon-button"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SpotlightTrigger, useSpotlightSearch } from "@/components/ui/spotlight-search"

// Messages arrive with My Desk; until then the panel says so
function EmptyPanel({ icon, label, title, text }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<IconButton icon={icon} aria-label={label} tooltip={false} />} />
      <PopoverContent align="end" sideOffset={6} className="w-[22rem] gap-0 overflow-hidden p-0">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{label}</h2>
        </header>
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-lg text-muted-foreground">
            <Icon name={icon} />
          </span>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{text}</p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// The bell: unread count (checked every minute), and the latest notifications when opened.
// Clicking one marks it read and goes where it points.
function NotificationsPanel() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let live = true
    const check = () =>
      unreadNotifications()
        .then((n) => live && setUnread(n))
        .catch(() => {})
    check()
    const timer = setInterval(check, 60_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [])

  const show = (next) => {
    setOpen(next)
    if (next)
      startTransition(async () => {
        const r = await loadNotifications()
        setItems(r.items)
        setUnread(r.unread)
      })
  }
  const openOne = (n) => {
    setOpen(false)
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1))
      markNotificationsRead([n.id])
    }
    if (n.href) router.push(n.href)
  }
  const readAll = () =>
    startTransition(async () => {
      await markNotificationsRead([])
      setUnread(0)
      setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? list)
    })

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger
        render={
          <button type="button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className={cn(iconButtonVariants(), "relative")}>
            <Icon name="notification-3-line" />
            {unread > 0 && (
              <span className="pointer-events-none absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-[24rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unread > 0 && (
            <button type="button" onClick={readAll} className="cursor-pointer text-xs font-medium text-primary hover:underline">
              Mark all read
            </button>
          )}
        </header>
        {items === null ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : items.length ? (
          <ul className="max-h-[26rem] divide-y overflow-y-auto [scrollbar-width:thin]">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => openOne(n)} className={cn("flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-muted/60", !n.read && "bg-primary/5")}>
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base text-muted-foreground">
                    <Icon name={n.icon ?? "notification-3-line"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", !n.read && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 text-[13px] text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-muted-foreground" title={formatDateTime(n.at)}>
                      {timeAgo(n.at)}
                    </span>
                  </span>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-lg text-muted-foreground">
              <Icon name="notification-3-line" />
            </span>
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-xs text-muted-foreground">Payments, handovers and updates on your bookings and leads will show here.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Spotlight search (⌘K), messages and notifications, in the portal top bar
export function HeaderActions() {
  const { openSpotlight } = useSpotlightSearch()
  return (
    <div className="flex items-center gap-1">
      {/* The ⌘K box on desktop, a search icon on phones; the tour points at whichever shows */}
      <span data-tour="spotlight" className="inline-flex items-center md:mr-1">
        <SpotlightTrigger />
        <IconButton icon="search-line" aria-label="Search" className="md:hidden" onClick={openSpotlight} />
      </span>
      <span data-tour="inbox" className="inline-flex items-center gap-1">
        <EmptyPanel icon="chat-3-line" label="Messages" title="No messages yet" text="Chats with your team will show here." />
        <NotificationsPanel />
      </span>
    </div>
  )
}
