"use client"

import { useEffect, useState, useTransition } from "react"
import { Icon } from "@/components/ui/icon"
import { exitImpersonation } from "@/server/auth/impersonation"

// Shown on every portal page while console staff are signed in as a member: whose workspace,
// as whom, and how long is left. Exit (or the time running out) returns to the console.
//   impersonation: { staffName, expiresAt } · user · tenant
export function ImpersonationBar({ impersonation, user, tenant }) {
  const [now, setNow] = useState(() => Date.now())
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const left = Math.max(0, Math.ceil((new Date(impersonation.expiresAt).getTime() - now) / 60_000))
  const exit = () => startTransition(() => exitImpersonation())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  // Time's up: leave on our own
  useEffect(() => {
    if (left > 0) return
    exitImpersonation()
  }, [left])
  return (
    // Top center, over the header's empty middle; the strip itself lets clicks through.
    // Collapsed to an icon and the minutes left; hovering, focusing or tapping it shows the
    // full bar with Exit.
    <div data-print="hide" role="status" className="pointer-events-none fixed inset-x-0 top-1.5 z-[70] flex justify-center px-3">
      <div
        data-open={open || undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
        className="group pointer-events-auto flex max-w-[min(42rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full bg-amber-500 px-1.5 py-1 text-sm text-amber-950 shadow-lg ring-1 ring-amber-600/40 transition-all"
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Signed in as ${user.name} by ${impersonation.staffName}, ${left} minutes left. Show details`}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-1.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-amber-950"
        >
          <Icon name="spy-line" className="text-base" />
          <span className="tabular-nums">{left}m</span>
        </button>
        <span className="hidden min-w-0 truncate group-data-open:inline">
          <b>{impersonation.staffName}</b> signed in as <b>{user.name}</b> in {tenant.name}
        </span>
        <button
          type="button"
          onClick={exit}
          disabled={pending}
          className="hidden shrink-0 cursor-pointer rounded-full bg-amber-950 px-3 py-0.5 text-xs font-semibold text-amber-50 outline-none group-data-open:inline-flex hover:bg-amber-900 focus-visible:ring-2 focus-visible:ring-amber-950 disabled:opacity-60"
        >
          {pending ? "Exiting…" : "Exit"}
        </button>
      </div>
    </div>
  )
}
