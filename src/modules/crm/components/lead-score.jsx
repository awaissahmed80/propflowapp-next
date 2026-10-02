"use client"

import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { Icon } from "@/components/ui/icon"
import { Tooltip } from "@/components/ui/tooltip"

// Lead score (worked out on the server, see crm/server/scoring.js): the card at the top of the
// lead's Details tab, and the small badge in the leads list. The grade always shows as a letter
// and word next to its colour.

const GRADE_TONE = {
  A: { text: "text-emerald-700 dark:text-emerald-400", ring: "stroke-emerald-500", soft: "bg-emerald-500/12" },
  B: { text: "text-sky-700 dark:text-sky-400", ring: "stroke-sky-500", soft: "bg-sky-500/12" },
  C: { text: "text-amber-700 dark:text-amber-400", ring: "stroke-amber-500", soft: "bg-amber-500/12" },
  D: { text: "text-rose-700 dark:text-rose-400", ring: "stroke-rose-500", soft: "bg-rose-500/12" },
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Leads list: "72 B"
export function ScoreBadge({ score, className }) {
  if (!score) return <span className="text-muted-foreground">—</span>
  const tone = GRADE_TONE[score.grade]
  return (
    <Tooltip content={`Lead score ${score.value} · ${score.label}`}>
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold tabular-nums", tone.soft, tone.text, className)}>
        {score.value}
        <span className="text-[11px] opacity-80">{score.grade}</span>
      </span>
    </Tooltip>
  )
}

function Ring({ value, grade }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-foreground/10" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          className={cn(GRADE_TONE[grade].ring, "transition-[stroke-dasharray] duration-500")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function Factor({ icon, name, weight, value, children }) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="shrink-0 text-lg text-muted-foreground" />
        <p className="font-medium">{name}</p>
        <span className="text-[12px] text-muted-foreground tabular-nums">{weight}%</span>
        <span className="ml-auto font-semibold tabular-nums">{value ?? "—"}</span>
      </div>
      <div className="mt-2 ml-7.5 h-1.5 overflow-hidden rounded-full bg-foreground/8" role="presentation">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${value ?? 0}%` }} />
      </div>
      <p className="mt-1.5 ml-7.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

// One line about the lead, from its strongest and weakest parts
function summary(s, closed) {
  if (closed === "booked") return "Booked. The score is how the lead looked when it closed."
  if (closed === "lost") return "Lost. The score is how the lead looked when it closed."
  const parts = [
    ["engagement", s.engagement.value, "engaged", "hasn't engaged much lately"],
    ["affordability", s.affordability.value, "can afford a matching unit", s.affordability.value == null ? "budget isn't known" : "budget is below the matching units"],
    ["intent", s.intent.value, "is well along the pipeline", "is early in the pipeline"],
  ]
  const good = parts.filter(([, v]) => v != null && v >= 60).map(([, , g]) => g)
  const weak = parts.filter(([, v]) => v == null || v < 40).map(([, , , w]) => w)
  const text = [good.length ? `${good.join(" and ")}` : null, weak.length ? `${good.length ? "but " : ""}${weak.join(" and ")}` : null].filter(Boolean).join(", ")
  return text ? text[0].toUpperCase() + text.slice(1) + "." : "About average on every count."
}

export function LeadScoreCard({ score: s, status }) {
  const e = s.engagement
  const a = s.affordability
  const i = s.intent
  const closed = status === "booked" || status === "lost" ? status : null
  const tone = GRADE_TONE[s.grade]
  return (
    <section aria-label="Lead score" className="rounded-xl border bg-background p-5">
      <div className="flex items-center gap-4">
        <Ring value={s.value} grade={s.grade} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Lead score</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold", tone.soft, tone.text)}>
              {s.grade} · {s.label}
            </span>
          </div>
          <p className="mt-1 text-[14px] text-muted-foreground">{summary(s, closed)}</p>
        </div>
      </div>

      <div className="mt-5 divide-y border-t pt-4">
        <Factor icon="pulse-line" name="Engagement" weight={s.weights.engagement} value={e.value}>
          {e.attempts || e.missed
            ? [
                `${plural(e.contacts, "contact")} in ${e.days} days`,
                e.attempts > e.contacts && `reached ${e.contacts} of ${e.attempts} tries`,
                e.positive > 0 && `${e.positive} positive`,
                e.negative > 0 && `${e.negative} not interested`,
                e.missed > 0 && `${plural(e.missed, "missed follow-up")}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : `No contact in the last ${e.days} days.`}
        </Factor>
        <Factor icon="wallet-3-line" name="Affordability" weight={s.weights.affordability} value={a.value}>
          {!a.budget
            ? "Budget not known: ask for it to score this properly."
            : !a.reference
              ? `Budget ${formatPkr(a.budget)}, but no available units to compare with.`
              : `Budget ${formatPkr(a.budget)} against ${formatPkr(a.reference.price)}, the cheapest available unit (${a.reference.basis})${a.cash ? " · paying cash" : ""}.`}
        </Factor>
        <Factor icon="focus-3-line" name="Intent" weight={s.weights.intent} value={i.value}>
          {i.missing.length ? `${i.known} of ${i.of} preferences known. Missing: ${i.missing.join(", ")}.` : "Pipeline stage, with everything they want known."}
        </Factor>
      </div>
    </section>
  )
}
