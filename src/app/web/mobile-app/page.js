import { connection } from "next/server"
import { CONTENT as m } from "@/modules/web/content"
import { getSiteSettings } from "@/server/platform-settings"
import { Maintenance } from "@/modules/web/components/maintenance"
import { StoreBadges } from "@/modules/web/components/store-badges"
import { SiteShell } from "@/modules/web/site/shell"
import { DemoButton } from "@/modules/web/site/demo"
import { JsonLd, breadcrumbs, faqPage, pageMetadata } from "@/modules/web/site/seo"
import { Faq, IconCards, Phones, Section, SectionHeading } from "@/modules/web/site/sections"
import { siteUrl } from "@/lib/sites"

export const metadata = pageMetadata({
  title: "Real Estate CRM App for iPhone & Android",
  description: "The PropFlow app keeps your sales team on top of every lead away from the office: calls, follow-ups, approvals and live availability, on iPhone and Android.",
  path: "/mobile-app",
  keywords: ["real estate CRM app Pakistan", "property sales app for agents", "CRM mobile app iPhone Android"],
})

const FAQ = [
  { q: "Who can use the app?", a: "Anyone with a PropFlow login. It signs in to the same workspace as the web, with the same roles, so agents see their own leads and managers see their team's." },
  { q: "Does it cost extra?", a: "No. The app is free to download and comes with every PropFlow workspace." },
  { q: "Do follow-ups remind the agent?", a: "Yes. The app sends a notification when a follow-up is due, along with new leads assigned to them and requests waiting for their approval." },
  { q: "What if there's no signal on site?", a: "The app needs a connection to save a call or a note. Agents can check today's list before heading out, and log the visit as soon as they're back in range." },
]

export default async function MobileAppPage() {
  await connection()
  const site = await getSiteSettings()
  if (site.maintenance) return <Maintenance message={site.message} until={site.until} />
  const apps = { appStore: site.appStoreUrl, playStore: site.playStoreUrl }
  const a = m.mobile
  const software = {
    "@type": "MobileApplication",
    name: "PropFlow",
    description: metadata.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: [apps.appStore && "iOS", apps.playStore && "Android"].filter(Boolean).join(", ") || "iOS, Android",
    offers: { "@type": "Offer", price: 0, priceCurrency: "PKR" },
    url: siteUrl("web", "/mobile-app"),
    ...(apps.appStore || apps.playStore ? { sameAs: [apps.appStore, apps.playStore].filter(Boolean) } : {}),
  }

  return (
    <SiteShell site={site}>
      <JsonLd graph={[software, breadcrumbs([{ name: "Mobile app", path: "/mobile-app" }]), faqPage(FAQ)]} />
      <section className="pf-hero-bg relative overflow-hidden pt-32 pb-16 lg:pt-40">
        <div aria-hidden className="pf-grid-lines absolute inset-0" />
        <div className="pf-container relative grid items-center gap-14 lg:grid-cols-2">
          <div>
            <p className="pf-rise pf-eyebrow">Mobile app for iPhone & Android</p>
            <h1 className="pf-slide mt-4 text-[clamp(2.4rem,1.3rem+4vw,4.25rem)] leading-[1.05] font-extrabold tracking-[-0.035em]" style={{ "--delay": "80ms" }}>
              Your sales desk, <span className="bg-gradient-to-r from-[#1528a0] to-[#3d63e8] bg-clip-text text-transparent">in every pocket</span>
            </h1>
            <p className="pf-slide mt-6 max-w-xl text-lg text-[var(--text-2)]" style={{ "--delay": "160ms" }}>
              {a.text}
            </p>
            <div className="pf-rise mt-9" style={{ "--delay": "240ms" }}>
              {apps.appStore || apps.playStore ? <StoreBadges links={apps} location="Mobile app page" /> : <DemoButton source="Mobile app page" />}
            </div>
          </div>
          <Phones className="mx-auto max-w-[480px]" />
        </div>
      </section>

      <Section labelledBy="does-title" className="bg-[var(--surface)]">
        <SectionHeading center id="does-title" eyebrow="What it does" title="Everything agents need between site visits" />
        <div className="mt-14">
          <IconCards columns={4} items={a.points} />
        </div>
      </Section>

      <Faq title="About the app" faq={FAQ} />
    </SiteShell>
  )
}
