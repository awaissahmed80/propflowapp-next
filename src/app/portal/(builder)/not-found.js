import { NotFoundPage } from "@/components/error-pages"

export const metadata = { title: "Page not found" }

// Inside Campaigns: keeps the app's sidebar
export default function CampaignsNotFound() {
  return <NotFoundPage full={false} home={{ href: "/campaigns", label: "Back to Campaigns" }} text="It may have been removed, or it isn't yours to see. Check the address, or head back into Campaigns." />
}
