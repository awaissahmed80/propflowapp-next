import "server-only"
import { platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { hashToken } from "@/server/auth/secrets"
import { slugProblem } from "@/lib/workspace"

// A workspace invitation that can still be used to set up a workspace, or null
export async function findWorkspaceInvite(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null
  return platformDb()("workspaceInvitations as wi")
    .join("plans as p", "p.id", "wi.planId")
    .where("wi.tokenHash", hashToken(token))
    .whereNull("wi.deletedAt")
    .whereNull("wi.acceptedAt")
    .whereNull("wi.revokedAt")
    .where("wi.expiresAt", ">", new Date())
    .first(
      "wi.id",
      "wi.email",
      "wi.contactName",
      "wi.phone",
      "wi.companyName",
      "wi.planId",
      "wi.billingCycle",
      "wi.startAs",
      "wi.trialDays",
      "wi.price",
      "wi.invitedBy",
      "wi.expiresAt",
      "p.name as planName",
      "p.maxProjects",
      "p.maxUsers",
    )
}

// null when the short name can be used, otherwise why not
export async function slugUnavailable(slug) {
  const problem = slugProblem(slug)
  if (problem) return problem
  const taken = await live(platformDb(), "tenants").where({ slug }).first("id")
  return taken ? "That short name is taken. Try another." : null
}
