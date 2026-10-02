"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// The launcher's side column while a workspace is new: a checklist of what's left to set up
// (each opens that step of Get started), what's coming next, and a way to replay the tour.
//   steps: { profile, logo, accounts, preferences } → done? (null when they can't set up)

const SETUP_ITEMS = [
  { step: "profile", title: "Company profile", text: "Name, address and tax details for your documents", icon: "building-2-line" },
  { step: "logo", title: "Upload your logo", text: "Printed on receipts, letters and invoices", icon: "image-line" },
  { step: "accounts", title: "Add cash & bank accounts", text: "Where your collections are received", icon: "bank-line" },
  { step: "preferences", title: "Set your preferences", text: "Financial year and marla size", icon: "settings-4-line" },
]

function Row({ icon, title, text, done, href, onClick }) {
  const body = (
    <>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-base", done ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary")}>
        <Icon name={done ? "check-line" : icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      {(href || onClick) && !done && <Icon name="arrow-right-s-line" className="mt-1.5 text-muted-foreground" />}
    </>
  )
  const cls = "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left"
  const interactive = "transition outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
  if (href)
    return (
      <Link href={href} className={cn(cls, interactive)}>
        {body}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, interactive)}>
        {body}
      </button>
    )
  return <div className={cls}>{body}</div>
}

// team: { done } when they can open Users & Teams (done once someone else has joined)
export function GettingStarted({ steps, team, onStartTour }) {
  const setup = steps ? SETUP_ITEMS.map((item) => ({ ...item, done: Boolean(steps[item.step]) })) : []
  const done = setup.filter((i) => i.done).length
  const allDone = setup.length > 0 && done === setup.length

  return (
    <section aria-labelledby="getting-started-title" className="mt-6" data-tour="getting-started">
      <header className="px-3 pb-2">
        <h2 id="getting-started-title" className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="rocket-2-line" className="text-primary" />
          {setup.length && !allDone ? "Finish setting up" : "Getting started"}
        </h2>
        {setup.length > 0 && !allDone && (
          <div className="mt-2 flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${(done / setup.length) * 100}%` }} />
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {done} of {setup.length} done
            </span>
          </div>
        )}
      </header>

      <div className="space-y-0.5">
        {/* Setup steps until they're all done; after that the workspace settings take over */}
        {!allDone && setup.map((item) => <Row key={item.step} {...item} href={item.done ? undefined : `/setup?step=${item.step}`} />)}
        {allDone && <Row icon="settings-3-line" title="Workspace setup" text="Company profile, logo, accounts and preferences are all set" done={false} href="/setup" />}
        {team && (
          <Row
            icon="team-line"
            title={team.done ? "Your team" : "Invite your team"}
            text={team.done ? "Invite more people, set up teams and roles" : "Give sales, finance and site staff their own sign-in"}
            href={team.done ? "/users" : "/users/people"}
          />
        )}
        <Row icon="guide-line" title="Take the tour again" text="A one-minute look around the launcher" onClick={onStartTour} />
      </div>
    </section>
  )
}
