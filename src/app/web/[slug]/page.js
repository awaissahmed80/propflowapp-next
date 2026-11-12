import { notFound } from "next/navigation"
import { connection } from "next/server"
import { getSiteSettings } from "@/server/platform-settings"
import { Maintenance } from "@/modules/web/components/maintenance"
import { SiteShell } from "@/modules/web/site/shell"
import { Icon } from "@/components/ui/icon"
import { PRODUCT_PAGES, pageBySlug } from "@/modules/web/site/pages"
import { JsonLd, breadcrumbs, faqPage, pageMetadata, software } from "@/modules/web/site/seo"
import { Faq, FeatureRow, Hero, Section, SectionHeading } from "@/modules/web/site/sections"

// One page per product search (real estate CRM in Pakistan, housing society software...), from
// PRODUCT_PAGES. Unknown slugs are a 404.
export const dynamicParams = false
export function generateStaticParams() {
  return PRODUCT_PAGES.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }) {
  const page = pageBySlug((await params).slug)
  if (!page) return {}
  return pageMetadata({ title: page.title, description: page.description, path: `/${page.slug}`, keywords: page.keywords })
}

export default async function ProductPage({ params }) {
  const page = pageBySlug((await params).slug)
  if (!page) notFound()
  await connection()
  const site = await getSiteSettings()
  if (site.maintenance) return <Maintenance message={site.message} until={site.until} />
  const apps = { appStore: site.appStoreUrl, playStore: site.playStoreUrl }
  const related = page.related.map(pageBySlug).filter(Boolean)

  return (
    <SiteShell site={site}>
      <JsonLd
        graph={[
          { "@type": "WebPage", name: page.title, description: page.description, inLanguage: "en-PK", about: { "@type": "Thing", name: page.menu } },
          software({ description: page.description, apps }),
          breadcrumbs([{ name: page.menu, path: `/${page.slug}` }]),
          faqPage(page.faq),
        ]}
      />
      <Hero
        badge={page.menu}
        title={page.h1[0]}
        accent={page.h1[1]}
        text={page.lead}
        source={`Product page: ${page.menu}`}
        secondary={{ href: "#what", label: "What it does" }}
        note="Free 30-minute demo · Set up with your own projects"
        screen={page.hero.screen}
        alt={page.hero.alt}
        lenses={page.modules.slice(0, 2).map((x, i) => ({ screen: x.screen, callout: x.callout, label: x.title, className: i ? "-left-10 -bottom-10 w-[26%]" : "-right-8 -top-8 w-[30%]" }))}
      />

      <Section id="what" labelledBy="what-title">
        <SectionHeading center id="what-title" eyebrow={page.menu} title="A closer look, screen by screen" text="Real screens from a demo workspace. Your own projects, people and numbers fill them once you start." />
        <div className="mt-20 space-y-28 lg:space-y-36">
          {page.modules.map((x, i) => (
            <FeatureRow key={x.title} index={i} reverse={i % 2 === 1} title={x.title} text={x.text} screen={x.screen} callout={x.callout} alt={x.title} />
          ))}
        </div>
      </Section>

      <Faq title="Common questions" faq={page.faq} />

      <Section labelledBy="related-title" className="bg-[var(--surface)]">
        <SectionHeading id="related-title" eyebrow="Works with" title="The rest of PropFlow, on the same data" />
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {related.map((r, i) => (
            <li key={r.slug} data-reveal style={{ "--delay": `${i * 80}ms` }}>
              <a href={`/${r.slug}`} className="pf-card group block h-full p-6">
                <span className="text-lg font-bold">{r.menu}</span>
                <span className="mt-2 block text-[var(--text-2)]">{r.blurb}</span>
                <span className="pf-link mt-5">
                  Learn more <Icon name="arrow-right-line" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </SiteShell>
  )
}
