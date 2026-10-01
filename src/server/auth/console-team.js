import "server-only"
import { authDb, platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { logAudit } from "@/modules/console/server/audit"
import { roleLabel } from "@/modules/console/roles"

export const INVITE_GONE = "This invitation has expired or was already used. Ask whoever invited you to send a new one."

// Accept a console invitation for a person: an existing user { id, name, email }, or a new one
// { name, email, passwordHash?, googleSub?, avatarUrl? } who is created here. Adds them to the console team
// with the invited role and marks the invitation used (claimed first, so a link works once).
// Returns { user } or { error }.
export async function joinConsoleTeam(invite, person) {
  const auth = authDb()
  const claimed = await auth("invitations")
    .where({ id: invite.id })
    .whereNull("acceptedAt")
    .whereNull("revokedAt")
    .where("expiresAt", ">", new Date())
    .update({ acceptedAt: new Date() })
  if (!claimed) return { error: INVITE_GONE }

  let user = person
  try {
    if (!user.id) {
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

    const platform = platformDb()
    const member = await live(platform, "platformStaff").where({ userId: user.id }).first("id")
    if (member) {
      await platform("platformStaff").where({ id: member.id }).update({ role: invite.consoleRole, isActive: true, updatedAt: new Date(), updatedBy: invite.invitedBy })
    } else {
      await platform("platformStaff").insert({ userId: user.id, role: invite.consoleRole, createdBy: invite.invitedBy })
    }
    await auth("invitations").where({ id: invite.id }).update({ acceptedUserId: user.id, updatedAt: new Date() })
  } catch (err) {
    // Give the invitation back so they can try again
    await auth("invitations").where({ id: invite.id }).update({ acceptedAt: null })
    if (err.code === "ER_DUP_ENTRY") return { error: "An account with this email was just created. Reload the page and sign in with it." }
    throw err
  }

  await logAudit({ actorUserId: user.id, action: "team.joined", subjectType: "user", subjectId: user.id, details: { summary: `${user.name} as ${roleLabel(invite.consoleRole)}`, invitationId: invite.id } })
  return { user }
}
