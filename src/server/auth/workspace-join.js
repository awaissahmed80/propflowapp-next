import "server-only"
import { authDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { saveProfile } from "@/modules/users/server/profile"
import { INVITE_GONE } from "@/server/auth/console-team"

// Accept a workspace invitation (findMemberInvite) for a person: an existing user { id, name, email }
// or a new one { name, email, passwordHash?, googleSub?, avatarUrl? } created here. Adds the
// membership with the invited role and their team / designation / department, and marks the
// invitation used (claimed first, so a link works once). Returns { user, tenantId } or { error }.
export async function joinWorkspace(invite, person) {
  const auth = authDb()
  const claimed = await auth("invitations")
    .where({ id: invite.id })
    .whereNull("acceptedAt")
    .whereNull("revokedAt")
    .where("expiresAt", ">", new Date())
    .update({ acceptedAt: new Date() })
  if (!claimed) return { error: INVITE_GONE }

  const giveBack = () => auth("invitations").where({ id: invite.id }).update({ acceptedAt: null })
  let user = person
  try {
    if (user.id) {
      const already = await live(auth, "memberships").where({ userId: user.id, tenantId: invite.tenantId }).first("status")
      if (already) {
        await auth("invitations").where({ id: invite.id }).update({ acceptedUserId: user.id, updatedAt: new Date() })
        return already.status === "active" ? { user, tenantId: invite.tenantId } : { error: "Your access to this workspace is suspended. Ask its administrator." }
      }
    } else {
      const now = new Date()
      const [id] = await auth("users").insert({
        name: person.name,
        email: person.email,
        passwordHash: person.passwordHash ?? null,
        googleSub: person.googleSub ?? null,
        avatarUrl: person.avatarUrl ?? null,
        // Opening the emailed link (or Google) proves the address
        emailVerifiedAt: now,
        passwordChangedAt: person.passwordHash ? now : null,
        createdBy: invite.invitedBy,
      })
      user = { id, name: person.name, email: person.email }
    }

    // The role may have been deleted since; fall back to none rather than fail
    const db = tenantDb(invite.tenant)
    const role = invite.role ?? (await live(db, "roles").whereNot({ code: "owner" }).orderBy("sortOrder", "desc").first("id"))
    const others = await live(auth, "memberships").where({ userId: user.id }).count({ n: "id" }).first()
    const now = new Date()
    await auth("memberships").insert({
      userId: user.id,
      tenantId: invite.tenantId,
      roleId: role.id,
      status: "active",
      isDefault: Number(others.n) === 0,
      joinedAt: now,
      createdBy: invite.invitedBy,
    })
    await auth("invitations").where({ id: invite.id }).update({ acceptedUserId: user.id, updatedAt: now })

    const details = invite.details ?? {}
    const team = details.teamId ? await live(db, "teams").where({ id: details.teamId }).first("id") : null
    const dealer = details.dealerId ? await live(db, "dealers").where({ id: details.dealerId }).first("id") : null
    await saveProfile(db, user.id, { teamId: team?.id ?? null, dealerId: dealer?.id ?? null, designation: details.designation ?? null, department: details.department ?? null, joinedAt: now }, user.id)
    await logActivity(db, { type: "invite", action: "member.joined", actorUserId: user.id, summary: `joined the workspace as ${invite.role?.name ?? "a member"}`, subjectType: "user", subjectId: user.id })
  } catch (err) {
    // Give the invitation back so they can try again
    await giveBack()
    if (err.code === "ER_DUP_ENTRY") return { error: "An account with this email was just created. Reload the page and sign in with it." }
    throw err
  }
  return { user, tenantId: invite.tenantId }
}
