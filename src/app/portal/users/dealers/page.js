import { usersPage } from "@/modules/users/server/context"
import { loadPeople } from "@/modules/users/server/load"
import { listDealers } from "@/modules/users/server/queries"
import { DealersView } from "@/modules/users/components/dealers-view"

export const metadata = { title: "Dealer Accounts" }

// External dealer firms and their logins
export default async function DealersPage() {
  const ctx = await usersPage("/users/dealers", "dealers")
  const data = await loadPeople(ctx)
  const dealers = await listDealers(ctx, data.members, data.invites)
  return <DealersView dealers={dealers} seats={data.seats} lists={data.lists} allowed={data.allowed} workspaceName={ctx.tenant.name} />
}
