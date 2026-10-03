"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { siteUrl } from "@/lib/sites"
import { Icon } from "@/components/ui/icon"
import { CampaignFunnel, InventoryMap, LaunchFlow, LeadFlow } from "./visuals"

const SLIDE_DURATION = 7000

// Each slide: a workflow chart with callouts (visuals.jsx) and a headline with a highlight
const SLIDES = [
  {
    id: "crm",
    icon: "user-star-line",
    eyebrow: "CRM",
    title: "Every enquiry, from first click to",
    highlight: "booked plot.",
    text: "Leads from Facebook, your website and walk-ins land in one pipeline, get an agent in minutes, and move through site visits and token holds to a booking.",
    Visual: LeadFlow,
  },
  {
    id: "inventory",
    icon: "building-2-line",
    eyebrow: "Inventory",
    title: "One live inventory.",
    highlight: "Zero double-selling.",
    text: "Every plot, file and apartment by phase and block, with holds that expire on their own and dealers who only see their quota.",
    Visual: InventoryMap,
  },
  {
    id: "campaigns",
    icon: "megaphone-line",
    eyebrow: "Campaigns",
    title: "Know exactly what",
    highlight: "every booking cost.",
    text: "Spend, leads, site visits and bookings for every campaign and channel, so your budget goes where buyers actually come from.",
    Visual: CampaignFunnel,
  },
  {
    id: "pages",
    icon: "pages-line",
    eyebrow: "Landing pages",
    title: "Launch a project page",
    highlight: "before lunch.",
    text: "Pick a template, pull starting prices from inventory and publish. Every enquiry lands in CRM with its campaign and channel.",
    Visual: LaunchFlow,
  },
]

// Browser state read with useSyncExternalStore: the server renders with the default
// (motion allowed, page visible) and the browser takes over without a mismatch
const REDUCED = "(prefers-reduced-motion: reduce)"
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED)
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

function useDocumentHidden() {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange)
      return () => document.removeEventListener("visibilitychange", onChange)
    },
    () => document.hidden,
    () => false,
  )
}

// Site-plan motif: blocks of plots separated by roads
function PlotPattern() {
  return (
    <svg aria-hidden className="absolute inset-0 -z-20 size-full text-white/10">
      <defs>
        <pattern id="auth-plots" width="176" height="128" patternUnits="userSpaceOnUse">
          {[0, 1, 2, 3].map((col) => [0, 1].map((row) => <rect key={`${col}-${row}`} x={12 + col * 38} y={12 + row * 48} width="34" height="44" rx="2" fill="none" stroke="currentColor" />))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-plots)" />
    </svg>
  )
}

export function AuthSlider({ className }) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const tabHidden = useDocumentHidden()

  const autoplay = !reducedMotion
  const paused = hovered || tabHidden
  const slide = SLIDES[index]
  const next = () => setIndex((i) => (i + 1) % SLIDES.length)
  const Visual = slide.Visual

  return (
    <section
      aria-roledescription="carousel"
      aria-label="PropFlow highlights"
      className={cn("relative isolate overflow-hidden bg-slate-950 text-white", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <PlotPattern />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgb(2_112_210/0.35),transparent_60%)]" />

      <div className="flex h-full flex-col p-8 xl:p-12">
        <div className="flex items-center justify-between">
          <a href={siteUrl("web")} aria-label="PropFlow home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <Logo variant="light" className="h-9" />
          </a>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">Real Estate ERP</span>
        </div>

        {/* Workflow chart for the current slide; key re-mounts it so it animates in again */}
        <div aria-hidden className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-10 xl:px-16">
          <div key={slide.id} className="w-full">
            <Visual />
          </div>
        </div>

        <div className="max-w-xl">
          <div key={index} aria-live={autoplay && !paused ? "off" : "polite"} className="animate-in fade-in slide-in-from-bottom-4 duration-700 motion-reduce:animate-none">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-sky-300 ring-1 ring-sky-400/20">
              <Icon name={slide.icon} /> {slide.eyebrow}
            </p>
            <h2 className="mt-4 text-3xl leading-[1.1] font-semibold tracking-tight text-balance xl:text-[2.5rem]">
              {slide.title} <span className="bg-gradient-to-r from-sky-300 to-blue-500 bg-clip-text text-transparent">{slide.highlight}</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-pretty text-white/65">{slide.text}</p>
          </div>

          {/* Progress bars double as slide navigation */}
          <div className="mt-8 flex gap-2">
            {SLIDES.map((s, i) => (
              <button key={s.id} type="button" onClick={() => setIndex(i)} aria-label={`Show slide ${i + 1}: ${s.eyebrow}`} aria-current={i === index} className="group h-6 flex-1 cursor-pointer py-2.5 outline-none">
                <span className="block h-1 overflow-hidden rounded-full bg-white/20 transition-colors group-hover:bg-white/35 group-focus-visible:ring-2 group-focus-visible:ring-white/70">
                  {i < index && <span className="block h-full bg-white" />}
                  {i === index && (
                    <span
                      key={index}
                      className="block h-full origin-left bg-white"
                      style={
                        autoplay
                          ? {
                              animation: `auth-slide-progress ${SLIDE_DURATION}ms linear forwards`,
                              animationPlayState: paused ? "paused" : "running",
                            }
                          : undefined
                      }
                      onAnimationEnd={next}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
