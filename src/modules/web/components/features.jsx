"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import SCREENS from "../screens.json"
import { Screen } from "./screen"

// All features in one section: pick a feature from the tabs to see its details and screen
export function FeatureTabs({ features }) {
  const [active, setActive] = useState(features[0].id)

  // Warm the other features' screenshots (current theme only) once the page is idle
  useEffect(() => {
    const load = () => {
      const dark = document.documentElement.classList.contains("dark")
      for (const x of features) {
        const shot = SCREENS[x.screen]
        if (shot) new Image().src = dark ? shot.srcDark : shot.src
      }
    }
    const id = window.requestIdleCallback ? requestIdleCallback(load) : setTimeout(load, 1500)
    return () => (window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id))
  }, [features])

  const move = (e, i) => {
    const next = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!next) return
    e.preventDefault()
    const to = features[(i + next + features.length) % features.length]
    setActive(to.id)
    document.getElementById(`tab-${to.id}`)?.focus()
  }

  return (
    <>
      <div role="tablist" aria-label="Features" className="-mx-4 mt-10 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:justify-center">
        {features.map((x, i) => {
          const on = x.id === active
          return (
            <button
              key={x.id}
              id={`tab-${x.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${x.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(x.id)}
              onKeyDown={(e) => move(e, i)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Icon name={x.icon} className="text-base" />
              {x.tab}
            </button>
          )
        })}
      </div>

      {/* Every feature is in the page (search engines read them all); only the picked one shows */}
      {features.map((f, i) => {
        const on = f.id === active
        return (
          <div key={f.id} id={`panel-${f.id}`} role="tabpanel" aria-labelledby={`tab-${f.id}`} hidden={!on} className={cn("mt-12", on && "motion-safe:animate-[feature-in_320ms_ease-out]")}>
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="text-sm font-semibold tracking-wide text-primary">{f.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-3xl">{f.title}</h3>
                <p className="mt-4 text-lg text-pretty text-muted-foreground">{f.text}</p>
              </div>
              <ul className="space-y-3 self-end">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-3">
                    <Icon name="check-line" className="mt-0.5 shrink-0 text-lg text-primary" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Screen id={f.screen} url={f.url} lenses={f.lenses} alt={`PropFlow screen: ${f.title}`} priority={i === 0} className="mx-auto mt-14 max-w-5xl md:mt-24 md:mb-16" />
          </div>
        )
      })}
    </>
  )
}
