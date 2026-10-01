import { LegalPage } from "@/modules/web/components/legal-page"

export const metadata = { title: "Privacy Policy", description: "How PropFlow collects, uses and protects your information and your customers' data.", alternates: { canonical: "/privacy-policy" } }

export default function PrivacyPolicyPage() {
  return <LegalPage doc="privacy" />
}
