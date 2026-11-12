/* eslint-disable @next/next/no-img-element -- pre-sized webp pictures */
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { StoreBadges } from "@/modules/web/components/store-badges"
import { Crop } from "./crop"
import { DemoButton } from "./demo"

// Building blocks of the website's pages (server components; the live parts are client islands)

export function Section({ id, className, children, labelledBy, label }) {
  return (
    <section id={id} aria-labelledby={labelledBy} aria-label={label} className={cn("scroll-mt-20 py-24 lg:py-32", className)}>
      <div className="pf-container">{children}</div>
    </section>
  )
}

// Eyebrow, title and one sentence. center for centered sections, dark on navy
export function SectionHeading({ id, eyebrow, title, text, center, dark, className, as: Tag = "h2" }) {
  return (
    <div data-reveal className={cn("max-w-2xl", center && "mx-auto max-w-3xl text-center", className)}>
      {eyebrow && <p className={cn("pf-eyebrow", dark && "text-[var(--brand-bright)]")}>{eyebrow}</p>}
      <Tag id={id} className={cn("mt-3 text-[clamp(2rem,1.4rem+2.2vw,3rem)] leading-[1.1] font-bold", dark ? "text-white" : "text-[var(--ink)]")}>
        {title}
      </Tag>
      {text && <p className={cn("mt-5 text-lg", dark ? "text-[var(--deep-muted)]" : "text-[var(--text-2)]")}>{text}</p>}
    </div>
  )
}

// A portal screenshot in a browser frame, whole or cropped to one callout
export function Frame({ screen, callout, url, alt, priority, className, width = 560 }) {
  return (
    <div className={cn("pf-frame", className)}>
      <div className="flex h-9 items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-3.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        {url && <span className="mx-auto hidden truncate rounded-md bg-white px-3 py-0.5 text-[13px] text-[var(--text-2)] sm:block">{url}</span>}
      </div>
      <Crop screen={screen} callout={callout} alt={alt} priority={priority} width={width} />
    </div>
  )
}

// A floating crop of the product with its caption (over a screenshot)
export function Lens({ screen, callout, label, className, delay = 0, speed }) {
  return (
    <div data-parallax={speed} className={cn("absolute hidden md:block", className)}>
      <figure className="pf-float rounded-xl border border-[var(--line)] bg-white p-1.5 shadow-[0_24px_50px_-18px_rgb(11_18_64/0.4)]" style={{ "--delay": `${delay}ms` }}>
        <Crop screen={screen} callout={callout} alt={label} className="rounded-lg" width={300} />
        <figcaption className="flex items-center gap-1.5 px-1.5 pt-2 pb-1 text-[13px] font-medium text-[var(--ink)]">
          <Icon name="checkbox-circle-fill" className="text-[var(--brand)]" aria-hidden />
          {label}
        </figcaption>
      </figure>
    </div>
  )
}

// The hero: centered headline over a large screenshot that settles flat as the page scrolls
export function Hero({ badge, title, accent, text, screen, url, alt, lenses = [], source = "Hero", secondary, note }) {
  return (
    <section className="pf-hero-bg relative overflow-hidden pt-32 pb-20 lg:pt-40">
      <div aria-hidden className="pf-grid-lines absolute inset-0" />
      <div className="pf-container relative text-center">
        {badge && (
          <p className="pf-rise inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/80 px-3.5 py-1.5 text-sm font-medium text-[var(--text-2)] backdrop-blur">
            <span className="size-1.5 rounded-full bg-[var(--brand)]" />
            {badge}
          </p>
        )}
        <h1 className="pf-slide mx-auto mt-6 max-w-4xl text-[clamp(2.4rem,1.3rem+4.4vw,4.5rem)] leading-[1.04] font-extrabold tracking-[-0.035em] text-[var(--ink)]" style={{ "--delay": "80ms" }}>
          {title} {accent && <span className="bg-gradient-to-r from-[#1528a0] to-[#3d63e8] bg-clip-text text-transparent">{accent}</span>}
        </h1>
        <p className="pf-slide mx-auto mt-6 max-w-2xl text-lg text-[var(--text-2)] sm:text-xl" style={{ "--delay": "160ms" }}>
          {text}
        </p>
        <div className="pf-rise mt-9 flex flex-wrap justify-center gap-3" style={{ "--delay": "240ms" }}>
          <DemoButton source={source} />
          {secondary && (
            <a href={secondary.href} className="pf-btn" data-tone="outline">
              {secondary.label}
            </a>
          )}
        </div>
        {note && (
          <p className="pf-rise mt-5 text-sm text-[var(--text-2)]" style={{ "--delay": "300ms" }}>
            {note}
          </p>
        )}
        {screen && (
          <div className="pf-rise relative mx-auto mt-16 max-w-5xl md:mb-10" style={{ "--delay": "380ms" }}>
            <div className="pf-tilt">
              <Frame screen={screen} url={url} alt={alt} priority width={1024} />
            </div>
            {lenses.map((l, i) => (
              <Lens key={l.callout} {...l} delay={i * 1700} speed={l.speed ?? 0.06 + i * 0.04} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// Who it's for, as a quiet strip of icons
export function BuiltFor({ items }) {
  return (
    <div className="border-y border-[var(--line)] bg-[var(--surface)] py-7">
      <ul className="pf-container flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[15px] font-medium text-[var(--text-2)]">
        {items.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            <Icon name={b.icon} className="text-xl text-[var(--brand)]" aria-hidden /> {b.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

// A feature: text and points on one side, a framed screenshot crop on the other
export function FeatureRow({ eyebrow, title, text, points = [], screen, callout, alt, href, link = "Learn more", reverse, index = 0 }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div data-reveal className={cn(reverse && "lg:order-2")}>
        {eyebrow && <p className="pf-eyebrow">{eyebrow}</p>}
        <h3 className="mt-3 text-[clamp(1.6rem,1.2rem+1.3vw,2.25rem)] leading-tight font-bold">{title}</h3>
        <p className="mt-4 text-lg text-[var(--text-2)]">{text}</p>
        {points.length > 0 && (
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex gap-3">
                <Icon name="checkbox-circle-fill" className="mt-0.5 shrink-0 text-xl text-[var(--brand)]" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        {href && (
          <a href={href} className="pf-link mt-7">
            {link} <Icon name="arrow-right-line" aria-hidden />
            <span className="sr-only">: {title}</span>
          </a>
        )}
      </div>
      <div data-reveal style={{ "--delay": "120ms" }} className={cn("relative", reverse && "lg:order-1")}>
        <div aria-hidden className={cn("absolute -inset-4 -z-10 rounded-[2rem] bg-[var(--brand-soft)] sm:-inset-6", index % 2 ? "rotate-[1.5deg]" : "-rotate-[1.5deg]")} />
        <div data-parallax="0.04">
          <Frame screen={screen} callout={callout} alt={alt ?? title} />
        </div>
      </div>
    </div>
  )
}

// Cards with an icon, title and text (problems solved, what's local, security)
export function IconCards({ items, columns = 3, dark }) {
  return (
    <ul className={cn("grid gap-5 sm:grid-cols-2", columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {items.map((c, i) => (
        <li
          key={c.title}
          data-reveal
          style={{ "--delay": `${(i % columns) * 80}ms` }}
          className={cn("rounded-[var(--radius)] p-6", dark ? "border border-white/10 bg-white/[0.04]" : "pf-card")}
          {...(!dark && { "data-hover": "" })}
        >
          <span className={cn("flex size-11 items-center justify-center rounded-xl text-xl", dark ? "bg-white/10 text-[var(--brand-bright)]" : "bg-[var(--brand-soft)] text-[var(--brand)]")}>
            <Icon name={c.icon} aria-hidden />
          </span>
          <h3 className={cn("mt-5 text-lg font-bold", dark && "text-white")}>{c.title}</h3>
          <p className={cn("mt-2", dark ? "text-[var(--deep-muted)]" : "text-[var(--text-2)]")}>{c.text}</p>
          {c.after && (
            <p className="mt-4 flex gap-2 border-t border-[var(--line)] pt-4">
              <Icon name="checkbox-circle-fill" className="mt-0.5 shrink-0 text-[var(--brand)]" aria-hidden />
              <span>{c.after}</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

// Questions as an accordion, heading on the left
export function Faq({ id = "faq", title = "Questions developers ask", text, faq }) {
  return (
    <Section id={id} labelledBy={`${id}-title`}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <SectionHeading id={`${id}-title`} eyebrow="FAQ" title={title} text={text} />
        <div data-reveal className="pf-card divide-y divide-[var(--line)] px-2">
          {faq.map((f) => (
            <details key={f.q} className="group px-4 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.0625rem] font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--brand)] transition-transform duration-300 group-open:rotate-45">
                  <Icon name="add-line" aria-hidden />
                </span>
              </summary>
              <p className="mt-3 pr-10 text-[var(--text-2)]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

// The two phone screenshots
export function Phones({ className }) {
  const shots = [
    { src: "/images/screens/mobile-lead.webp", alt: "A lead in the PropFlow app with calls, notes and follow-ups", className: "mt-16 -rotate-3" },
    { src: "/images/screens/mobile-home.webp", alt: "The PropFlow app's home screen: today's follow-ups, new leads and approvals", className: "rotate-2" },
  ]
  return (
    <div className={cn("flex justify-center gap-5", className)}>
      {shots.map((s, i) => (
        <div key={s.src} data-parallax={i ? "0.08" : "0.03"} className="w-[46%]">
          <div className={cn("rounded-[2rem] bg-[#0b1240] p-1.5 shadow-[0_40px_80px_-30px_rgb(11_18_64/0.6)]", s.className)}>
            <img src={s.src} alt={s.alt} width={560} height={1217} loading="lazy" className="h-auto w-full rounded-[1.6rem]" />
          </div>
        </div>
      ))}
    </div>
  )
}

// The mobile app band
export function MobileBand({ apps, title = "Your sales desk, in every agent's pocket", text, points = [] }) {
  return (
    <Section id="mobile" labelledBy="mobile-title" className="overflow-hidden bg-[var(--surface)]">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading id="mobile-title" eyebrow="Mobile app" title={title} text={text} />
          {points.length > 0 && (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {points.map((p, i) => (
                <li key={p.title} data-reveal style={{ "--delay": `${(i % 2) * 80}ms` }} className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg text-[var(--brand)] shadow-xs">
                    <Icon name={p.icon} aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold">{p.title}</span>
                    <span className="block text-[15px] text-[var(--text-2)]">{p.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <StoreBadges links={apps} location="Mobile app section" className="mt-10" />
        </div>
        <Phones className="mx-auto max-w-[480px]" />
      </div>
    </Section>
  )
}
