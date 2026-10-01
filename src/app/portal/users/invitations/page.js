import { usersPage } from "@/modules/users/server/context"
import { loadPeople } from "@/modules/users/server/load"
import { InvitationsView } from "@/modules/users/components/invitations-view"

export const metadata = { title: "Invitations" }

export default async function InvitationsPage() {
  const ctx = await usersPage("/users/invitations")
  const { invites, lists, options, allowed } = await loadPeople(ctx)
  return <InvitationsView invites={invites} lists={lists} options={options} allowed={allowed} workspaceName={ctx.tenant.name} />
}
