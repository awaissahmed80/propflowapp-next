import "server-only"
import { authDb, platformDb, tenantDb } from "@/server/db/connections"
import { tenantDbName } from "@/server/db/config"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { provisionTenant } from "@/server/tenants/provision"
import { logAudit } from "@/modules/console/server/audit"

// Turn an accepted workspace invitation into a working workspace:
//   1. claim the invitation (a link works once)
//   2. the owner's account (existing, or created here)
//   3. the tenant record, its apps (the plan's + always-on), and a subscription when it starts active
//   4. its own database pf_<code>: migrations, default roles and settings (provision.js)
//   5. the owner's membership with the workspace's Owner role
// Returns { tenant, user } or { error, field? }.

const DAY = 86_400_000

async function setting(db, key, fallback) {
  return (await db("settings").where({ key }).first("value"))?.value ?? fallback
}

export async function createWorkspace({ invite, company, person }) {
  const platform = platformDb()
  const auth = authDb()

  if (await live(platform, "tenants").where({ slug: company.slug }).first("id")) {
    return { error: "That short name was just taken. Choose another.", field: "slug" }
  }

  // 1. Claim the invitation
  const claimed = await platform("workspaceInvitations")
    .where({ id: invite.id })
    .whereNull("acceptedAt")
    .whereNull("revokedAt")
    .whereNull("deletedAt")
    .where("expiresAt", ">", new Date())
    .update({ acceptedAt: new Date() })
  if (!claimed) return { error: "This invitation has expired or was already used. Ask PropFlow for a new one." }
  const release = () => platform("workspaceInvitations").where({ id: invite.id }).update({ acceptedAt: null })

  // 2. The owner
  let user = person
  try {
    if (!user.id) {
      const now = new Date()
      const [id] = await auth("users").insert({
        name: person.name,
        email: person.email,
        phone: company.phone || null,
        passwordHash: person.passwordHash ?? null,
        googleSub: person.googleSub ?? null,
        avatarUrl: person.avatarUrl ?? null,
        // The invitation email (or Google) proves the address
        emailVerifiedAt: now,
        passwordChangedAt: person.passwordHash ? now : null,
      })
      user = { id, name: person.name, email: person.email }
    }
  } catch (err) {
    await release()
    if (err.code === "ER_DUP_ENTRY") return { error: "An account with this email was just created. Reload the page and sign in with it." }
    throw err
  }

  // 3. Tenant, apps and subscription
  const plan = await platform("plans").where({ id: invite.planId }).first("id", "name", "priceMonthly")
  const [trialDaysDefault, yearlyMonths] = await Promise.all([setting(platform, "trial_days", 15), setting(platform, "yearly_months_charged", 10)])
  const now = new Date()
  const trial = invite.startAs === "trial"
  const periodEnd = new Date(now)
  if (invite.billingCycle === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  else periodEnd.setMonth(periodEnd.getMonth() + 1)

  let tenant
  try {
    tenant = await platform.transaction(async (trx) => {
      const code = await nextCode(trx, "tenant")
      const [tenantId] = await trx("tenants").insert({
        code,
        slug: company.slug,
        name: company.name,
        ntn: company.ntn || null,
        city: company.city || null,
        phone: company.phone || null,
        email: invite.email,
        ownerUserId: user.id,
        planId: plan.id,
        billingCycle: invite.billingCycle,
        status: "provisioning",
        trialEndsAt: trial ? new Date(now.getTime() + (invite.trialDays ?? trialDaysDefault) * DAY) : null,
        currentPeriodEndsAt: trial ? null : periodEnd,
        dbName: tenantDbName(code),
        createdBy: invite.invitedBy,
      })
      // Apps and features: the invite's custom package if it has one, otherwise the plan's
      // (always-on apps come with every workspace). offFeatures: features left out, per app.
      const pkg = typeof invite.package === "string" ? JSON.parse(invite.package) : invite.package
      const planRows = await trx("planApps").where({ planId: plan.id }).select("appId", "offFeatures")
      const apps = await trx("apps")
        .whereNull("deletedAt")
        .where({ isActive: true })
        .where((q) => (pkg?.apps?.length ? q.where({ alwaysOn: true }).orWhereIn("code", pkg.apps) : q.where({ alwaysOn: true }).orWhereIn("id", planRows.map((r) => r.appId))))
        .select("id", "code")
      const offFor = (a) => {
        const keys = pkg?.apps?.length ? pkg.off?.[a.code] : planRows.find((r) => r.appId === a.id)?.offFeatures
        return Array.isArray(keys) && keys.length ? JSON.stringify(keys) : null
      }
      if (apps.length) await trx("tenantApps").insert(apps.map((a) => ({ tenantId, appId: a.id, enabledBy: invite.invitedBy, offFeatures: offFor(a) })))
      if (!trial) {
        const listPrice = invite.billingCycle === "yearly" ? plan.priceMonthly * yearlyMonths : plan.priceMonthly
        await trx("subscriptions").insert({
          tenantId,
          planId: plan.id,
          billingCycle: invite.billingCycle,
          price: invite.price ?? listPrice,
          startsAt: now,
          endsAt: periodEnd,
          status: "active",
          note: "Started from a workspace invitation",
          createdBy: invite.invitedBy,
        })
      }
      await trx("workspaceInvitations").where({ id: invite.id }).update({ tenantId, updatedAt: now })
      await logAudit(
        {
          actorUserId: user.id,
          action: "tenant.created",
          subjectType: "tenant",
          subjectId: tenantId,
          tenantId,
          details: { summary: `${company.name} (${code}) on ${plan.name}, ${trial ? `${invite.trialDays ?? trialDaysDefault}-day trial` : `active, billed ${invite.billingCycle}`}`, invitationId: invite.id },
        },
        trx
      )
      return { id: tenantId, code, dbName: tenantDbName(code), name: company.name }
    })
  } catch (err) {
    await release()
    if (err.code === "ER_DUP_ENTRY") return { error: "That short name was just taken. Choose another.", field: "slug" }
    throw err
  }

  // 4. Its own database
  const provisioned = await provisionTenant(tenant.id, { finalStatus: trial ? "trial" : "active", company: { name: company.name, city: company.city } })
  if (!provisioned.ok) {
    return { error: "Your workspace was created, but its setup didn't finish. Our team has been alerted and will email you when it's ready.", tenant, user }
  }

  // 5. The owner's membership, with the workspace's own Owner role
  const owner = await tenantDb({ dbName: tenant.dbName })("roles").where({ code: "owner" }).whereNull("deletedAt").first("id")
  const hasDefault = await live(auth, "memberships").where({ userId: user.id, isDefault: true }).first("id")
  await auth("memberships").insert({ userId: user.id, tenantId: tenant.id, roleId: owner.id, status: "active", isDefault: !hasDefault, joinedAt: new Date(), createdBy: user.id })

  return { tenant, user }
}
