import { connection } from "next/server"
import { CONTENT as m } from "@/modules/web/content"
import { publicPricing } from "@/modules/web/server/pricing"
import { getDynamicPricing } from "@/server/dynamic-pricing"
import { getSiteSettings } from "@/server/platform-settings"
import { Maintenance } from "@/modules/web/components/maintenance"
import { EnquiryButton, EnquiryProvider } from "@/modules/web/components/enquiry"
import { GetStartedWizard } from "@/modules/web/components/get-started"
import { PricingPlans } from "@/modules/web/components/pricing"
import { SiteShell } from "@/modules/web/site/shell"
import { DemoButton } from "@/modules/web/site/demo"
import { JsonLd, breadcrumbs, faqPage, pageMetadata, software } from "@/modules/web/site/seo"
import { Faq } from "@/modules/web/site/sections"

export const metadata = pageMetadata({
  title: "Pricing: Real Estate CRM & ERP",
  description: "PropFlow pricing for Pakistani developers and housing societies: pay for the apps you use, with a free trial and setup with your own data.",
  path: "/pricing",
  keywords: ["real estate CRM price Pakistan", "housing society software price", "real estate ERP pricing"],
})

const FAQ_KEYS = ["How do we get started?", "Can we bring our existing inventory and leads?", "Who owns our data?", "Which apps are available today?"]

// Pricing, as the console sets it: dynamic pricing (the package wizard with prices), the plans,
// or, with prices hidden, the get-started wizard
export default async function PricingPage() {
  await connection()
  const site = await getSiteSettings()
  if (site.maintenance) return <Maintenance message={site.message} until={site.until} />
  const [pricing, dynamic] = await Promise.all([publicPricing({ showPrices: site.pricesVisible }), getDynamicPricing()])
  const builder =
    dynamic.mode === "dynamic"
      ? {
          pricing: dynamic.pricing,
          catalog: dynamic.catalog.filter((a) => dynamic.pricing.baseApps.includes(a.code) || dynamic.pricing.appPrices[a.code] != null),
          yearlyMonths: dynamic.yearlyMonths,
          trialDays: dynamic.trialDays,
        }
      : null
  const quoteMode = !builder && !site.pricesVisible && site.quoteRequests
  const apps = { appStore: site.appStoreUrl, playStore: site.playStoreUrl }
  const prices = builder ? [Number(builder.pricing.baseMonthly)].filter((n) => n > 0) : pricing.showPrices ? pricing.plans.map((p) => Number(p.monthly)).filter((n) => n > 0) : []
  const notes = [
    `${(builder ?? pricing).trialDays}-day free trial, no card needed`,
    !builder && pricing.extraUser && `Extra users Rs ${new Intl.NumberFormat("en-PK").format(pricing.extraUser)} per user a month`,
    (builder || pricing.showPrices) && "Prices exclude taxes",
  ].filter(Boolean)
  const faq = m.faq.filter((f) => FAQ_KEYS.includes(f.q))

  return (
    <SiteShell site={site}>
      <JsonLd graph={[software({ description: metadata.description, apps, prices }), breadcrumbs([{ name: "Pricing", path: "/pricing" }]), faqPage(faq)]} />
      <EnquiryProvider trialDays={(builder ?? pricing).trialDays} signupOpen={site.signupOpen} quote={quoteMode || Boolean(builder)}>
        <section className="pf-hero-bg relative overflow-hidden pt-32 pb-12 lg:pt-40">
          <div aria-hidden className="pf-grid-lines absolute inset-0" />
          <div className="pf-container relative text-center">
            <p className="pf-rise pf-eyebrow">Pricing</p>
            <h1 className="pf-slide mx-auto mt-4 max-w-3xl text-[clamp(2.4rem,1.3rem+4vw,4.25rem)] leading-[1.05] font-extrabold tracking-[-0.035em]" style={{ "--delay": "80ms" }}>
              Pay only for the apps <span className="bg-gradient-to-r from-[#1528a0] to-[#3d63e8] bg-clip-text text-transparent">you use</span>
            </h1>
            <p className="pf-slide mx-auto mt-6 max-w-2xl text-lg text-[var(--text-2)]" style={{ "--delay": "160ms" }}>
              {builder
                ? "Pick the apps your business needs and see the price as you go. Every package starts with a free trial."
                : "Every plan starts with a free trial with all its features. Not sure which you need? Book a demo and we’ll suggest one."}
            </p>
            <div className="pf-rise mt-8" style={{ "--delay": "240ms" }}>
              <DemoButton source="Pricing" />
            </div>
          </div>
        </section>
        <section id="get-started" aria-label="Plans and prices" className="scroll-mt-20 pb-20">
          <div className="pf-container">
            <h2 className="sr-only">Plans and prices</h2>
            {builder ? (
              <GetStartedWizard trialDays={builder.trialDays} pricing={builder} />
            ) : quoteMode ? (
              <GetStartedWizard trialDays={pricing.trialDays} />
            ) : pricing.plans.length ? (
              <PricingPlans plans={pricing.plans} yearlyMonths={pricing.yearlyMonths} popular={m.popularPlan} showPrices={pricing.showPrices} />
            ) : (
              <div className="text-center">
                <EnquiryButton kind="sales" source="Pricing" size="lg">
                  Ask for a quote
                </EnquiryButton>
              </div>
            )}
            <ul className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 text-[var(--text-2)]">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </section>
      </EnquiryProvider>
      <Faq title="Before you decide" faq={faq} />
    </SiteShell>
  )
}
