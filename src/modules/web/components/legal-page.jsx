import { getSiteSettings } from "@/server/platform-settings"
import { SiteShell } from "../site/shell"
import { JsonLd, breadcrumbs } from "../site/seo"
import { LEGAL } from "../legal"
import { LegalDocument } from "./legal"

// /privacy-policy and /terms-and-conditions opened directly (from the site they open in a modal)
export async function LegalPage({ doc: key }) {
  const doc = LEGAL[key]
  const other = LEGAL[key === "terms" ? "privacy" : "terms"]
  const site = await getSiteSettings()
  return (
    <SiteShell site={site} closing={false}>
      <JsonLd graph={[breadcrumbs([{ name: doc.title, path: `/${doc.slug}` }])]} />
      <div className="pf-container max-w-3xl pt-36 pb-24 lg:pt-44">
        <h1 className="text-[clamp(2.2rem,1.4rem+3vw,3.5rem)] leading-tight font-extrabold tracking-[-0.03em]">{doc.title}</h1>
        <LegalDocument doc={doc} className="mt-10 text-[1.0625rem] [&_li]:text-[var(--text-2)]" />
        <p className="mt-12 text-[var(--text-2)]">
          See also our{" "}
          <a href={`/${other.slug}`} className="pf-link">
            {other.title}
          </a>
          .
        </p>
      </div>
    </SiteShell>
  )
}
