import { deskContext } from "@/modules/desk/server/context"
import { getLookups } from "@/modules/lookups/server"
import { ProfileView } from "@/modules/desk/components/profile-view"
import { DeskPage } from "@/modules/desk/components/desk-page"
import { getLockSettings } from "@/server/auth/screen-lock"
import { authDb } from "@/server/db/connections"
import { describeDevice } from "@/server/auth/devices"

export const metadata = { title: "Profile" }

export default async function ProfilePage() {
  const ctx = await deskContext("/profile")
  const readOnly = Boolean(ctx.session.impersonatorUserId)
  const [lists, lock, account, sessions] = await Promise.all([
    getLookups(ctx.db, ["designation", "department", "member-status"]),
    readOnly ? null : getLockSettings(ctx.user.id),
    authDb()("users").where({ id: ctx.user.id }).first("passwordHash", "googleSub", "passwordChangedAt"),
    // Browsers signed in to this account (not console staff signed in as them)
    authDb()("sessions")
      .where({ userId: ctx.user.id })
      .whereNull("revokedAt")
      .whereNull("impersonatorUserId")
      .where("expiresAt", ">", new Date())
      .orderBy("lastSeenAt", "desc")
      .limit(20)
      .select("id", "userAgent", "ip", "lastSeenAt", "createdAt"),
  ])
  return (
    <DeskPage>
      <ProfileView
        me={ctx.me}
        user={{ name: ctx.user.name, email: ctx.user.email, avatarUrl: ctx.user.avatarUrl }}
        workspace={ctx.tenant.name}
        lists={lists}
        lock={lock}
        readOnly={readOnly}
        account={{ hasPassword: Boolean(account?.passwordHash), google: Boolean(account?.googleSub), passwordChangedAt: account?.passwordChangedAt ?? null }}
        sessions={sessions
          .map((x) => ({ key: String(x.id), ...describeDevice(x.userAgent), ip: x.ip, lastSeenAt: x.lastSeenAt, createdAt: x.createdAt, current: x.id === ctx.session.id }))
          .sort((a, b) => b.current - a.current)}
      />
    </DeskPage>
  )
}
