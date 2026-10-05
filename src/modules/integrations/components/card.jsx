"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

// The pieces every integration card is made of (Settings › Integrations, Campaigns › Integrations)

// What a card shows from the catalog (never spread `key` into JSX)
export const cardOf = ({ icon, tile, name, subtitle, info }) => ({ icon, tile, name, subtitle, info })

const TONES = {
  green: { dot: "bg-green-500", text: "text-green-600 dark:text-green-400" },
  amber: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  red: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  gray: { dot: "bg-muted-foreground/60", text: "text-muted-foreground" },
}

// One integration: logo, name, what it does, a few facts, status, and its buttons
//   rows: [[label, value]] · status: { tone: green | amber | red | gray, label } · actions: buttons
export function IntegrationCard({ icon, tile, name, subtitle, info, rows = [], status, actions }) {
  const { dot, text } = TONES[status.tone]
  return (
    <section aria-label={name} className="flex flex-col rounded-xl border bg-background p-5 shadow-xs">
      <header className="flex items-start gap-4">
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl text-white", tile)}>
          <Icon name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </span>
        {info && <InfoPopover name={name} info={info} />}
      </header>
      <dl className="mt-4 space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-1">
            <dt className="shrink-0 text-muted-foreground">{label}:</dt>
            <dd className="min-w-0 truncate">{value}</dd>
          </div>
        ))}
      </dl>
      <p className={cn("mt-4 flex items-center gap-2 text-sm font-medium", text)}>
        <span aria-hidden className={cn("size-2 rounded-full", dot)} />
        {status.label}
      </p>
      <div className="mt-auto grid auto-cols-fr grid-flow-col gap-3 pt-5">{actions}</div>
    </section>
  )
}

// The (i) button: what the integration does and what you need before connecting
export function InfoPopover({ name, info }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`About ${name}`}
            className="-mt-1 -mr-1 cursor-pointer rounded-full p-1 text-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:text-foreground"
          >
            <Icon name="information-line" />
          </button>
        }
      />
      <PopoverContent align="end" className="w-80 gap-3 text-sm">
        <PopoverHeader>
          <PopoverTitle>{name}</PopoverTitle>
          <PopoverDescription>{info.about}</PopoverDescription>
        </PopoverHeader>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">What you need</p>
          <ul className="space-y-1.5">
            {info.needs.map((n) => (
              <li key={n} className="flex gap-2">
                <Icon name="checkbox-circle-line" className="mt-0.5 shrink-0 text-primary" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export const CardButton = ({ className, ...props }) => <Button variant="outline" className={cn("w-full", className)} {...props} />
