/* eslint-disable @next/next/no-img-element -- pre-sized webp screenshots with light and dark versions */
import { cn } from "@/lib/utils"
import SCREENS from "../screens.json"

// Portal screenshots (captured by scripts/capture-screens.mjs) with highlighted areas and
// zoomed-in "lenses". Callout boxes are percentages of the screenshot. Every screen exists in a
// light and a dark capture; CSS shows the one matching the site theme.

const ASPECT = 1440 / 900

function box(screen, id) {
  return SCREENS[screen]?.callouts.find((c) => c.id === id && !c.missing) ?? null
}

// Crop of a screenshot, magnified, keeping the area's proportions
export function Lens({ screen, callout, n, label, className, style }) {
  const c = box(screen, callout)
  if (!c) return null
  const { src, srcDark } = SCREENS[screen]
  const pos = (v, size) => (size >= 100 ? 0 : (v / (100 - size)) * 100)
  const crop = (url) => ({
    aspectRatio: `${(c.w * ASPECT) / c.h}`,
    backgroundImage: `url(${url})`,
    backgroundSize: `${10000 / c.w}% ${10000 / c.h}%`,
    backgroundPosition: `${pos(c.x, c.w)}% ${pos(c.y, c.h)}%`,
  })
  return (
    <figure className={cn("pointer-events-none rounded-2xl bg-card p-1.5 shadow-2xl ring-1 shadow-slate-900/20 ring-slate-900/10 dark:shadow-black/60 dark:ring-white/15", className)} style={style}>
      <div className="overflow-hidden rounded-xl ring-1 ring-slate-900/5 dark:ring-white/10">
        <div role="img" aria-label={label} className="dark:hidden" style={crop(src)} />
        <div role="img" aria-label={label} className="hidden dark:block" style={crop(srcDark ?? src)} />
      </div>
      {label && (
        <figcaption className="flex items-start gap-2 px-2 pt-2 pb-1 text-sm leading-snug text-card-foreground">
          {n != null && <Badge n={n} />}
          <span>{label}</span>
        </figcaption>
      )}
    </figure>
  )
}

function Badge({ n, className }) {
  return <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground", className)}>{n}</span>
}

// A screen in a browser frame. lenses: [{ callout, label, screen?, at: { left|right, top|bottom }, width }]
// Lenses float over the frame from md up; on phones they stack below it.
export function Screen({ id, url, alt = "", lenses = [], priority = false, className }) {
  const s = SCREENS[id]
  if (!s) return null
  return (
    <div className={cn("relative", className)}>
      <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 shadow-slate-900/15 ring-slate-900/10 dark:bg-zinc-900 dark:shadow-black/50 dark:ring-white/10">
        <div className="flex h-8 items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 dark:border-white/10 dark:bg-zinc-800">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="mx-auto hidden truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200 sm:block dark:bg-zinc-900 dark:text-zinc-400 dark:ring-white/10">
            {url ?? "portal.propflowapp.com"}
          </span>
        </div>
        <div className="relative">
          {[
            [s.src, "dark:hidden"],
            [s.srcDark ?? s.src, "hidden dark:block"],
          ].map(([src, cls]) => (
            <img key={cls} src={src} width={s.width / 2} height={s.height / 2} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className={cn("h-auto w-full", cls)} />
          ))}
          {lenses.map((l, i) => {
            if (l.screen && l.screen !== id) return null
            const c = box(id, l.callout)
            if (!c) return null
            return (
              <span
                key={l.callout}
                aria-hidden
                className="absolute rounded-lg ring-2 ring-primary motion-safe:animate-[pulse-ring_2.4s_ease-in-out_infinite]"
                style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%` }}
              >
                <Badge n={i + 1} className="absolute -top-2.5 -left-2.5 shadow" />
              </span>
            )
          })}
        </div>
      </div>
      {lenses.length > 0 && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 md:contents">
          {lenses.map((l, i) => (
            <Lens
              key={l.callout + (l.screen ?? "")}
              screen={l.screen ?? id}
              callout={l.callout}
              n={i + 1}
              label={l.label}
              className="md:absolute md:top-(--top) md:right-(--right) md:bottom-(--bottom) md:left-(--left) md:z-10 md:w-(--w)"
              style={{
                "--w": l.width ?? "38%",
                ...Object.fromEntries(Object.entries(l.at ?? {}).map(([k, v]) => [`--${k}`, v])),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
