"use client"

import { useState } from "react"
import { IconButton } from "@/components/ui/icon-button"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SpotlightTrigger, useSpotlightSearch } from "@/components/ui/spotlight-search"

// Messages and notifications arrive with My Desk; until then the panels say so
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
        <EmptyPanel icon="notification-3-line" label="Notifications" title="You're all caught up" text="Approvals, reminders and updates from your apps will show here." />
      </span>
    </div>
  )
}
