"use client"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// Illustrations for the sign-in slider: small workflow charts with floating callouts,
// drawn as UI (not images) so they stay sharp in any size. Everything staggers in and
// respects reduced motion.

const enter = (delay) =>
  cn(
    "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 motion-reduce:animate-none",
    delay
  )

function Card({ className, children, delay }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-sm shadow-lg ring-1 shadow-black/20 ring-white/10 backdrop-blur-md",
        enter(delay),
        className
      )}
    >
      {children}
    </div>
  )
}

// Solid card for the key facts, with a dashed leader line back to the diagram
function Callout({ icon, tone = "sky", title, text, top, delay }) {
  const tones = {
    sky: "bg-sky-100 text-sky-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    violet: "bg-violet-100 text-violet-700",
  }
  return (
    <div className={cn("absolute inset-x-0", enter(delay))} style={{ top }}>
      <span aria-hidden className="absolute top-1/2 right-full w-7 border-t border-dashed border-sky-300/60" />
      <span aria-hidden className="absolute top-1/2 -left-8 size-2 -translate-y-1/2 rounded-full bg-sky-300" />
      <div className="flex items-start gap-2.5 rounded-xl bg-white px-3 py-2.5 text-slate-900 shadow-2xl shadow-black/40 motion-safe:animate-[auth-float_5s_ease-in-out_infinite]">
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon name={icon} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm leading-tight font-semibold">{title}</span>
          <span className="mt-0.5 block text-xs leading-snug text-slate-500">{text}</span>
        </span>
      </div>
    </div>
  )
}

// Diagram on the left, callouts in a column on the right lined up with what they describe
function Annotated({ children, notes, height }) {
  return (
    <div className="mx-auto flex w-full max-w-[36rem] items-start gap-9">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="relative w-48 shrink-0 xl:w-56" style={{ height }}>
        {notes}
      </div>
    </div>
  )
}

// Vertical connector with data flowing down it
function Connector({ className, delay }) {
  return (
    <svg aria-hidden viewBox="0 0 2 28" className={cn("mx-auto h-7 w-0.5 overflow-visible", enter(delay), className)}>
      <line
        x1="1"
        y1="0"
        x2="1"
        y2="28"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 4"
        className="text-sky-400/70 motion-safe:animate-[auth-flow_0.8s_linear_infinite]"
      />
    </svg>
  )
}

function Step({ icon, title, text, tone, delay, className }) {
  const tones = {
    blue: "bg-sky-400/20 text-sky-300",
    amber: "bg-amber-400/20 text-amber-300",
    green: "bg-emerald-400/20 text-emerald-300",
    violet: "bg-violet-400/20 text-violet-300",
  }
  return (
    <Card delay={delay} className={cn("flex items-center gap-3", className)}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-xs text-white/60">{text}</span>
      </span>
    </Card>
  )
}

// 1. Sources → lead → site visit → token hold → booked
export function LeadFlow() {
  const sources = [
    { icon: "facebook-circle-line", label: "Facebook" },
    { icon: "global-line", label: "Website" },
    { icon: "walk-line", label: "Walk-in" },
  ]
  return (
    <Annotated
      height={372}
      notes={
        <>
          <Callout icon="timer-flash-line" tone="sky" title="Assigned to Bilal in 2 min" text="First call planned automatically" top={66} delay="delay-700" />
          <Callout icon="price-tag-3-line" tone="green" title="Rs 8,846 per lead" text="Phase 2 launch · Facebook ads" top={318} delay="delay-1000" />
        </>
      }
    >
      <div className="flex justify-center gap-1.5">
        {sources.map((s, i) => (
          <Card key={s.label} delay={["delay-0", "delay-100", "delay-200"][i]} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs whitespace-nowrap">
            <Icon name={s.icon} className="text-sky-300" /> {s.label}
          </Card>
        ))}
      </div>
      {/* Three sources converge into one lead */}
      <svg aria-hidden viewBox="0 0 240 32" preserveAspectRatio="none" className={cn("mx-auto h-8 w-3/4", enter("delay-300"))}>
        {[30, 120, 210].map((x) => (
          <path
            key={x}
            d={`M${x} 0 C ${x} 20, 120 12, 120 32`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            className="text-sky-400/70 motion-safe:animate-[auth-flow_0.8s_linear_infinite]"
          />
        ))}
      </svg>
      <Step icon="user-star-line" tone="blue" title="New lead · Hira Khalid" text="10 Marla plot · Skyline Enclave" delay="delay-400" />
      <Connector delay="delay-500" />
      <Step icon="map-pin-user-line" tone="violet" title="Site visit" text="Saturday 11:00 · Block D" delay="delay-600" />
      <Connector delay="delay-700" />
      <Step icon="lock-line" tone="amber" title="Token hold · Plot 214" text="Held 48 hours for the buyer" delay="delay-800" />
      <Connector delay="delay-900" />
      <Step icon="checkbox-circle-line" tone="green" title="Booked · Rs 1.33 Cr" text="On to an installment plan" delay="delay-1000" />
    </Annotated>
  )
}

// 2. Block plot map with statuses and one highlighted plot
const PLOTS = "AABHSSAAHBSSSAAABSHSSABAASSBAAHSAABSSSAB"
const PLOT_TONE = { A: "bg-emerald-400/80", H: "bg-amber-400/90", B: "bg-sky-400/80", S: "bg-white/25" }

export function InventoryMap() {
  return (
    <Annotated
      height={330}
      notes={
        <>
          <Callout icon="lock-line" tone="amber" title="Plot 214 · on hold, 23h left" text="Corner +10% · Rs 1.33 Cr · Bilal" top={70} delay="delay-900" />
          <Callout icon="shield-check-line" tone="green" title="Can't be sold twice" text="Dealers only see their own quota" top={250} delay="delay-1000" />
        </>
      }
    >
      <Card delay="delay-0" className="p-4">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="font-medium">Skyline Enclave · Block D</span>
          <span className="text-white/60">40 plots · 10 Marla</span>
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          {PLOTS.split("").map((s, i) => (
            <span
              key={i}
              className={cn(
                "aspect-[3/4] rounded-[3px]",
                PLOT_TONE[s],
                i === 13 && "relative z-10 ring-2 ring-white ring-offset-2 ring-offset-slate-900",
                enter()
              )}
              style={{ animationDelay: `${200 + i * 15}ms` }}
            />
          ))}
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-white/10" aria-hidden />
        <p className="mt-1 text-center text-[10px] tracking-widest text-white/40 uppercase">Main boulevard</p>
      </Card>
      <div className={cn("mt-3 flex flex-wrap justify-center gap-2 text-xs", enter("delay-700"))}>
        {[
          ["Available", "bg-emerald-400", "18"],
          ["On hold", "bg-amber-400", "4"],
          ["Booked", "bg-sky-400", "6"],
          ["Sold", "bg-white/40", "12"],
        ].map(([l, c, n]) => (
          <span key={l} className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-1 ring-1 ring-white/10">
            <span className={cn("size-2 rounded-full", c)} /> {l} <span className="text-white/50">{n}</span>
          </span>
        ))}
      </div>
    </Annotated>
  )
}

// 3. Campaign funnel with cost callouts
export function CampaignFunnel() {
  const steps = [
    ["Leads", 26, "100%"],
    ["Contacted", 25, "96%"],
    ["Site visit", 11, "42%"],
    ["Booked", 2, "8%"],
  ]
  return (
    <Annotated
      height={250}
      notes={
        <>
          <Callout icon="price-tag-3-line" tone="sky" title="Rs 8,846 per lead" text="Rs 1.15 Lac per booking" top={22} delay="delay-800" />
          <Callout icon="instagram-line" tone="violet" title="Instagram: Rs 4,500 a lead" text="Cheapest channel this month" top={170} delay="delay-1000" />
        </>
      }
    >
      <Card delay="delay-0" className="p-4">
        <div className="mb-4 flex items-center justify-between text-xs">
          <span className="font-medium">Phase 2 launch · lead to booking</span>
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">Live</span>
        </div>
        <ul className="space-y-2.5">
          {steps.map(([label, n, pct], i) => (
            <li key={label} className="grid grid-cols-[5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs">
              <span className="text-white/70">{label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <span
                  className={cn(
                    "block h-full origin-left rounded-full bg-sky-400",
                    "animate-in zoom-in-0 fill-mode-both duration-700 motion-reduce:animate-none",
                    ["delay-200", "delay-300", "delay-500", "delay-700"][i]
                  )}
                  style={{ width: `${(n / 26) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">
                {n} <span className="text-white/50">{i ? pct : ""}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-white/10 pt-3 text-xs">
          <div className="flex justify-between">
            <span className="text-white/70">Goal: 60 leads</span>
            <span>43%</span>
          </div>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full w-[43%] rounded-full bg-emerald-400" />
          </span>
        </div>
      </Card>
    </Annotated>
  )
}

// 4. Template → prices → publish → lead in CRM, beside a phone preview
export function LaunchFlow() {
  const steps = [
    { icon: "layout-top-line", title: "Pick a template", text: "Project launch" },
    { icon: "price-tag-3-line", title: "Prices from inventory", text: "From Rs 49 Lac" },
    { icon: "global-line", title: "Publish", text: "Your campaigns address" },
    { icon: "user-add-line", title: "Lead in CRM", text: "Assigned in minutes" },
  ]
  return (
    <Annotated
      height={300}
      notes={
        <>
          {/* Phone preview of the published page */}
          <div className={cn("absolute top-0 left-4 w-40 overflow-hidden rounded-[1.4rem] border-[5px] border-slate-800 bg-white shadow-2xl", enter("delay-400"))}>
            <div className="bg-gradient-to-br from-[#0270d2] to-[#013a6e] px-3 pt-4 pb-5 text-white">
              <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[7px] font-semibold tracking-wide uppercase">Now launching</span>
              <p className="mt-2 text-[11px] leading-tight font-bold">Skyline Enclave: new phase now open</p>
              <span className="mt-2 inline-block rounded bg-white px-1.5 py-0.5 text-[7px] font-semibold text-[#0270d2]">Get prices →</span>
            </div>
            <div className="space-y-1.5 p-2.5">
              {["5 Marla · Rs 49 Lac", "10 Marla · Rs 98 Lac", "1 Kanal · Rs 1.9 Cr"].map((r) => (
                <div key={r} className="rounded bg-slate-100 px-1.5 py-1 text-[8px] text-slate-700">
                  {r}
                </div>
              ))}
              <div className="rounded bg-[#0270d2] py-1 text-center text-[8px] font-semibold text-white">Send me details</div>
            </div>
          </div>
          <Callout icon="notification-3-line" tone="green" title="New lead from Phase 2 page" text="Hira Khalid · assigned to Sana" top={236} delay="delay-900" />
        </>
      }
    >
      {steps.map((s, i) => (
        <div key={s.title}>
          {i > 0 && <Connector delay={["", "delay-200", "delay-400", "delay-600"][i]} className="h-5" />}
          <Step
            icon={s.icon}
            tone={["blue", "amber", "violet", "green"][i]}
            title={s.title}
            text={s.text}
            delay={["delay-0", "delay-300", "delay-500", "delay-700"][i]}
          />
        </div>
      ))}
    </Annotated>
  )
}
