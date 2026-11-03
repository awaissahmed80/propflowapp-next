import { json, mobileRoute } from "@/modules/mobile/server/api"
import { mobileWorkspaces } from "@/modules/mobile/server/sign-in"

// GET /api/mobile/v1/workspaces: the workspaces this person may switch to (POST /auth/switch)
// → { workspaces: [{ key, code, name, city, open, current }] }. docs/mobile-api.md
export const GET = mobileRoute(async (request, access) => {
  const list = await mobileWorkspaces(access.user.id)
  return json({ workspaces: list.map(({ key, code, name, city, open, tenantId }) => ({ key, code, name, city, open, current: tenantId === access.tenant.id })) })
})
