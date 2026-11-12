import { siteUrl } from "@/lib/sites"

// Metadata and structured data shared by the website's pages

export const OG_IMAGE = { url: "/api/og", width: 1200, height: 630, alt: "PropFlow: real estate CRM & ERP, built for Pakistan" }

// Page metadata with canonical URL, Open Graph and Twitter cards
export function pageMetadata({ title, description, path, keywords, absolute = false }) {
  return {
    title: absolute ? { absolute: title } : title,
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName: "PropFlow", title, description, locale: "en_PK", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
    category: "business",
  }
}

export const ORG_ID = () => `${siteUrl("web")}#organization`

export function organization() {
  const home = siteUrl("web")
  return { "@type": "Organization", "@id": ORG_ID(), name: "PropFlow", url: home, logo: siteUrl("web", "/images/propflow-logo-light.svg"), areaServed: "PK" }
}

// The site itself, so search results can show "PropFlow" as the site name
export function website() {
  const home = siteUrl("web")
  return { "@type": "WebSite", "@id": `${home}#website`, name: "PropFlow", alternateName: "PropFlow Real Estate CRM", url: home, inLanguage: "en-PK", publisher: { "@id": ORG_ID() } }
}

export function breadcrumbs(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: siteUrl("web", b.path === "/" ? "" : b.path) })),
  }
}

export function faqPage(faq) {
  return { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
}

export function software({ description, apps = {}, prices = [] }) {
  return {
    "@type": "SoftwareApplication",
    name: "PropFlow",
    url: siteUrl("web"),
    description,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Real estate CRM and ERP",
    operatingSystem: ["Web browser", apps.appStore && "iOS", apps.playStore && "Android"].filter(Boolean).join(", "),
    areaServed: "PK",
    publisher: { "@id": ORG_ID() },
    ...(prices.length ? { offers: { "@type": "AggregateOffer", priceCurrency: "PKR", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length } } : {}),
  }
}

// <JsonLd graph={[...]} />: "<" escaped so the JSON can never close the script tag
export function JsonLd({ graph }) {
  const data = { "@context": "https://schema.org", "@graph": [organization(), ...graph.filter(Boolean)] }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
}
