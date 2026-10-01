import { usersPage } from "@/modules/users/server/context"
import { listMembers, listRoles, workspaceApps } from "@/modules/users/server/queries"
import { RolesView } from "@/modules/users/components/roles-view"

export const metadata = { title: "Roles & Permissions" }

export default async function RolesPage() {
  const ctx = await usersPage("/users/roles")
  const [members, apps] = await Promise.all([listMembers(ctx), workspaceApps(ctx)])
  const roles = await listRoles(ctx, members)
  return <RolesView roles={roles} apps={apps.filter((a) => !a.alwaysOn)} canEdit={ctx.fullAccess} />
}
