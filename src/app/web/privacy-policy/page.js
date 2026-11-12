import { pageMetadata } from "@/modules/web/site/seo"
import { LegalPage } from "@/modules/web/components/legal-page"

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: "How PropFlow collects, uses and protects your information and your customers' data.",
  path: "/privacy-policy",
})

export default function PrivacyPolicyPage() {
  return <LegalPage doc="privacy" />
}
