import { usersPage } from "@/modules/users/server/context"
import { loadPeople } from "@/modules/users/server/load"
import { TeamsView } from "@/modules/users/components/teams-view"

export const metadata = { title: "Teams" }

export default async function TeamsPage() {
  const ctx = await usersPage("/users/teams")
  const { teams, members, lists, allowed } = await loadPeople(ctx)
  return <TeamsView teams={teams} members={members} lists={lists} allowed={allowed} />
}
