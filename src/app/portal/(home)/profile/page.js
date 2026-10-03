import { deskContext } from "@/modules/desk/server/context"
import { getLookups } from "@/modules/lookups/server"
import { ProfileView } from "@/modules/desk/components/profile-view"
import { DeskPage } from "@/modules/desk/components/desk-page"

export const metadata = { title: "Profile" }

export default async function ProfilePage() {
  const ctx = await deskContext("/profile")
  const lists = await getLookups(ctx.db, ["designation", "department", "member-status"])
  return (
    <DeskPage>
      <ProfileView me={ctx.me} user={{ name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarUrl }} workspace={ctx.tenant.name} lists={lists} />
    </DeskPage>
  )
}
