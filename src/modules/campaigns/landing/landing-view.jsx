"use client"

import { Fragment, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { accentHex } from "../constants"
import { SECTIONS, STYLE_DEFAULTS, THEME_DEFAULTS } from "./library"
import { fontStack, landingFontVars } from "./fonts"
import { parseMapLink } from "./maps"

// A landing page as visitors see it: always light, laid out with container queries so the
// builder's tablet and phone previews match real devices. Each section sits in a frame that
// applies its style (background, spacing, alignment, width, devices).
//   page: { theme, sections } · workspace: { name } · form: rendered enquiry form (node) or null
//   editor: { selected, onSelect(id) } in the builder (sections become clickable)

const digits = (s) => String(s ?? "").replace(/\D/g, "")
const waLink = (n) => (digits(n) ? `https://wa.me/${digits(n).replace(/^0/, "92")}` : null)
const safeLink = (u) => (/^(https?:|tel:|mailto:)/i.test(u ?? "") ? u : null)
const DARK_BG = ["accent", "dark", "image"]
const PAD = { none: "py-0", sm: "py-6 @3xl:py-8", md: "py-12 @3xl:py-16", lg: "py-16 @3xl:py-24", xl: "py-24 @3xl:py-32" }
const WIDTH = { narrow: "max-w-3xl", normal: "max-w-5xl", wide: "max-w-7xl", full: "max-w-none" }
const RADIUS = { none: "0px", md: "0.5rem", lg: "1rem", xl: "1.5rem" }

// **bold**, *italic*, [link](https://…), "- " bullets and blank-line paragraphs; everything else is text
function inline(text, key) {
  const parts = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith("**")) parts.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith("*")) parts.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>)
    else {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)\s]+)\)/)
      const ok = safeLink(href)
      parts.push(
        ok ? (
          <a key={`${key}-${i++}`} href={ok} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            {label}
          </a>
        ) : (
          label
        ),
      )
    }
    last = m.index + t.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
export function RichText({ text, className }) {
  const blocks = String(text ?? "")
    .split(/\n\s*\n/)
    .filter((b) => b.trim())
  return (
    <div className={cn("space-y-3 leading-relaxed", className)}>
      {blocks.map((b, i) => {
        const lines = b.split("\n")
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${i}-${j}`)}</li>
              ))}
            </ul>
          )
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, `${i}-${j}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function Img({ src, alt = "", className }) {
  if (!src)
    return (
      <div className={cn("flex items-center justify-center bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_22%,white),color-mix(in_oklab,var(--accent)_8%,white))] text-(--accent)/50", className)}>
        <Icon name="image-line" className="text-4xl" />
      </div>
    )
  // eslint-disable-next-line @next/next/no-img-element -- workspace images of any size, served by our file route
  return <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />
}

// A button following the page's button style; on dark sections it turns white
function Button({ s, label, action, link, ctx, onDark, secondary = false, className }) {
  if (!label) return null
  const style = ctx.theme.buttons
  const base = cn("inline-flex h-12 items-center justify-center gap-2 px-6 text-[15px] font-semibold transition hover:opacity-90", style === "pill" ? "rounded-full" : "rounded-(--lp-radius)", className)
  const look = secondary
    ? onDark
      ? "border border-white/40 text-white"
      : "border border-slate-300 text-slate-800"
    : style === "outline"
      ? onDark
        ? "border-2 border-white text-white"
        : "border-2 border-(--accent) text-(--accent)"
      : onDark
        ? "bg-white text-(--accent)"
        : "bg-(--accent) text-white"
  if (ctx.still)
    return (
      <span className={cn(base, look)}>
        {label} <Icon name={action === "whatsapp" ? "whatsapp-line" : "arrow-right-line"} />
      </span>
    )
  const href = action === "whatsapp" ? waLink(ctx.theme.whatsapp) : action === "call" ? (digits(ctx.theme.phone) ? `tel:+${digits(ctx.theme.phone).replace(/^0/, "92")}` : null) : action === "link" ? safeLink(link) : null
  const icon = action === "whatsapp" ? "whatsapp-line" : action === "call" ? "phone-line" : "arrow-right-line"
  if (href)
    return (
      <a href={href} target={action === "link" || action === "whatsapp" ? "_blank" : undefined} rel="noreferrer" className={cn(base, look)}>
        {action !== "link" && <Icon name={icon} />} {label} {action === "link" && <Icon name={icon} />}
      </a>
    )
  return (
    <button type="button" onClick={ctx.toForm} className={cn(base, look)}>
      {label} <Icon name="arrow-right-line" />
    </button>
  )
}

// A link that's plain text in still mode (thumbnails sit inside links and buttons)
function A({ ctx, href, children, ...props }) {
  if (ctx.still || !href) return <span {...props}>{children}</span>
  return (
    <a href={href} {...props}>
      {children}
    </a>
  )
}

const H2 = ({ children, className }) =>
  children ? (
    <h2 className={cn("text-2xl font-bold tracking-tight text-balance @3xl:text-4xl", className)} style={{ fontFamily: "var(--lp-heading)" }}>
      {children}
    </h2>
  ) : null
const Intro = ({ children, onDark }) => (children ? <p className={cn("mt-3 max-w-2xl text-base @3xl:text-lg", onDark ? "text-white/80" : "text-slate-600", "[.text-center_&]:mx-auto")}>{children}</p> : null)
const card = (onDark) => (onDark ? "bg-white/10 ring-1 ring-white/20" : "bg-white ring-1 ring-slate-200")

// ---------- sections ----------

function Navbar({ s, ctx }) {
  const name = s.name || ctx.workspace?.name
  const brand = (
    <span className="flex min-w-0 items-center gap-2.5 font-bold">
      {s.logo || ctx.theme.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- workspace logo
        <img src={s.logo || ctx.theme.logo} alt={name ?? ""} className="h-9 w-auto max-w-40 object-contain" />
      ) : (
        <>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--lp-radius) bg-(--accent) text-sm text-white">{(name ?? "P").slice(0, 1)}</span>
          <span className="truncate" style={{ fontFamily: "var(--lp-heading)" }}>
            {name}
          </span>
        </>
      )}
    </span>
  )
  if (s.variant === "centered") return <div className="flex h-16 items-center justify-center">{brand}</div>
  const wa = waLink(ctx.theme.whatsapp)
  return (
    <div className="flex h-16 items-center justify-between gap-3">
      {brand}
      {s.variant === "whatsapp" && wa ? (
        <A ctx={ctx} href={wa} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-(--lp-radius) bg-[#25d366] px-4 text-sm font-semibold text-white">
          <Icon name="whatsapp-line" /> <span className="hidden @md:inline">WhatsApp</span>
        </A>
      ) : (
        <Button s={s} label={s.ctaLabel} action={s.ctaAction} link={s.ctaLink} ctx={ctx} onDark={ctx.onDark} className="h-10 px-4 text-sm" />
      )}
    </div>
  )
}

function Points({ items, onDark, className }) {
  if (!items?.length) return null
  return (
    <ul className={cn("mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium [.text-center_&]:justify-center", className)}>
      {items.map((p, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <Icon name="checkbox-circle-fill" className={onDark ? "text-white" : "text-(--accent)"} />
          {p.label}
        </li>
      ))}
    </ul>
  )
}

function Hero({ s, ctx }) {
  const text = (
    <div className="min-w-0">
      {s.badge && (
        <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase", ctx.onDark ? "bg-white/15 ring-1 ring-white/30" : "bg-(--accent)/10 text-(--accent)")}>
          {s.badge}
        </span>
      )}
      <h1 className="mt-4 text-3xl leading-tight font-bold tracking-tight text-balance @3xl:text-5xl" style={{ fontFamily: "var(--lp-heading)" }}>
        {s.headline}
      </h1>
      {s.subheadline && <p className={cn("mt-4 max-w-2xl text-base @3xl:text-lg [.text-center_&]:mx-auto", ctx.onDark ? "text-white/85" : "text-slate-600")}>{s.subheadline}</p>}
      <div className="mt-7 flex flex-wrap gap-3 [.text-center_&]:justify-center">
        <Button s={s} label={s.ctaLabel} action={s.ctaAction} link={s.ctaLink} ctx={ctx} onDark={ctx.onDark} />
      </div>
      <Points items={s.points} onDark={ctx.onDark} />
    </div>
  )
  if (s.variant === "split")
    return (
      <div className="grid items-center gap-8 @3xl:grid-cols-2">
        {text}
        <Img src={s.image} className="aspect-[4/3] w-full rounded-(--lp-radius)" />
      </div>
    )
  if (s.variant === "form" && (ctx.form || ctx.editing))
    return (
      <div className="grid items-center gap-8 @3xl:grid-cols-[minmax(0,1fr)_25rem]">
        {text}
        <div id="enquire" className="scroll-mt-4 rounded-(--lp-radius) bg-white p-1 text-slate-900 shadow-xl ring-1 ring-slate-200">
          {ctx.form ?? <FormMissing />}
        </div>
      </div>
    )
  return <div className={cn(s.variant === "cover" ? "py-8 @3xl:py-16" : "")}>{text}</div>
}

function Stats({ s, ctx }) {
  const items = s.items ?? []
  return (
    <>
      <H2 className="mb-8">{s.title}</H2>
      <dl className={cn("grid grid-cols-2 gap-4 @3xl:grid-cols-4", items.length === 3 && "@3xl:grid-cols-3")}>
        {items.map((it, i) => (
          <div key={i} className={cn(s.variant === "cards" && cn("rounded-(--lp-radius) p-5", card(ctx.onDark)))}>
            <dd className={cn("text-3xl font-bold @3xl:text-4xl", !ctx.onDark && "text-(--accent)")} style={{ fontFamily: "var(--lp-heading)" }}>
              {it.value}
            </dd>
            <dt className="mt-1 text-sm opacity-75">{it.label}</dt>
          </div>
        ))}
      </dl>
    </>
  )
}

function Features({ s, ctx }) {
  const items = s.items ?? []
  const list = (
    <ul className={cn("grid gap-4", s.variant === "cards" && "@xl:grid-cols-2 @4xl:grid-cols-3", s.variant !== "cards" && "text-left")}>
      {items.map((it, i) => (
        <li key={i} className={cn("flex gap-4 rounded-(--lp-radius) p-5", s.variant === "cards" ? card(ctx.onDark) : "p-0", "[.text-center_&]:flex-col [.text-center_&]:items-center")}>
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-(--lp-radius) text-lg font-bold", ctx.onDark ? "bg-white/15" : "bg-(--accent)/10 text-(--accent)")}>
            {s.variant === "numbered" ? i + 1 : <Icon name={it.icon || "checkbox-circle-line"} />}
          </span>
          <span>
            <span className="block text-lg font-semibold">{it.title}</span>
            {it.text && <span className={cn("mt-1 block text-[15px]", ctx.onDark ? "text-white/75" : "text-slate-600")}>{it.text}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
  if (s.variant === "image")
    return (
      <div className="grid items-center gap-10 @3xl:grid-cols-2">
        <div>
          <H2>{s.title}</H2>
          <Intro onDark={ctx.onDark}>{s.intro}</Intro>
          <div className="mt-8">{list}</div>
        </div>
        <Img src={s.image} className="aspect-[4/5] w-full rounded-(--lp-radius)" />
      </div>
    )
  return (
    <>
      <H2>{s.title}</H2>
      <Intro onDark={ctx.onDark}>{s.intro}</Intro>
      <div className="mt-8">{list}</div>
    </>
  )
}

function Text({ s, ctx }) {
  const body = (
    <>
      <H2 className="mb-4">{s.title}</H2>
      <RichText text={s.body} className={cn("text-[17px]", ctx.onDark ? "text-white/85" : "text-slate-700")} />
    </>
  )
  return s.variant === "card" ? <div className={cn("rounded-(--lp-radius) p-6 @3xl:p-10", card(ctx.onDark))}>{body}</div> : body
}

function ImageBlock({ s }) {
  return (
    <figure>
      <Img src={s.image} alt={s.caption} className={cn("w-full", s.variant === "framed" ? "aspect-[16/9] rounded-(--lp-radius) shadow-xl" : "aspect-[21/9] rounded-(--lp-radius)")} />
      {s.caption && <figcaption className="mt-3 text-sm opacity-70">{s.caption}</figcaption>}
    </figure>
  )
}

function Gallery({ s, ctx }) {
  const images = (s.images ?? []).length ? s.images : [{}, {}, {}, {}, {}]
  return (
    <>
      <H2>{s.title}</H2>
      <Intro onDark={ctx.onDark}>{s.intro}</Intro>
      {s.variant === "feature" ? (
        <div className="mt-8 grid gap-3 @3xl:grid-cols-[2fr_1fr]">
          <Img src={images[0]?.image} alt={images[0]?.caption} className="aspect-[4/3] w-full rounded-(--lp-radius) @3xl:h-full" />
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-1">
            {images.slice(1, 3).map((im, i) => (
              <Img key={i} src={im.image} alt={im.caption} className="aspect-[4/3] w-full rounded-(--lp-radius)" />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 @3xl:grid-cols-3">
          {images.map((im, i) => (
            <figure key={i}>
              <Img src={im.image} alt={im.caption} className="aspect-[4/3] w-full rounded-(--lp-radius)" />
              {im.caption && <figcaption className="mt-1.5 text-xs opacity-70">{im.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
    </>
  )
}

// YouTube / Vimeo link → embeddable address
function embedUrl(url) {
  const u = String(url ?? "")
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/)
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`
  const vm = u.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return null
}
function Video({ s, ctx }) {
  const src = embedUrl(s.url)
  const frame = src ? (
    <iframe src={src} title={s.title || "Video"} className="aspect-video w-full rounded-(--lp-radius) bg-black" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
  ) : (
    <div className={cn("flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-(--lp-radius)", ctx.onDark ? "bg-white/10" : "bg-slate-100 text-slate-400")}>
      <Icon name="play-circle-line" className="text-5xl" />
      <span className="text-sm">Add a YouTube or Vimeo link</span>
    </div>
  )
  if (s.variant === "split")
    return (
      <div className="grid items-center gap-8 @3xl:grid-cols-2">
        <div>
          <H2>{s.title}</H2>
          <Intro onDark={ctx.onDark}>{s.text}</Intro>
        </div>
        {frame}
      </div>
    )
  return (
    <>
      <H2 className="mb-8">{s.title}</H2>
      {frame}
    </>
  )
}

function Amenities({ s, ctx }) {
  const items = s.items ?? []
  return (
    <>
      <H2>{s.title}</H2>
      <Intro onDark={ctx.onDark}>{s.intro}</Intro>
      {s.variant === "chips" ? (
        <ul className="mt-8 flex flex-wrap gap-2 [.text-center_&]:justify-center">
          {items.map((it, i) => (
            <li key={i} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium", ctx.onDark ? "bg-white/10" : "bg-(--accent)/10 text-(--accent)")}>
              <Icon name={it.icon || "checkbox-circle-line"} /> {it.label}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 @xl:grid-cols-3 @4xl:grid-cols-6">
          {items.map((it, i) => (
            <li key={i} className={cn("flex flex-col items-center gap-2 rounded-(--lp-radius) p-4 text-center", card(ctx.onDark))}>
              <span className={cn("flex size-12 items-center justify-center rounded-full text-2xl", ctx.onDark ? "bg-white/15" : "bg-(--accent)/10 text-(--accent)")}>
                <Icon name={it.icon || "checkbox-circle-line"} />
              </span>
              <span className="text-sm font-medium">{it.label}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Pricing({ s, ctx }) {
  const rows = s.rows ?? []
  return (
    <>
      <H2>{s.title}</H2>
      <Intro onDark={ctx.onDark}>{s.intro}</Intro>
      {s.variant === "table" ? (
        <div className={cn("mt-8 overflow-hidden rounded-(--lp-radius) text-left", card(ctx.onDark))}>
          <table className="w-full text-[15px]">
            <tbody className={cn("divide-y", ctx.onDark ? "divide-white/15" : "divide-slate-200")}>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-4 font-medium">{r.label}</td>
                  <td className="px-5 py-4 text-lg font-bold whitespace-nowrap">{r.price}</td>
                  <td className={cn("hidden px-5 py-4 text-sm @xl:table-cell", ctx.onDark ? "text-white/70" : "text-slate-500")}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 text-left @xl:grid-cols-2 @4xl:grid-cols-3">
          {rows.map((r, i) => (
            <li key={i} className={cn("flex flex-col rounded-(--lp-radius) p-6", card(ctx.onDark))}>
              <span className={cn("text-sm font-medium", ctx.onDark ? "text-white/75" : "text-slate-500")}>{r.label}</span>
              <span className="mt-1 text-2xl font-bold" style={{ fontFamily: "var(--lp-heading)" }}>
                {r.price}
              </span>
              {r.detail && <span className={cn("mt-1 text-sm", ctx.onDark ? "text-white/70" : "text-slate-500")}>{r.detail}</span>}
              {s.ctaLabel &&
                (ctx.still ? (
                  <span className={cn("mt-4 self-start text-sm font-semibold", ctx.onDark ? "text-white" : "text-(--accent)")}>{s.ctaLabel} →</span>
                ) : (
                  <button type="button" onClick={ctx.toForm} className={cn("mt-4 self-start text-sm font-semibold", ctx.onDark ? "text-white" : "text-(--accent)")}>
                    {s.ctaLabel} →
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
      {s.note && <p className="mt-4 text-xs opacity-70">{s.note}</p>}
    </>
  )
}

function Plan({ s, ctx }) {
  const items = s.items ?? []
  return (
    <>
      <H2>{s.title}</H2>
      <Intro onDark={ctx.onDark}>{s.intro}</Intro>
      {s.variant === "table" ? (
        <div className={cn("mt-8 overflow-hidden rounded-(--lp-radius) text-left", card(ctx.onDark))}>
          <table className="w-full text-[15px]">
            <tbody className={cn("divide-y", ctx.onDark ? "divide-white/15" : "divide-slate-200")}>
              {items.map((r, i) => (
                <tr key={i}>
                  <td className="px-5 py-4 font-medium">{r.label}</td>
                  <td className={cn("px-5 py-4 text-lg font-bold", !ctx.onDark && "text-(--accent)")}>{r.amount}</td>
                  <td className={cn("px-5 py-4 text-sm", ctx.onDark ? "text-white/70" : "text-slate-500")}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="mt-8 grid gap-4 text-left @xl:grid-cols-2 @4xl:grid-cols-4">
          {items.map((r, i) => (
            <li key={i} className={cn("relative rounded-(--lp-radius) p-5", card(ctx.onDark))}>
              <span className={cn("flex size-8 items-center justify-center rounded-full text-sm font-bold", ctx.onDark ? "bg-white text-(--accent)" : "bg-(--accent) text-white")}>{i + 1}</span>
              <span className="mt-3 block text-2xl font-bold" style={{ fontFamily: "var(--lp-heading)" }}>
                {r.amount}
              </span>
              <span className="mt-1 block font-medium">{r.label}</span>
              {r.detail && <span className={cn("mt-0.5 block text-sm", ctx.onDark ? "text-white/70" : "text-slate-500")}>{r.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {s.note && <p className="mt-4 text-xs opacity-70">{s.note}</p>}
    </>
  )
}

function Location({ s, ctx }) {
  const q = encodeURIComponent(s.address ?? "")
  // The Google Maps link (expanded on save), else the address searched
  const map = parseMapLink(s.mapResolved || s.mapUrl)
  const embed = map.embed ?? (q ? `https://maps.google.com/maps?q=${q}&z=14&output=embed` : null)
  const details = (
    <div className={cn("rounded-(--lp-radius) p-6 text-left", card(ctx.onDark))}>
      <p className="flex items-start gap-2 font-medium">
        <Icon name="map-pin-2-fill" className={cn("mt-0.5 shrink-0", !ctx.onDark && "text-(--accent)")} /> <span className="whitespace-pre-line">{s.address}</span>
      </p>
      {s.landmarks?.length > 0 && (
        <ul className={cn("mt-4 space-y-2 text-[15px]", ctx.onDark ? "text-white/80" : "text-slate-600")}>
          {s.landmarks.map((l, i) => (
            <li key={i} className="flex gap-2">
              <Icon name="checkbox-circle-line" className={cn("mt-0.5 shrink-0", !ctx.onDark && "text-(--accent)")} /> {l.label}
            </li>
          ))}
        </ul>
      )}
      <A
        ctx={ctx}
        href={map.link ?? `https://www.google.com/maps/search/?api=1&query=${q}`}
        target="_blank"
        rel="noreferrer"
        className={cn("mt-5 inline-flex items-center gap-1.5 text-sm font-semibold", !ctx.onDark && "text-(--accent)")}
      >
        <Icon name="direction-line" /> Get directions
      </A>
    </div>
  )
  return (
    <>
      <H2 className="mb-8">{s.title}</H2>
      {s.variant === "map" ? (
        <div className="grid gap-4 @3xl:grid-cols-[2fr_3fr]">
          {details}
          {embed ? (
            <iframe title="Map" src={embed} className="min-h-72 w-full rounded-(--lp-radius) border-0 ring-1 ring-slate-200" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          ) : (
            <div className="min-h-72 rounded-(--lp-radius) bg-slate-100" />
          )}
        </div>
      ) : (
        <div className="max-w-xl [.text-center_&]:mx-auto">{details}</div>
      )}
    </>
  )
}

function Trust({ s, ctx }) {
  if (s.variant === "badges")
    return (
      <>
        <H2>{s.title}</H2>
        <Intro onDark={ctx.onDark}>{s.text}</Intro>
        <ul className="mt-8 flex flex-wrap gap-3 [.text-center_&]:justify-center">
          {(s.items ?? []).map((it, i) => (
            <li key={i} className={cn("inline-flex items-center gap-2 rounded-(--lp-radius) px-4 py-3 text-sm font-semibold", card(ctx.onDark))}>
              <Icon name={it.icon || "shield-check-line"} className={cn("text-xl", !ctx.onDark && "text-(--accent)")} /> {it.label}
            </li>
          ))}
        </ul>
      </>
    )
  return (
    <div className={cn("flex flex-col gap-4 rounded-(--lp-radius) p-6 text-left @xl:flex-row @xl:items-center", ctx.onDark ? "bg-white/10" : "bg-(--accent)/8")}>
      <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-full text-2xl", ctx.onDark ? "bg-white text-(--accent)" : "bg-(--accent) text-white")}>
        <Icon name="shield-check-line" />
      </span>
      <div>
        <h2 className="text-xl font-bold" style={{ fontFamily: "var(--lp-heading)" }}>
          {s.title}
        </h2>
        {s.text && <p className={cn("mt-1 text-[15px]", ctx.onDark ? "text-white/80" : "text-slate-700")}>{s.text}</p>}
      </div>
    </div>
  )
}

function Testimonials({ s, ctx }) {
  const items = s.items ?? []
  if (s.variant === "quote" && items[0])
    return (
      <figure className="mx-auto max-w-3xl text-center">
        <Icon name="double-quotes-l" className={cn("text-5xl", ctx.onDark ? "text-white/40" : "text-(--accent)/40")} />
        <blockquote className="mt-2 text-2xl leading-snug font-medium text-balance @3xl:text-3xl" style={{ fontFamily: "var(--lp-heading)" }}>
          {items[0].quote}
        </blockquote>
        <figcaption className="mt-5 text-sm">
          <span className="font-semibold">{items[0].name}</span> {items[0].role && <span className="opacity-70">· {items[0].role}</span>}
        </figcaption>
      </figure>
    )
  return (
    <>
      <H2 className="mb-8">{s.title}</H2>
      <ul className="grid gap-4 text-left @3xl:grid-cols-2 @5xl:grid-cols-3">
        {items.map((t, i) => (
          <li key={i} className={cn("flex flex-col rounded-(--lp-radius) p-6", card(ctx.onDark))}>
            <Icon name="double-quotes-l" className={cn("text-3xl", ctx.onDark ? "text-white/40" : "text-(--accent)/40")} />
            <p className="mt-2 flex-1 text-[15px] leading-relaxed">{t.quote}</p>
            <p className="mt-4 text-sm">
              <span className="font-semibold">{t.name}</span>
              {t.role && <span className="block opacity-70">{t.role}</span>}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}

function Faq({ s, ctx }) {
  const items = s.items ?? []
  return (
    <>
      <H2 className="mb-8">{s.title}</H2>
      {s.variant === "columns" ? (
        <dl className="grid gap-x-10 gap-y-6 text-left @3xl:grid-cols-2">
          {items.map((it, i) => (
            <div key={i}>
              <dt className="font-semibold">{it.q}</dt>
              <dd className={cn("mt-1 text-[15px]", ctx.onDark ? "text-white/75" : "text-slate-600")}>{it.a}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className={cn("divide-y rounded-(--lp-radius) text-left", card(ctx.onDark), ctx.onDark ? "divide-white/15" : "divide-slate-200")}>
          {items.map((it, i) => (
            <details key={i} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                {it.q}
                <Icon name="add-line" className="shrink-0 opacity-50 transition group-open:rotate-45" />
              </summary>
              <p className={cn("mt-2 text-[15px]", ctx.onDark ? "text-white/75" : "text-slate-600")}>{it.a}</p>
            </details>
          ))}
        </div>
      )}
    </>
  )
}

function FormMissing() {
  return <p className="rounded-(--lp-radius) border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Choose a lead form in the page settings.</p>
}

function FormSection({ s, ctx }) {
  if (!ctx.form && !ctx.editing) return null
  const box = (
    <div id="enquire" className="scroll-mt-4 rounded-(--lp-radius) bg-white p-1 text-left text-slate-900 shadow-lg ring-1 ring-slate-200">
      {ctx.form ?? <FormMissing />}
    </div>
  )
  if (s.variant === "centered")
    return (
      <div className="mx-auto max-w-xl text-center">
        <H2>{s.title}</H2>
        <Intro onDark={ctx.onDark}>{s.text}</Intro>
        <div className="mt-8">{box}</div>
      </div>
    )
  return (
    <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_26rem] @3xl:items-start">
      <div>
        <H2>{s.title}</H2>
        <Intro onDark={ctx.onDark}>{s.text}</Intro>
        <Points items={s.points} onDark={ctx.onDark} className="flex-col items-start" />
      </div>
      {box}
    </div>
  )
}

function Cta({ s, ctx }) {
  const wa = s.secondary && waLink(ctx.theme.whatsapp)
  const buttons = (
    <div className="flex flex-wrap gap-3 [.text-center_&]:justify-center">
      <Button s={s} label={s.ctaLabel} action={s.ctaAction} link={s.ctaLink} ctx={ctx} onDark={ctx.onDark} />
      {wa && <Button s={s} label="WhatsApp us" action="whatsapp" ctx={ctx} onDark={ctx.onDark} secondary />}
    </div>
  )
  if (s.variant === "split")
    return (
      <div className="flex flex-col gap-6 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <div className="text-left">
          <H2>{s.title}</H2>
          <Intro onDark={ctx.onDark}>{s.text}</Intro>
        </div>
        {buttons}
      </div>
    )
  return (
    <div>
      <H2>{s.title}</H2>
      <Intro onDark={ctx.onDark}>{s.text}</Intro>
      <div className="mt-7">{buttons}</div>
    </div>
  )
}

function useCountdown(until) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])
  const end = until ? new Date(until).getTime() : null
  if (!end || now == null) return null
  const left = Math.max(0, end - now)
  return { days: Math.floor(left / 86_400_000), hours: Math.floor(left / 3_600_000) % 24, minutes: Math.floor(left / 60_000) % 60, seconds: Math.floor(left / 1000) % 60, over: left === 0 }
}
function Countdown({ s, ctx }) {
  const t = useCountdown(s.until)
  const units = t
    ? [
        [t.days, "Days"],
        [t.hours, "Hours"],
        [t.minutes, "Minutes"],
        [t.seconds, "Seconds"],
      ]
    : [
        ["–", "Days"],
        ["–", "Hours"],
        ["–", "Minutes"],
        ["–", "Seconds"],
      ]
  const clock = (
    <div className="mt-6 flex justify-center gap-3 [.text-left_&]:justify-start">
      {units.map(([n, l]) => (
        <div key={l} className={cn("min-w-18 rounded-(--lp-radius) px-3 py-3 text-center", card(ctx.onDark))}>
          <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: "var(--lp-heading)" }}>
            {typeof n === "number" ? String(n).padStart(2, "0") : n}
          </div>
          <div className="text-xs opacity-70">{l}</div>
        </div>
      ))}
    </div>
  )
  const body = (
    <>
      <H2>{t?.over ? "The offer has ended" : s.title}</H2>
      <Intro onDark={ctx.onDark}>{s.text}</Intro>
      {!t?.over && clock}
      <div className="mt-7 flex flex-wrap gap-3 [.text-center_&]:justify-center">
        <Button s={s} label={s.ctaLabel} action={s.ctaAction} link={s.ctaLink} ctx={ctx} onDark={ctx.onDark} />
      </div>
    </>
  )
  return s.variant === "card" ? <div className={cn("mx-auto max-w-2xl rounded-(--lp-radius) p-8", card(ctx.onDark))}>{body}</div> : body
}

function Contact({ s, ctx }) {
  const wa = waLink(ctx.theme.whatsapp)
  const phone = digits(ctx.theme.phone)
  return (
    <div className="text-left">
      <div className="grid gap-6 @3xl:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "var(--lp-heading)" }}>
            {s.title}
          </h2>
          {s.address && <p className="mt-2 text-sm whitespace-pre-line opacity-80">{s.address}</p>}
          {s.hours && <p className="mt-1 text-sm opacity-80">{s.hours}</p>}
          {s.email && (
            <A ctx={ctx} href={`mailto:${s.email}`} className="mt-1 block text-sm underline-offset-2 opacity-80 hover:underline">
              {s.email}
            </A>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2 @3xl:justify-end">
          {phone && (
            <A
              ctx={ctx}
              href={`tel:+${phone.replace(/^0/, "92")}`}
              className={cn("inline-flex h-11 items-center gap-2 rounded-(--lp-radius) px-4 text-sm font-semibold", ctx.onDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900")}
            >
              <Icon name="phone-line" /> {ctx.theme.phone}
            </A>
          )}
          {wa && (
            <A ctx={ctx} href={wa} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-(--lp-radius) bg-[#25d366] px-4 text-sm font-semibold text-white">
              <Icon name="whatsapp-line" /> WhatsApp
            </A>
          )}
        </div>
      </div>
      <p className="mt-10 border-t border-current/10 pt-5 text-xs opacity-60">
        © {new Date().getFullYear()} {ctx.workspace?.name}
      </p>
    </div>
  )
}

function Spacer({ s, ctx }) {
  return s.variant === "line" ? <hr className={cn("border-0 border-t", ctx.onDark ? "border-white/20" : "border-slate-200")} /> : <div className="h-6" />
}

const RENDER = {
  navbar: Navbar,
  hero: Hero,
  stats: Stats,
  features: Features,
  text: Text,
  image: ImageBlock,
  gallery: Gallery,
  video: Video,
  amenities: Amenities,
  pricing: Pricing,
  plan: Plan,
  location: Location,
  trust: Trust,
  testimonials: Testimonials,
  faq: Faq,
  form: FormSection,
  cta: Cta,
  countdown: Countdown,
  contact: Contact,
  spacer: Spacer,
}

// The frame around every section: its style, and in the builder, click to select
function Frame({ s, ctx, editor, children }) {
  const st = { ...STYLE_DEFAULTS, ...(s.style ?? {}) }
  const onDark = DARK_BG.includes(st.background)
  const selected = editor?.selected === s.id
  const bg =
    st.background === "image"
      ? { background: `linear-gradient(rgb(0 0 0 / ${(st.overlay ?? 55) / 100}), rgb(0 0 0 / ${(st.overlay ?? 55) / 100})), ${st.image ? `url("${st.image}")` : "#334155"} center / cover` }
      : st.background === "accent" && s.type === "hero"
        ? { background: "radial-gradient(circle at 85% 15%, rgb(255 255 255 / 0.18), transparent 40%), linear-gradient(135deg, var(--accent), color-mix(in oklab, var(--accent) 55%, black))" }
        : undefined
  return (
    <section
      id={s.type === "form" ? undefined : s.id}
      data-section={s.id}
      onClick={editor ? () => editor.onSelect(s.id) : undefined}
      className={cn(
        "relative",
        { white: "bg-white text-slate-900", muted: "bg-slate-50 text-slate-900", tint: "bg-(--accent)/8 text-slate-900", accent: "bg-(--accent) text-white", dark: "bg-slate-900 text-white", image: "text-white" }[
          st.background
        ],
        s.type === "navbar" && "border-b border-current/10",
        st.show === "desktop" && "hidden @3xl:block",
        st.show === "mobile" && "@3xl:hidden",
        editor && "cursor-pointer",
        editor && (selected ? "outline-2 -outline-offset-2 outline-blue-500" : "hover:outline-2 hover:-outline-offset-2 hover:outline-blue-400/60 hover:outline-dashed"),
        editor && s.hidden && "opacity-40",
      )}
      style={bg}
    >
      {editor && (selected || s.hidden) && (
        <span className="absolute top-2 left-2 z-10 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {SECTIONS[s.type]?.label}
          {s.hidden && " · hidden"}
        </span>
      )}
      <div className={cn("mx-auto w-full px-5 @3xl:px-8", PAD[st.padding] ?? PAD.md, WIDTH[st.width] ?? WIDTH.normal, st.align === "center" ? "text-center" : "text-left")}>{children({ ...ctx, onDark })}</div>
    </section>
  )
}

// still: a picture of the page (thumbnails): no buttons or links, so it can sit inside one
export function LandingView({ page, workspace, form = null, editor = null, still = false, className }) {
  const theme = { ...THEME_DEFAULTS, ...(page.theme ?? {}) }
  const fonts = fontStack(theme.font)
  const sections = (page.sections ?? []).filter((s) => RENDER[s.type] && (editor || !s.hidden))
  const toForm = (e) => {
    e?.stopPropagation?.()
    const root = e?.currentTarget?.closest?.("[data-landing]") ?? document
    root.querySelector("#enquire")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const ctx = { theme, workspace, form, toForm, still, editing: Boolean(editor) || still }
  return (
    <div
      data-landing
      className={cn("@container min-h-full bg-white text-slate-900 antialiased", landingFontVars, className)}
      style={{ "--accent": accentHex(theme.accent), "--lp-radius": RADIUS[theme.radius] ?? RADIUS.lg, "--lp-heading": fonts.heading, fontFamily: fonts.body }}
    >
      {sections.map((s) => {
        const Render = RENDER[s.type]
        return (
          <Frame key={s.id} s={s} ctx={ctx} editor={editor}>
            {(c) => <Render s={s} ctx={c} />}
          </Frame>
        )
      })}
      {editor && !sections.length && (
        <div className="flex min-h-96 flex-col items-center justify-center gap-2 p-10 text-center text-slate-400">
          <Icon name="layout-masonry-line" className="text-4xl" />
          <p className="text-sm">Add your first section from the library.</p>
        </div>
      )}
    </div>
  )
}
