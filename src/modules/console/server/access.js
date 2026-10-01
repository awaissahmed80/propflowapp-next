import "server-only"
import { redirect } from "next/navigation"
import { requireStaff } from "@/server/auth/dal"
import { canView } from "@/modules/console/roles"

// Console pages: signed-in staff whose role can see this section; anyone else goes to the overview.
// path: where to come back to after signing in
export async function requireArea(area, path) {
  const staff = await requireStaff(path)
  if (!canView(staff.role, area)) redirect("/")
  return staff
}
