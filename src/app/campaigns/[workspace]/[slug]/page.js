import { notFound } from "next/navigation"
import { PublicLeadForm } from "@/modules/campaigns/components/public-form"
import { LandingView } from "@/modules/campaigns/landing/landing-view"
import { publicWorkspace } from "@/modules/campaigns/server/forms"
import { publicPage, recordPageView } from "@/modules/campaigns/server/pages"
import { formCaptcha } from "@/modules/campaigns/server/settings"

// campaigns.<domain>/<workspace>/<slug>: a published landing page. Unpublished, unknown or a
// workspace not in use → 404. Each load counts a view (and a view of its form).

async function load(params) {
  const { workspace, slug } = await params
  const site = await publicWorkspace(workspace)
  if (!site) return null
  const found = await publicPage(site.db, slug)
  return found ? { site, found } : null
}

export async function generateMetadata({ params }) {
  const data = await load(params)
  if (!data) return { title: "Page not found" }
  const { page } = data.found
  const hero = page.sections.find((s) => s.type === "hero" && !s.hidden)
  const title = page.seo.title || hero?.headline || page.name
  const description = page.seo.description || hero?.subheadline || undefined
  const image = page.seo.image || hero?.image || undefined
  return {
    title: `${title} · ${data.site.tenant.name}`,
    description,
    // Published pages are meant to be found and shared
    robots: { index: true, follow: true },
    openGraph: { title, description, images: image ? [image] : undefined, type: "website" },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  }
}

export default async function PublicLandingPage({ params }) {
  const data = await load(params)
  if (!data) notFound()
  const { site, found } = data
  const [captcha] = await Promise.all([formCaptcha(site.db), recordPageView(site.db, found.id, found.formId)])
  const { page, form, cities } = found
  return (
    <LandingView
      page={page}
      workspace={{ name: site.tenant.name }}
      form={form ? <PublicLeadForm workspace={site.tenant.slug} workspaceName={site.tenant.name} form={form} page={page.code} accent={page.theme.accent} cities={cities} captcha={captcha} /> : null}
    />
  )
}
