/* eslint-disable @next/next/no-img-element -- pre-sized webp */
import { connection } from "next/server"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { CONTENT as m } from "@/modules/web/content"
import { publicPricing } from "@/modules/web/server/pricing"
import { getDynamicPricing } from "@/server/dynamic-pricing"
import { getSiteSettings } from "@/server/platform-settings"
import { Maintenance } from "@/modules/web/components/maintenance"
import { SiteShell } from "@/modules/web/site/shell"
import { FlowSlider } from "@/modules/web/site/flow"
import { PlanCalculator } from "@/modules/web/site/plan"
import { PHOTOS } from "@/modules/web/site/photos"
import { JsonLd, faqPage, pageMetadata, software, website } from "@/modules/web/site/seo"
import { BuiltFor, Faq, FeatureRow, Hero, IconCards, MobileBand, Section, SectionHeading } from "@/modules/web/site/sections"

export const metadata = pageMetadata({ title: m.title, description: m.description, path: "/", keywords: m.keywords, absolute: true })

// The feature rows, each linking to its product page
const ROWS = [
  ["inventory", "housing-society-management-software"],
  ["crm", "real-estate-crm-pakistan"],
  ["operations", "installment-management-software"],
  ["estate", "transfer-ndc-management"],
  ["finance", "real-estate-accounting-software"],
  ["campaigns", "property-marketing-software"],
]

// propflowapp.com: the home page. Every action leads to "Book a demo".
export default async function HomePage({ searchParams }) {
  await connection()
  const site = await getSiteSettings()
  if (site.maintenance) return <Maintenance message={site.message} until={site.until} />
  const [pricing, dynamic, { request }] = await Promise.all([publicPricing({ showPrices: site.pricesVisible }), getDynamicPricing(), searchParams])
  const apps = { appStore: site.appStoreUrl, playStore: site.playStoreUrl }
  const prices =
    dynamic.mode === "dynamic" ? [Number(dynamic.pricing.baseMonthly)].filter((n) => n > 0) : pricing.showPrices ? pricing.plans.map((p) => Number(p.monthly)).filter((n) => n > 0) : []
  // Old links (/?request=trial, sales, quote) and new ones (/?request=demo) open the demo form
  const initialDemo = ["demo", "trial", "sales", "quote"].includes(request)
  const rows = ROWS.map(([id, slug]) => ({ ...m.features.find((f) => f.id === id), slug }))
  const photo = PHOTOS.lahore

  return (
    <SiteShell site={site} initialDemo={initialDemo}>
      <JsonLd graph={[website(), software({ description: m.description, apps, prices }), faqPage(m.faq)]} />

      <Hero
        badge="For developers, builders and housing societies"
        title="The real estate CRM & ERP"
        accent="built for Pakistan"
        text="Run every project from the first enquiry to possession: plots and files in Marla and Kanal, bookings and installments, transfers, NDCs and the books. One system, one login."
        secondary={{ href: "#how", label: "See how it works" }}
        note="Free 30-minute demo · Set up with your own projects"
        screen="portfolio-overview"
        url="portal.propflowapp.com/project-portfolio"
        alt="PropFlow Project Portfolio: projects, approvals, availability and stock at a glance"
        lenses={[
          { screen: "portfolio-overview", callout: "stock", label: "Available stock, valued in Crore", className: "-right-8 -top-8 w-[30%]" },
          { screen: "portfolio-overview", callout: "approval", label: "LDA approval and NOC status", className: "-left-10 -bottom-8 w-[17%]" },
        ]}
      />
      <BuiltFor items={m.builtFor} />

      <Section labelledBy="pains-title">
        <SectionHeading center id="pains-title" eyebrow="Why developers switch" title="Registers, Excel and WhatsApp groups only go so far" />
        <div className="mt-14">
          <IconCards items={m.pains.items.map((p) => ({ icon: p.icon, title: p.title, text: p.before, after: p.after }))} />
        </div>
      </Section>

      <Section id="how" labelledBy="how-title" className="bg-[var(--surface)]">
        <SectionHeading center id="how-title" eyebrow="How it works" title="One plot, from first enquiry to possession" text="Drag through the stages to see where each step happens in PropFlow." />
        <div data-reveal className="mt-14">
          <FlowSlider />
        </div>
      </Section>

      <Section id="features" labelledBy="features-title">
        <SectionHeading center id="features-title" eyebrow="Features" title="Everything a developer runs, in one system" text="Each part is built around how property is sold, collected and handed over in Pakistan." />
        <div className="mt-20 space-y-28 lg:space-y-36">
          {rows.map((f, i) => (
            <FeatureRow key={f.id} index={i} reverse={i % 2 === 1} eyebrow={f.eyebrow} title={f.title} text={f.text} points={f.points} screen={f.screen} alt={`${f.eyebrow}: ${f.title}`} href={`/${f.slug}`} link={`More on ${f.eyebrow.toLowerCase()}`} />
          ))}
        </div>
      </Section>

      <section id="local" aria-labelledby="local-title" className="pf-navy relative overflow-hidden py-24 lg:py-32">
        <img aria-hidden src={photo.src} alt="" width={photo.width} height={photo.height} loading="lazy" data-parallax="0.1" className="absolute inset-0 -top-[10%] h-[120%] w-full object-cover opacity-[0.12] mix-blend-luminosity" />
        <div className="pf-container relative">
          <SectionHeading center dark id="local-title" eyebrow={m.local.eyebrow} title={m.local.title} text={m.local.text} />
          <div className="mt-14">
            <IconCards dark columns={4} items={m.local.items} />
          </div>
          <p className="mt-10 text-center text-[13px] text-white/50">
            Background: “{photo.credit.title}” by {photo.credit.by},{" "}
            <a href={photo.credit.licenseUrl} target="_blank" rel="noopener" className="underline">
              {photo.credit.license}
            </a>
            , via{" "}
            <a href={photo.credit.page} target="_blank" rel="noopener" className="underline">
              Wikimedia Commons
            </a>
          </p>
        </div>
      </section>

      <Section id="plan" labelledBy="plan-title">
        <SectionHeading center id="plan-title" eyebrow="Try it" title="Type the deal, get the payment plan" text="Change the booking note and watch the schedule PropFlow works out: down payment, installments and possession, in Lac and Crore." />
        <div data-reveal className="mx-auto mt-14 max-w-5xl">
          <PlanCalculator />
        </div>
      </Section>

      <Section id="apps" labelledBy="apps-title" className="bg-[var(--surface)]">
        <SectionHeading center id="apps-title" eyebrow="One login, every app" title="Every department on the same data" text="Start with inventory and CRM. Operations, estate management, finance and HR plug into the same records as you grow, so nothing is typed twice." />
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {m.apps.map((a, i) => (
            <li key={a.name} data-reveal style={{ "--delay": `${(i % 3) * 70}ms` }} className="pf-card flex gap-4 p-5" data-hover="">
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-xl text-white", a.color)}>
                <Icon name={a.icon} aria-hidden />
              </span>
              <span>
                <span className="block font-bold">{a.name}</span>
                <span className="mt-0.5 block text-[15px] text-[var(--text-2)]">{a.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {(apps.appStore || apps.playStore) && <MobileBand apps={apps} text={m.mobile.text} points={m.mobile.points} />}

      <Faq faq={m.faq} />
    </SiteShell>
  )
}
