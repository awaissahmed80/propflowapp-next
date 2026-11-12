"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Crop } from "./crop"

// "How it works": one plot's journey, driven by a slider. Each stage shows the real screen where
// it happens, and the block of plots below fills in as the reader drags (available → on hold →
// booked → possession). Arrow keys work too; without script the first stage shows.

const STAGES = [
  {
    name: "Enquiry",
    clause: ["A buyer asks", "about plot 214"],
    text: "The enquiry lands in the CRM from your ad, website or a walk-in, gets an agent, and the first call is planned.",
    screen: "crm-board",
    callout: "card",
    alt: "A lead card in PropFlow's CRM with the plot size, project, budget, source and next call",
    plot: "free",
  },
  {
    name: "Token",
    clause: ["A token holds", "it for them"],
    text: "The agent puts plot 214 on hold with an expiry time. Nobody else can sell it, and if the hold lapses it's free again.",
    screen: "inventory",
    callout: "status",
    alt: "Units in PropFlow's inventory by status: available, on hold, booked and sold",
    plot: "hold",
  },
  {
    name: "Booking",
    clause: ["The booking", "gets its plan"],
    text: "Token, KYC and allotment, with the payment plan worked out from your price list: down payment, installments, possession.",
    screen: "booking",
    callout: "progress",
    alt: "A booking in PropFlow showing its stage, what's been received and what's still due",
    plot: "booked",
  },
  {
    name: "Installments",
    clause: ["Installments", "arrive on time"],
    text: "Receipts go to the oldest installment first, cheques wait in clearing, and the books post themselves.",
    screen: "booking",
    callout: "receipts",
    alt: "Receipts on a PropFlow booking, each by cash, transfer or cheque",
    plot: "booked",
  },
  {
    name: "Possession",
    clause: ["NDC, transfer,", "possession"],
    text: "Dues checked, NDC issued, the checklist ticked, and the possession letter printed at the end.",
    screen: "estate-request",
    callout: "checklist",
    alt: "A PropFlow estate request with its checklist for a transfer",
    plot: "sold",
  },
]

// The block's other plots, as the society sells through (one string per stage: f free, h hold, b booked, s sold)
const BLOCK = ["fbsfffffbfss", "fbsfhfffbfss", "sbsfhfbfbbss", "sbsbsfbbbbss", "sssbsbbsbsss"]
const STATE = { f: "free", h: "hold", b: "booked", s: "sold" }
const NUMBERS = [208, 209, 210, 211, 212, 213, 215, 216, 217, 218, 219, 220]

export function FlowSlider() {
  const [stage, setStage] = useState(0)
  const s = STAGES[stage]
  const fill = `${(stage / (STAGES.length - 1)) * 100}%`
  const plots = BLOCK[stage].split("").map((c, i) => ({ n: NUMBERS[i], s: STATE[c] }))
  plots.splice(6, 0, { n: 214, s: s.plot, ours: true })

  return (
    <div className="pf-card overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col p-7 sm:p-10">
          <p className="pf-eyebrow">
            Step {stage + 1} of {STAGES.length} · {s.name}
          </p>
          <h3 key={stage} className="pf-swap mt-3 text-[clamp(1.6rem,1.2rem+1.3vw,2.25rem)] leading-tight font-bold">
            {s.clause.join(" ")}
          </h3>
          <p key={`t${stage}`} className="pf-swap mt-4 text-lg text-[var(--text-2)]">
            {s.text}
          </p>
          <figure className="mt-auto pt-10" aria-label="Block C, street 4: plot 214 and its neighbours">
            <div className="pf-plots h-10">
              {plots.map((p) => (
                <span key={p.n} data-s={p.s === "free" ? undefined : p.s} className={cn(p.ours && "ring-2 ring-[var(--brand)] ring-offset-2")} title={`Plot ${p.n}`} />
              ))}
            </div>
            <figcaption className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px] text-[var(--text-2)]">
              <span>Block C, street 4 · plot 214 outlined</span>
              <span className="flex gap-3">
                <Key s="hold" label="On hold" />
                <Key s="booked" label="Booked" />
                <Key s="sold" label="Sold" />
              </span>
            </figcaption>
          </figure>
        </div>
        <div className="flex items-center justify-center bg-[var(--surface)] p-5 sm:p-10">
          <div className="grid w-full max-w-[540px]">
            {STAGES.map((x, i) => (
              <div key={i} aria-hidden={i !== stage} className={cn("[grid-area:1/1] self-center transition-all duration-500", i === stage ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0")}>
                <div className="pf-frame">
                  <Crop screen={x.screen} callout={x.callout} alt={i === stage ? x.alt : ""} pad={1} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--line)] px-7 pt-5 pb-6 sm:px-10">
        <label htmlFor="flow-stage" className="sr-only">
          Stage of the sale
        </label>
        <input
          id="flow-stage"
          type="range"
          min={0}
          max={STAGES.length - 1}
          step={1}
          value={stage}
          onChange={(e) => setStage(Number(e.target.value))}
          aria-valuetext={`${stage + 1} of ${STAGES.length}: ${s.name}`}
          className="pf-range"
          style={{ "--fill": fill }}
        />
        <ol className="mt-1 grid grid-cols-3 gap-y-1 text-[15px] sm:grid-cols-5">
          {STAGES.map((x, i) => (
            <li key={x.name} className="sm:text-center sm:first:text-left sm:last:text-right">
              <button type="button" onClick={() => setStage(i)} className={cn("py-1 font-medium transition-colors", i === stage ? "text-[var(--brand)]" : "text-[var(--text-2)] hover:text-[var(--ink)]")}>
                {x.name}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Key({ s, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="pf-plots h-3 w-3">
        <span data-s={s} />
      </span>
      {label}
    </span>
  )
}
