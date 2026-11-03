import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { clientIp } from "@/server/auth/mobile-session"
import { fail, json, mobileRoute, readBody } from "@/modules/mobile/server/api"
import { switchWorkspace } from "@/modules/mobile/server/sign-in"

const schema = z.object({ workspaceKey: z.string().min(3).max(20) })

// POST /api/mobile/v1/auth/switch { workspaceKey }: open another of your workspaces on this phone;
// answers like sign-in (a new token), and this phone's old session ends. docs/mobile-api.md
export const POST = mobileRoute(async (request, access) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const s = await authDb()("sessions").where({ id: access.session.id }).first("deviceName", "platform", "appVersion", "pushToken")
  const device = { name: s.deviceName ?? "Phone", platform: s.platform ?? "android", appVersion: s.appVersion ?? "0.0.0", pushToken: s.pushToken }
  const result = await switchWorkspace(access, data.workspaceKey, { method: "switch", device, ip: clientIp(request) })
  return result.error ? fail(result.error, { field: "workspaceKey" }) : json(result)
})
