import "server-only"
import { notFound } from "next/navigation"
import { tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { requireTenant } from "@/server/auth/dal"
import { canOpenApp } from "@/modules/portal/access"
import { canSetUp } from "@/modules/portal/server/setup"

// Settings pages: anyone whose role opens Settings may look; changing company details needs
// setup rights (owner, admin or a settings permission). Lists are checked per list on save.
export async function settingsPage(path) {
  const session = await requireTenant(path)
  const db = tenantDb({ dbName: session.tenant.dbName, dbHost: session.tenant.dbHost })
  const role = await live(db, "roles").where({ id: session.membership.roleId }).first("permissions")
  const permissions = role?.permissions ?? []
  if (!canOpenApp(permissions, "settings")) notFound()
  return { session, tenant: session.tenant, db, permissions, canEdit: canSetUp(permissions) }
}
