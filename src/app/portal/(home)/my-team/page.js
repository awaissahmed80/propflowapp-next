import { notFound } from "next/navigation"
import { deskContext } from "@/modules/desk/server/context"
import { getLookups } from "@/modules/lookups/server"
import { can, isFullAccess } from "@/modules/users/permissions"
import { MyTeamView } from "@/modules/desk/components/my-team-view"
import { DeskPage } from "@/modules/desk/components/desk-page"

export const metadata = { title: "My team" }

export default async function MyTeamPage() {
  const ctx = await deskContext("/my-team")
  if (!ctx.teams.length) notFound()
  const lists = await getLookups(ctx.db, ["designation"])
  return (
    <DeskPage>
      <MyTeamView teams={ctx.teams} currentUserId={ctx.user.id} lists={lists} canManage={isFullAccess(ctx.permissions) || can(ctx.permissions, "users", "edit")} />
    </DeskPage>
  )
}
