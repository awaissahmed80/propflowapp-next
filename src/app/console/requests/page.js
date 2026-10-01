import { requireArea } from "@/modules/console/server/access"
import { listRequests } from "@/modules/console/server/queries"
import { RequestsTable } from "@/modules/console/components/requests-table"

export const metadata = { title: "Workspace Requests" }

export default async function RequestsPage() {
  await requireArea("requests", "/requests")
  return <RequestsTable list={await listRequests()} />
}
