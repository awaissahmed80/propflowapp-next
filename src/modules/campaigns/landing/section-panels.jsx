"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { ImageField } from "./field-editor"
import { BACKGROUNDS, CATEGORIES, PADDINGS, SECTIONS, SHOW_ON, STYLE_DEFAULTS, WIDTHS, fillPlaceholders, newSection } from "./library"
import { LandingView } from "./landing-view"

// The builder's section style controls, and the "Add section" library with a live preview of
// every ready-made section and layout.

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-[3px]">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={cn(
              "flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap",
              value === o.value ? "bg-background shadow-sm" : "text-foreground/60 hover:text-foreground",
            )}
          >
            {o.icon && <Icon name={o.icon} />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const SWATCH = { white: "bg-white", muted: "bg-slate-100", tint: "bg-(--accent)/15", accent: "bg-(--accent)", dark: "bg-slate-900", image: "bg-[linear-gradient(135deg,#64748b,#0f172a)]" }

export function StyleEditor({ section, accent, onChange, images }) {
  const st = { ...STYLE_DEFAULTS, ...(section.style ?? {}) }
  const set = (patch) => onChange({ ...st, ...patch })
  return (
    <div className="space-y-4" style={{ "--accent": accent }}>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Background</p>
        <div className="grid grid-cols-6 gap-1.5">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              type="button"
              title={b.label}
              aria-label={b.label}
              aria-pressed={st.background === b.value}
              onClick={() => set({ background: b.value })}
              className="group flex cursor-pointer flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg ring-1 ring-black/10 transition",
                  SWATCH[b.value],
                  st.background === b.value ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "group-hover:ring-black/25",
                )}
              >
                {b.value === "image" && <Icon name="image-line" className="text-white" />}
              </span>
              <span className="text-[10px] text-muted-foreground">{b.label}</span>
            </button>
          ))}
        </div>
      </div>
      {st.background === "image" && (
        <>
          <ImageField label="Background image" value={st.image} onChange={(image) => set({ image })} images={images} />
          <div className="space-y-1.5">
            <p className="flex items-center justify-between text-sm font-medium">
              Darken the image <span className="text-xs font-normal text-muted-foreground tabular-nums">{st.overlay}%</span>
            </p>
            <input type="range" min={0} max={85} step={5} value={st.overlay} onChange={(e) => set({ overlay: Number(e.target.value) })} className="w-full accent-[var(--primary)]" aria-label="Darken the image" />
          </div>
        </>
      )}
      <Segmented label="Spacing" value={st.padding} options={PADDINGS} onChange={(padding) => set({ padding })} />
      <Segmented
        label="Alignment"
        value={st.align}
        options={[
          { value: "left", label: "Left", icon: "align-left" },
          { value: "center", label: "Center", icon: "align-center" },
        ]}
        onChange={(align) => set({ align })}
      />
      <Segmented label="Width" value={st.width} options={WIDTHS} onChange={(width) => set({ width })} />
      <Segmented label="Show on" value={st.show} options={SHOW_ON} onChange={(show) => set({ show })} />
    </div>
  )
}

// A section drawn small (the real renderer at desktop width, scaled down)
function Thumb({ section, theme, vars }) {
  const sample = useMemo(() => fillPlaceholders(section, vars), [section, vars])
  return (
    <div className="pointer-events-none relative h-36 overflow-hidden rounded-lg border bg-white" aria-hidden>
      <div className="absolute top-0 left-0 w-[1200px] origin-top-left scale-[0.25]">
        <LandingView
          still
          page={{ theme, sections: [sample] }}
          workspace={{ name: vars.workspace || "Your company" }}
          form={
            <div className="space-y-3 p-6">
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-14 rounded bg-(--accent)" />
            </div>
          }
        />
      </div>
    </div>
  )
}

// "Add section": categories on the left, every type and layout as a live preview
export function SectionLibrary({ open, theme, vars, onAdd, onClose, hasForm }) {
  const [cat, setCat] = useState(CATEGORIES[0].key)
  const [q, setQ] = useState("")
  const term = q.trim().toLowerCase()
  const types = Object.entries(SECTIONS).filter(([, d]) => (term ? `${d.label} ${d.text}`.toLowerCase().includes(term) : d.category === cat))
  // One sample per layout, made once while the library is open
  const samples = useMemo(() => Object.fromEntries(types.flatMap(([type, d]) => d.variants.map((v) => [`${type}:${v.key}`, newSection(type, v.key)]))), [cat, term]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-[min(68rem,calc(100%-2rem))]"
      title="Add a section"
      description="Pick a ready-made section and layout. You can change the text, images and style after adding it."
    >
      <div className="-mx-4 grid h-[min(36rem,70svh)] border-t md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="space-y-0.5 overflow-y-auto border-b p-2 md:border-r md:border-b-0" aria-label="Section categories">
          <label className="mb-2 flex h-8 items-center gap-1.5 rounded-md bg-muted/60 px-2 text-sm">
            <Icon name="search-line" className="text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sections…" aria-label="Search sections" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
          </label>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => (setCat(c.key), setQ(""))}
              className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]", !term && cat === c.key ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted")}
            >
              <Icon name={c.icon} className="shrink-0 text-base" />
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </nav>
        <div className="space-y-6 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
          {types.map(([type, d]) => (
            <section key={type}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Icon name={d.icon} className="text-muted-foreground" /> {d.label}
                </h3>
                <span className="truncate text-xs text-muted-foreground">{d.text}</span>
                {d.single && hasForm && <span className="ml-auto shrink-0 text-xs text-amber-700 dark:text-amber-400">Already on the page</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.variants.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => onAdd(type, v.key)}
                    className="group cursor-pointer rounded-xl border bg-background p-2 text-left transition hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Thumb section={samples[`${type}:${v.key}`]} theme={theme} vars={vars} />
                    <span className="mt-2 flex items-center justify-between px-1 text-[13px] font-medium">
                      {v.label}
                      <span className="flex items-center gap-1 text-xs text-primary opacity-0 transition group-hover:opacity-100">
                        <Icon name="add-line" /> Add
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {!types.length && <p className="py-16 text-center text-sm text-muted-foreground">No sections match.</p>}
        </div>
      </div>
    </Dialog>
  )
}
