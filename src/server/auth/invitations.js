import "server-only"
import { authDb, platformDb, tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashToken } from "@/server/auth/secrets"

const OPEN_WORKSPACE = ["trial", "active", "past_due"]

// An invitation that can still be accepted, or null (unknown, used, cancelled or expired).
// kind "console" joins the PropFlow team; kind "tenant" joins a workspace.
export async function findInvite(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null
  return live(authDb(), "invitations")
    .where({ tokenHash: hashToken(token) })
    .whereNull("acceptedAt")
    .whereNull("revokedAt")
    .where("expiresAt", ">", new Date())
    .first("id", "kind", "email", "name", "tenantId", "roleId", "consoleRole", "details", "invitedBy", "expiresAt")
}

export async function findConsoleInvite(token) {
  const invite = await findInvite(token)
  return invite?.kind === "console" ? invite : null
}

// A workspace invitation with its workspace and role, while the workspace is open
export async function findMemberInvite(token) {
  const invite = await findInvite(token)
  if (invite?.kind !== "tenant") return null
  const tenant = await live(platformDb(), "tenants").where({ id: invite.tenantId }).first("id", "code", "name", "status", "dbName", "dbHost")
  if (!tenant || !OPEN_WORKSPACE.includes(tenant.status)) return null
  const role = await live(tenantDb(tenant), "roles").where({ id: invite.roleId }).first("id", "name", "description")
  return { ...invite, tenant, role }
}

// Does the invited email already have a PropFlow account?
export async function accountFor(email) {
  return live(authDb(), "users").where({ email }).first("id", "name", "status")
}
