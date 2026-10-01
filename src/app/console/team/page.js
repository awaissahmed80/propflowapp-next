import { requireArea } from "@/modules/console/server/access"
import { listTeam, listTeamInvites } from "@/modules/console/server/queries"
import { can } from "@/modules/console/roles"
import { TeamView } from "@/modules/console/components/team-view"

export const metadata = { title: "Team" }

export default async function TeamPage() {
  const staff = await requireArea("team", "/team")
  const manage = can(staff.role, "team")
  const [team, invites] = await Promise.all([listTeam(), manage ? listTeamInvites() : []])
  return <TeamView team={team} invites={invites} currentUserId={staff.user.id} manage={manage} />
}
