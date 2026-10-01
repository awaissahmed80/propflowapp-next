import { usersPage } from "@/modules/users/server/context"
import { loadPeople } from "@/modules/users/server/load"
import { listActivity } from "@/modules/users/server/queries"
import { OverviewView } from "@/modules/users/components/overview-view"

export const metadata = { title: "Overview" }

export default async function UsersOverviewPage() {
  const ctx = await usersPage("/users")
  const [data, activity] = await Promise.all([loadPeople(ctx), listActivity(ctx, { limit: 7 })])
  return <OverviewView members={data.members} invites={data.invites} teams={data.teams} seats={data.seats} activity={activity} options={data.options} allowed={data.allowed} workspaceName={ctx.tenant.name} />
}
