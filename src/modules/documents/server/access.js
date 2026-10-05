import "server-only"
import { can, isFullAccess, roleAccess } from "@/modules/users/permissions"

// Who may see a company document, by its type's "Who can see" (Documents › Customize › Document
// types): everyone (dealers too) · staff (not dealer logins) · buyers (needs contacts.cnic) ·
// hr (needs hr.salaries) · finance (needs Finance view). Used by the Documents pages and by the
// file route, so a link can't reach a document the list hides.
//   role: { code, permissions, scope, grants } · types: document-type lookup values ({ value, meta })
export function typeAccess(role, types) {
  const permissions = role?.permissions ?? []
  const full = isFullAccess(permissions)
  const { grants } = roleAccess({ permissions, scope: role?.scope, grants: role?.grants })
  const dealer = role?.code === "dealer"
  const ok = (rule) => {
    if (full) return true
    if (rule === "everyone") return true
    if (dealer) return false
    if (rule === "buyers") return Boolean(grants["contacts.cnic"])
    if (rule === "hr") return Boolean(grants["hr.salaries"])
    if (rule === "finance") return can(permissions, "finance", "view")
    return true // staff
  }
  const visible = new Set(types.filter((t) => ok(t.meta?.access ?? "staff")).map((t) => t.value))
  return { canSeeType: (type) => visible.has(type), visibleTypes: [...visible] }
}

// Can share a document type outside the workspace? Never buyer, HR or finance files.
export const SHAREABLE = (rule) => rule === "everyone" || rule === "staff"
