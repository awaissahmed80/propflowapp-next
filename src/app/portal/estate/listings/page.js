import { estatePage } from "@/modules/estate/server/context"
import { ComingSoon } from "@/components/coming-soon"

export const metadata = { title: "Listings" }

export default async function ListingsPage() {
  await estatePage("/estate/listings", "resale")
  return (
    <ComingSoon
      title="Listings"
      description="Resale and rental stock, portal syndication and enquiries"
      icon="home-4-line"
      points={["Resale and rental listings with photos, price and owner", "Publish to property portals and your website", "Enquiries on each listing flow into CRM"]}
    />
  )
}
