import { LegalPage } from "@/modules/web/components/legal-page"
import { pageMetadata } from "@/modules/web/site/seo"

export const metadata = pageMetadata({
  title: "Terms & Conditions",
  description: "The terms for using the PropFlow website and platform, including the free trial, payments and your data.",
  path: "/terms-and-conditions",
})

export default function TermsPage() {
  return <LegalPage doc="terms" />
}
