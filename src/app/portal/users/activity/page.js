import { usersPage } from "@/modules/users/server/context"
import { listActivity } from "@/modules/users/server/queries"
import { ActivityView } from "@/modules/users/components/activity-view"

export const metadata = { title: "Activity Log" }

export default async function ActivityPage() {
  const ctx = await usersPage("/users/activity")
  const rows = await listActivity(ctx, { limit: 1000 })
  return <ActivityView rows={rows} />
}
