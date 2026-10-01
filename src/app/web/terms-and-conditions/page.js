import { LegalPage } from "@/modules/web/components/legal-page"

export const metadata = {
  title: "Terms & Conditions",
  description: "The terms for using the PropFlow website and platform, including the free trial, payments and your data.",
  alternates: { canonical: "/terms-and-conditions" },
}

export default function TermsPage() {
  return <LegalPage doc="terms" />
}
