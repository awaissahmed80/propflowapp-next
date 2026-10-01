import { connection } from "next/server"
import { siteUrl } from "@/lib/sites"
import { getSiteSettings } from "@/server/platform-settings"
import { Analytics } from "@/modules/web/components/analytics"

// The public website (propflowapp.com). Only its pages are indexed: the root layout keeps the
// portal, sign-in and console out of search engines.
export const metadata = {
  metadataBase: new URL(siteUrl("web")),
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
}

export default async function WebLayout({ children }) {
  await connection()
  const site = await getSiteSettings()
  return (
    <>
      {children}
      {/* Google Analytics only on the website, never in workspaces (console Settings) */}
      {/* The console's ID wins over GA_MEASUREMENT_ID in .env */}
      {(site.analyticsId || site.analyticsEnvId) && !site.maintenance && <Analytics id={site.analyticsId || site.analyticsEnvId} askConsent={site.analyticsConsent} />}
    </>
  )
}
