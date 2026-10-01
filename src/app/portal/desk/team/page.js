import { notFound } from "next/navigation"
import { deskContext } from "@/modules/desk/server/context"
import { getLookups } from "@/modules/lookups/server"
import { can, isFullAccess } from "@/modules/users/permissions"
import { MyTeamView } from "@/modules/desk/components/my-team-view"

export const metadata = { title: "My team" }

export default async function MyTeamPage() {
  const ctx = await deskContext("/desk/team")
  if (!ctx.teams.length) notFound()
  const lists = await getLookups(ctx.db, ["designation"])
  return <MyTeamView teams={ctx.teams} currentUserId={ctx.user.id} lists={lists} canManage={isFullAccess(ctx.permissions) || can(ctx.permissions, "users", "edit")} />
}
