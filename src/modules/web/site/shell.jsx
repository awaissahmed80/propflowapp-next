import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { Icon } from "@/components/ui/icon"
import { LegalLink } from "@/modules/web/components/legal"
import { StoreBadges } from "@/modules/web/components/store-badges"
import { text } from "./fonts"
import { DemoForm, DemoProvider } from "./demo"
import { SiteHeader } from "./header"
import { Parallax } from "./motion"
import { PRODUCT_PAGES } from "./pages"
import "./site.css"

// Every page of propflowapp.com: header, the page, the closing "Book a demo" panel and the footer.
// site: getSiteSettings() (Sign in link, store links). initialDemo opens the demo form on arrival.
export function SiteShell({ site, children, closing = true, initialDemo = false, pricingLabel }) {
  const products = PRODUCT_PAGES.map(({ slug, menu, blurb }) => ({ slug, menu, blurb }))
  const apps = { appStore: site.appStoreUrl, playStore: site.playStoreUrl }
  return (
    <div data-site="web" className={cn("pf-web min-h-svh overflow-x-clip", text.variable)}>
      <DemoProvider initial={initialDemo}>
        <Parallax />
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
          Skip to content
        </a>
        <SiteHeader products={products} showSignIn={site.signInVisible} pricingLabel={pricingLabel} />
        <main id="main">{children}</main>
        {closing && <Closing />}
        <SiteFooter apps={apps} />
      </DemoProvider>
    </div>
  )
}

const NEXT = ["A call at the time you pick", "A 30-minute walk-through with projects like yours", "A trial workspace with your own data, if it fits"]

// The closing panel: the demo form, already open, on navy
export function Closing({ title = "See PropFlow on a project like yours", text = "Leave a number and we’ll call to set a time. Free, no obligation, and set up around how you sell." }) {
  return (
    <section id="book" aria-labelledby="book-title" className="scroll-mt-16 pb-24 lg:pb-32">
      <div className="pf-container">
        <div className="pf-navy relative overflow-hidden rounded-[1.75rem] px-6 py-14 sm:px-12 lg:px-16 lg:py-20">
          <div aria-hidden className="pf-grid-lines absolute inset-0 opacity-40 invert" />
          <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
            <div data-reveal>
              <p className="pf-eyebrow text-[var(--brand-bright)]">Book a demo</p>
              <h2 id="book-title" className="mt-3 text-[clamp(2rem,1.3rem+2.6vw,3.25rem)] leading-[1.08] font-bold text-white">
                {title}
              </h2>
              <p className="mt-5 max-w-lg text-lg text-[var(--deep-muted)]">{text}</p>
              <ul className="mt-8 space-y-3">
                {NEXT.map((n) => (
                  <li key={n} className="flex gap-3 text-white/90">
                    <Icon name="checkbox-circle-fill" className="mt-0.5 shrink-0 text-xl text-[var(--brand-bright)]" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal style={{ "--delay": "120ms" }} className="rounded-2xl bg-white p-6 text-[var(--ink)] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] sm:p-8">
              <p className="text-lg font-bold">Book your free demo</p>
              <p className="mt-1 mb-6 text-sm text-[var(--text-2)]">Takes 20 seconds.</p>
              <DemoForm source="Closing form" compact />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function SiteFooter({ apps }) {
  const cols = [
    { title: "Product", links: PRODUCT_PAGES.map((p) => ({ href: `/${p.slug}`, label: p.menu })) },
    {
      title: "Company",
      links: [
        { href: "/why-propflow", label: "Why PropFlow" },
        { href: "/pricing", label: "Pricing" },
        { href: "/mobile-app", label: "Mobile app" },
        { href: "/book-a-demo", label: "Book a demo" },
      ],
    },
  ]
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--surface)] pt-16 pb-10">
      <div className="pf-container">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Logo variant="dark" className="h-8" width={155} height={32} />
            <p className="mt-4 max-w-xs text-[15px] text-[var(--text-2)]">Real estate CRM & ERP for developers, builders and housing societies in Pakistan.</p>
            <StoreBadges links={apps} location="Footer" size="sm" className="mt-6" />
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="text-sm font-semibold">{c.title}</p>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="text-[var(--text-2)] transition-colors hover:text-[var(--brand)]">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-8 text-sm text-[var(--text-2)]">
          <p>© {new Date().getFullYear()} PropFlow. All rights reserved.</p>
          <p className="flex gap-6">
            <LegalLink doc="privacy" className="font-normal text-inherit hover:text-[var(--brand)] hover:no-underline" />
            <LegalLink doc="terms" className="font-normal text-inherit hover:text-[var(--brand)] hover:no-underline" />
          </p>
        </div>
      </div>
    </footer>
  )
}
