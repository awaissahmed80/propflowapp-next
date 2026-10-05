import { deskContext } from "@/modules/desk/server/context"
import { getLookups } from "@/modules/lookups/server"
import { ProfileView } from "@/modules/desk/components/profile-view"
import { DeskPage } from "@/modules/desk/components/desk-page"
import { getLockSettings } from "@/server/auth/screen-lock"

export const metadata = { title: "Profile" }

export default async function ProfilePage() {
  const ctx = await deskContext("/profile")
  const [lists, lock] = await Promise.all([getLookups(ctx.db, ["designation", "department", "member-status"]), ctx.session.impersonatorUserId ? null : getLockSettings(ctx.user.id)])
  return (
    <DeskPage>
      <ProfileView me={ctx.me} user={{ name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarUrl }} workspace={ctx.tenant.name} lists={lists} lock={lock} />
    </DeskPage>
  )
}
