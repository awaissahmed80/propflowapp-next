import { documentsPage } from "@/modules/documents/server/context"
import { documentsCan, expiringDocuments, projectOptions } from "@/modules/documents/server/queries"
import { documentsNavItem } from "@/modules/documents/nav"
import { ExpiringView } from "@/modules/documents/components/expiring-view"

export const metadata = { title: "Expiring" }

// NOCs, agreements and licenses expired or expiring within 90 days (feature: expiry)
export default async function ExpiringPage() {
  const ctx = await documentsPage("/documents/expiring", "expiry")
  const [groups, projects] = await Promise.all([expiringDocuments(ctx), projectOptions(ctx)])
  const { label, description } = documentsNavItem("/documents/expiring")
  return <ExpiringView groups={groups} title={label} description={description} projects={projects} can={documentsCan(ctx)} />
}
