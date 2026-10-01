import { connection } from "next/server"
import { cn } from "@/lib/utils"
import { siteUrl } from "@/lib/sites"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { CONTENT as m } from "@/modules/web/content"
import { publicPricing } from "@/modules/web/server/pricing"
import { EnquiryButton, EnquiryProvider, TrialButton } from "@/modules/web/components/enquiry"
import { FeatureTabs } from "@/modules/web/components/features"
import { Header } from "@/modules/web/components/header"
import { PricingPlans } from "@/modules/web/components/pricing"
import { GetStartedWizard } from "@/modules/web/components/get-started"
import { Screen } from "@/modules/web/components/screen"
import { Maintenance } from "@/modules/web/components/maintenance"
import { LegalLink } from "@/modules/web/components/legal"
import { getSiteSettings } from "@/server/platform-settings"

const OG_IMAGE = { url: "/api/og", width: 1200, height: 630, alt: "PropFlow: real estate ERP made for Pakistan" }

export const metadata = {
  title: { absolute: m.title },
  description: m.description,
  keywords: m.keywords,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: "PropFlow", title: m.title, description: m.description, locale: "en_PK", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: m.title, description: m.description, images: [OG_IMAGE.url] },
  category: "business",
}

// Structured data for search engines: who we are, what PropFlow is, and the FAQ
function StructuredData() {
  const home = siteUrl("web")
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${home}#organization`, name: "PropFlow", url: home, logo: siteUrl("web", "/images/propflow-logo-light.svg"), areaServed: "PK" },
      { "@type": "WebSite", "@id": `${home}#website`, url: home, name: "PropFlow", inLanguage: "en-PK", publisher: { "@id": `${home}#organization` } },
      {
        "@type": "SoftwareApplication",
        name: "PropFlow",
        url: home,
        description: m.description,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Real estate ERP",
        operatingSystem: "Web browser",
        areaServed: "PK",
        publisher: { "@id": `${home}#organization` },
      },
      { "@type": "FAQPage", mainEntity: m.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  }
  // "<" escaped so the JSON can never close the script tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
}

function Section({ id, className, children }) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  )
}

function Heading({ eyebrow, title, text, center, dark }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow && <p className={cn("text-sm font-semibold tracking-wide", dark ? "text-brand-bright" : "text-primary")}>{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {text && <p className={cn("mt-4 text-lg text-pretty", dark ? "text-slate-300" : "text-muted-foreground")}>{text}</p>}
    </div>
  )
}

function Hero({ trialDays, showPrices, quoteMode }) {
  return (
    <section id="top" className="relative overflow-hidden px-4 pt-32 pb-24 sm:px-6 lg:pt-40">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-[40rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_65%)]" />
      <div className="relative mx-auto max-w-6xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-sm text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {m.hero.eyebrow}
        </p>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          {m.hero.title} <span className="text-primary">{m.hero.highlight}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">{m.hero.text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <TrialButton source="Hero" size="lg" trialLabel={`Start ${trialDays}-day free trial`} />
          <Button size="lg" variant="outline" leftIcon={quoteMode ? "apps-2-line" : "price-tag-3-line"} nativeButton={false} render={<a href={quoteMode ? "#features" : "#pricing"} />}>
            {quoteMode ? "See features" : showPrices ? "See pricing" : "See plans"}
          </Button>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{m.hero.note}</p>
      </div>
      <Screen
        id="estate-overview"
        alt="PropFlow Estate Management: projects, inventory, bookings and collections at a glance"
        priority
        url="portal.propflowapp.com/estate"
        className="relative mx-auto mt-20 max-w-5xl md:mb-16"
        lenses={m.hero.lenses}
      />
    </section>
  )
}

function BuiltFor() {
  return (
    <div className="border-y bg-muted/40 px-4 py-6 sm:px-6">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-medium text-muted-foreground">
        {m.builtFor.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            <Icon name={b.icon} className="text-lg text-primary" /> {b.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Pains() {
  return (
    <Section>
      <Heading center eyebrow="Sound familiar?" title={m.pains.title} />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {m.pains.items.map((p) => (
          <article key={p.title} className="rounded-2xl border bg-card p-6 shadow-xs">
            <span className="flex size-11 items-center justify-center rounded-xl bg-red-500/10 text-xl text-red-600 dark:text-red-400">
              <Icon name={p.icon} />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{p.before}</p>
            <p className="mt-4 flex gap-2 border-t pt-4 text-sm">
              <Icon name="checkbox-circle-fill" className="mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>{p.after}</span>
            </p>
          </article>
        ))}
      </div>
    </Section>
  )
}

function Features() {
  return (
    <Section id="features" className="bg-muted/40">
      <Heading center eyebrow="Features" title="Everything from launch to booking" text="One system for your projects, prices, sales team and marketing. Pick an area to see how it works." />
      <FeatureTabs features={m.features} />
    </Section>
  )
}

function Local() {
  const l = m.local
  return (
    <Section id="local" className="bg-slate-950 text-white dark:bg-slate-900">
      <Heading center dark eyebrow={l.eyebrow} title={l.title} text={l.text} />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {l.items.map((p) => (
          <div key={p.title} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
            <Icon name={p.icon} className="text-2xl text-brand-bright" />
            <h3 className="mt-3 font-semibold">{p.title}</h3>
            <p className="mt-1 text-sm text-slate-300">{p.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Apps() {
  return (
    <Section id="apps">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
        <div>
          <Heading
            eyebrow="One login, every app"
            title="From the first enquiry to possession"
            text="Start with inventory, CRM and campaigns. Sales, customer services, finance and HR plug into the same data as you grow, with no double entry between departments."
          />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {m.apps.map((a) => (
              <li key={a.name} className="flex gap-3 rounded-xl border bg-card p-3">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-white", a.color)}>
                  <Icon name={a.icon} />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                    {a.name}
                    {!a.live && <span className="text-xs font-normal text-muted-foreground">Coming soon</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{a.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Screen
          id="launcher"
          alt="PropFlow app launcher with My Desk: today's to-dos and every app in one place"
          url="portal.propflowapp.com"
          className="md:mb-24 lg:mt-24"
          lenses={[{ callout: "critical", label: "What needs you today, across every app", at: { left: "-6%", bottom: "-24%" }, width: "38%" }]}
        />
      </div>
    </Section>
  )
}

function Pricing({ pricing, quoteMode }) {
  const notes = [
    `${pricing.trialDays}-day free trial on every plan, no card needed`,
    pricing.extraUser && `Extra users Rs ${new Intl.NumberFormat("en-PK").format(pricing.extraUser)} per user a month`,
    pricing.showPrices && "Prices exclude taxes",
  ].filter(Boolean)
  // Get-started wizard on: no plan cards, just the modules to pick from
  if (quoteMode)
    return (
      <Section id="get-started" className="bg-muted/40">
        <Heading
          center
          eyebrow="Create your workspace"
          title="What would you like PropFlow to do?"
          text={`Answer a few quick questions and we'll set up a workspace with just what your business needs, starting with a ${pricing.trialDays}-day free trial.`}
        />
        <GetStartedWizard trialDays={pricing.trialDays} />
      </Section>
    )
  return (
    <Section id="pricing" className="bg-muted/40">
      <Heading
        center
        eyebrow={pricing.showPrices ? "Pricing" : "Plans"}
        title={pricing.showPrices ? `Start free for ${pricing.trialDays} days` : "A plan for every size of developer"}
        text={
          pricing.showPrices
            ? "Every plan includes a free trial with all its features. No card needed, and your data stays if you continue."
            : `Every plan includes a ${pricing.trialDays}-day free trial with all its features. Talk to our sales team for prices.`
        }
      />
      {pricing.plans.length ? (
        <PricingPlans plans={pricing.plans} yearlyMonths={pricing.yearlyMonths} popular={m.popularPlan} showPrices={pricing.showPrices} />
      ) : (
        <div className="mt-10 text-center">
          <EnquiryButton kind="sales" source="Pricing" size="lg">
            Ask for a quote
          </EnquiryButton>
        </div>
      )}
      <ul className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
        {notes.map((n) => (
          <li key={n} className="flex items-center gap-1.5">
            <Icon name="information-line" /> {n}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Trust() {
  return (
    <Section>
      <Heading center eyebrow="Security" title="Your data stays yours" />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {m.trust.map((t) => (
          <div key={t.title}>
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-xl text-primary">
              <Icon name={t.icon} />
            </span>
            <h3 className="mt-4 font-semibold">{t.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Faq() {
  return (
    <Section id="faq">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Heading eyebrow="FAQ" title="Questions developers ask us" />
        <div className="divide-y rounded-2xl border bg-card">
          {m.faq.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <Icon name="add-line" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
              </summary>
              <p className="mt-2 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

function Cta({ signupOpen, trialDays, showPrices, quoteMode }) {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgb(255_255_255/0.2),transparent_45%)]" />
        <h2 className="relative mx-auto max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">{m.cta.title}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-primary-foreground/85">{signupOpen ? m.cta.textOpen.replace("{days}", trialDays) : m.cta.textInvite}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <TrialButton source="Closing call to action" size="lg" variant="secondary" />
          <Button
            size="lg"
            variant="ghost"
            leftIcon="price-tag-3-line"
            className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            nativeButton={false}
            render={<a href={quoteMode ? "#features" : "#pricing"} />}
          >
            {quoteMode ? "See features" : showPrices ? "See pricing" : "See plans"}
          </Button>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <Logo className="h-7" />
          <span>© {new Date().getFullYear()} PropFlow</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <LegalLink doc="terms" className="font-normal text-inherit hover:text-foreground hover:no-underline" />
          <LegalLink doc="privacy" className="font-normal text-inherit hover:text-foreground hover:no-underline" />
        </nav>
      </div>
    </footer>
  )
}

// propflowapp.com: the marketing home page. Plans and trial length are read live from the console.
export default async function HomePage({ searchParams }) {
  await connection()
  const site = await getSiteSettings()
  if (site.maintenance) return <Maintenance message={site.message} until={site.until} />
  const [pricing, { request }] = await Promise.all([publicPricing({ showPrices: site.pricesVisible }), searchParams])
  // With prices hidden the section is about what each plan includes
  // Prices hidden with the get-started wizard on: no plans, just the modules they pick
  const quoteMode = !site.pricesVisible && site.quoteRequests
  const nav = site.pricesVisible ? m.nav : m.nav.map((n) => (n.href === "#pricing" ? (quoteMode ? { href: "#get-started", label: "Get started" } : { ...n, label: "Plans" }) : n))
  // Links like /?request=trial (from the sign-up page) open that form on arrival
  const initial = ["trial", "sales", "quote"].includes(request) ? { kind: request, source: "Link" } : null
  return (
    <EnquiryProvider trialDays={pricing.trialDays} signupOpen={site.signupOpen} quote={quoteMode} initial={initial}>
      <StructuredData />
      <div data-site="web" className="min-h-svh overflow-x-clip bg-background text-foreground">
        <Header nav={nav} showSignIn={site.signInVisible} />
        <main>
          <Hero trialDays={pricing.trialDays} showPrices={pricing.showPrices} quoteMode={quoteMode} />
          <BuiltFor />
          <Pains />
          <Features />
          <Local />
          <Apps />
          <Pricing pricing={pricing} quoteMode={quoteMode} />
          <Trust />
          <Faq />
          <Cta signupOpen={site.signupOpen} trialDays={pricing.trialDays} showPrices={pricing.showPrices} quoteMode={quoteMode} />
        </main>
        <Footer />
      </div>
    </EnquiryProvider>
  )
}
