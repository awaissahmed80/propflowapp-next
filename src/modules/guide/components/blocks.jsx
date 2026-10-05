"use client"
/* eslint-disable @next/next/no-img-element -- pre-sized webp screenshots with light and dark versions */

import { Fragment, useState } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Icon } from "@/components/ui/icon"
import { Lightbox } from "@/components/ui/lightbox"
import SCREENS from "@/modules/web/screens.json"

// The User Guide's rich blocks (guide/blocks.js): screenshots with numbered markers, flow
// diagrams, tables and callouts.

export function Block({ block }) {
  if (block.type === "screen") return <GuideScreen {...block} />
  if (block.type === "flow") return <Flow {...block} />
  if (block.type === "table") return <GuideTable {...block} />
  if (block.type === "callout") return <Callout {...block} />
  return null
}

// A screenshot (light or dark, as the theme) with a numbered marker on each area and a key below.
// Click it to see it full size.
export function GuideScreen({ id, caption, callouts = {} }) {
  const [open, setOpen] = useState(false)
  const s = SCREENS[id]
  if (!s) return null
  const marks = s.callouts.filter((c) => !c.missing && callouts[c.id])
  return (
    <figure className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${caption}: see full size`}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border bg-muted text-left shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {[
          [s.src, "dark:hidden"],
          [s.srcDark ?? s.src, "hidden dark:block"],
        ].map(([src, cls]) => (
          <img key={cls} src={src} width={s.width / 2} height={s.height / 2} alt={caption} loading="lazy" decoding="async" className={cn("h-auto w-full", cls)} />
        ))}
        {marks.map((c, i) => (
          <span key={c.id} aria-hidden className="pointer-events-none absolute rounded-md ring-2 ring-primary/80 ring-offset-0" style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%` }}>
            <span className="absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow ring-2 ring-background">{i + 1}</span>
          </span>
        ))}
        <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs opacity-0 shadow transition-opacity group-hover:opacity-100">
          <Icon name="zoom-in-line" /> Full size
        </span>
      </button>
      <figcaption className="space-y-2">
        <p className="text-sm font-medium">{caption}</p>
        {marks.length > 0 && (
          <ol className="grid gap-x-6 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            {marks.map((c, i) => (
              <li key={c.id} className="flex gap-2">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                <span>{callouts[c.id]}</span>
              </li>
            ))}
          </ol>
        )}
      </figcaption>
      {open && <Lightbox images={[{ url: s.src, title: caption }]} onClose={() => setOpen(false)} />}
    </figure>
  )
}

const TONES = {
  default: "border-border bg-background",
  amber: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10",
  green: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  red: "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10",
}
const DOT = { default: "bg-primary text-primary-foreground", amber: "bg-amber-500 text-white", green: "bg-emerald-600 text-white", red: "bg-red-600 text-white" }

function Step({ step, n }) {
  const tone = step.tone ?? "default"
  return (
    <div className={cn("flex min-w-0 flex-1 items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-xs", TONES[tone])}>
      <span className={cn("mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", DOT[tone])}>{step.icon ? <Icon name={step.icon} /> : n}</span>
      <span className="min-w-0">
        <span className="block text-sm leading-tight font-medium">{step.label}</span>
        {step.text && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{step.text}</span>}
      </span>
    </div>
  )
}

// Steps left to right (top to bottom on phones), with an arrow between; a branch hangs under the
// step it leaves from (e.g. Lost under Negotiation)
export function Flow({ title, steps, branches = [] }) {
  return (
    <figure className="rounded-xl border bg-muted/30 p-4">
      <figcaption className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Icon name="flow-chart" className="text-primary" /> {title}
      </figcaption>
      <div className="flex flex-col items-stretch gap-1.5 md:flex-row md:items-start">
        {steps.map((step, i) => {
          const branch = branches.find((x) => x.from === i)
          return (
            <Fragment key={step.label}>
              {i > 0 && (
                <span aria-hidden className="flex shrink-0 items-center justify-center text-muted-foreground md:mt-3.5">
                  <Icon name="arrow-right-line" className="hidden md:block" />
                  <Icon name="arrow-down-line" className="md:hidden" />
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Step step={step} n={i + 1} />
                {branch && (
                  <>
                    <span aria-hidden className="flex justify-center text-muted-foreground">
                      <Icon name="corner-down-right-line" />
                    </span>
                    <Step step={{ ...branch, tone: branch.tone ?? "red", icon: branch.icon ?? "close-circle-line" }} />
                  </>
                )}
              </div>
            </Fragment>
          )
        })}
      </div>
    </figure>
  )
}

const cell = (v) => (v && typeof v === "object" && "badge" in v ? <Badge color={v.color}>{v.badge}</Badge> : v)

export function GuideTable({ title, columns, rows }) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-background shadow-xs">
      {title && <figcaption className="border-b bg-muted/40 px-4 py-2.5 text-sm font-medium">{title}</figcaption>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {columns.map((c) => (
                <th key={c} scope="col" className="px-4 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className={cn("px-4 py-2 align-top", j === 0 ? "whitespace-nowrap" : "text-muted-foreground")}>
                    {cell(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

const CALLOUTS = {
  tip: { icon: "lightbulb-flash-line", label: "Tip", cls: "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100", ic: "text-emerald-600 dark:text-emerald-400" },
  note: { icon: "information-line", label: "Note", cls: "border-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-500/10 dark:text-sky-100", ic: "text-sky-600 dark:text-sky-400" },
  warning: { icon: "error-warning-line", label: "Important", cls: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100", ic: "text-amber-600 dark:text-amber-400" },
}

export function Callout({ tone = "note", title, text }) {
  const t = CALLOUTS[tone] ?? CALLOUTS.note
  return (
    <aside className={cn("flex gap-3 rounded-r-lg border-l-4 px-4 py-3 text-sm", t.cls)}>
      <Icon name={t.icon} className={cn("mt-0.5 shrink-0 text-lg", t.ic)} />
      <div>
        <p className="font-semibold">{title ?? t.label}</p>
        <p className="mt-0.5 opacity-90">{text}</p>
      </div>
    </aside>
  )
}
