import { loadGuide } from "@/modules/guide/server"
import { GuideView } from "@/modules/guide/components/guide-view"

export const metadata = { title: "User Guide" }

// /guide: how to use PropFlow, for the person's role. Owners and administrators can see it as any
// role (?role=sales-agent), to know what their people see.
export default async function GuidePage({ searchParams }) {
  const data = await loadGuide("/guide", (await searchParams).role)
  return <GuideView {...data} />
}
