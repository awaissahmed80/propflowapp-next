import { estatePage } from "@/modules/estate/server/context"
import { ComingSoon } from "@/components/coming-soon"

export const metadata = { title: "Owners" }

export default async function OwnersPage() {
  await estatePage("/estate/owners", "resale")
  return (
    <ComingSoon
      title="Owners"
      description="Property owners and landlords with their CNIC and documents"
      icon="contacts-book-2-line"
      points={["Owners and landlords with CNIC and contact details", "Their properties, listings and tenancies in one place", "Documents kept securely in Documents"]}
    />
  )
}
