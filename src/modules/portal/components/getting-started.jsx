"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

// One compact row on My Desk while the workspace is new: how much of setup is done and a button
// to the next step (then "Invite your team" until someone else has joined). Gone once all done.
//   steps: { profile, logo, accounts, preferences } → done? (null when they can't set up)
//   team: { done } when they can open Users & Teams

const SETUP_ITEMS = [
  { step: "profile", title: "Add your company profile" },
  { step: "logo", title: "Upload your logo" },
  { step: "accounts", title: "Add cash & bank accounts" },
  { step: "preferences", title: "Set your preferences" },
]

export function GettingStarted({ steps, team }) {
  const setup = steps ? SETUP_ITEMS.map((item) => ({ ...item, done: Boolean(steps[item.step]) })) : []
  const items = [...setup, ...(team ? [{ step: "team", title: "Invite your team", done: team.done }] : [])]
  const next = items.find((i) => !i.done)
  if (!next) return null
  const done = items.filter((i) => i.done).length
  const href = next.step === "team" ? "/users/people" : `/setup?step=${next.step}`

  return (
    <section aria-label="Finish setting up" data-tour="getting-started" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-background px-4 py-3 shadow-xs">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
        <Icon name="rocket-2-line" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          Finish setting up <span className="font-normal text-muted-foreground">· next: {next.title.toLowerCase()}</span>
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 max-w-48 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {done} of {items.length} done
          </span>
        </div>
      </div>
      <Button size="sm" rightIcon="arrow-right-line" nativeButton={false} render={<Link href={href} />}>
        Continue
      </Button>
    </section>
  )
}
