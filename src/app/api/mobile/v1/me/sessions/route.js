import { z } from "zod"
import { authDb } from "@/server/db/connections"
import { describeDevice } from "@/server/auth/devices"
import { signOutOtherSessions, signOutSession } from "@/modules/desk/server/account-actions"
import { failWith, json, mobileRoute, readBody } from "@/modules/mobile/server/api"

// GET /api/mobile/v1/me/sessions: the browsers and phones signed in to this account (as on My Desk
// › Profile) → { sessions: [{ key, kind, name, platform (phones), ip, lastSeenAt, createdAt, current }] }.
// DELETE { key }: sign one of them out; DELETE { others: true }: every one but this phone.
// docs/mobile-api.md
export const GET = mobileRoute(async (request, access) => {
  const rows = await authDb()("sessions")
    .where({ userId: access.user.id })
    .whereNull("revokedAt")
    .whereNull("impersonatorUserId")
    .where("expiresAt", ">", new Date())
    .orderBy("lastSeenAt", "desc")
    .limit(20)
    .select("id", "kind", "userAgent", "deviceName", "platform", "ip", "lastSeenAt", "createdAt")
  const sessions = rows.map((x) => {
    const phone = x.kind === "mobile"
    const d = phone ? null : describeDevice(x.userAgent)
    return {
      key: String(x.id),
      kind: phone ? "phone" : "browser",
      name: phone ? (x.deviceName ?? "Phone") : d.device,
      platform: phone ? x.platform : null,
      ip: x.ip,
      lastSeenAt: x.lastSeenAt,
      createdAt: x.createdAt,
      current: x.id === access.session.id,
    }
  })
  return json({ sessions: sessions.sort((a, b) => b.current - a.current) })
})

const schema = z.union([z.object({ key: z.string().regex(/^\d{1,12}$/) }), z.object({ others: z.literal(true) })])
export const DELETE = mobileRoute(async (request) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const result = data.others ? await signOutOtherSessions() : await signOutSession(data.key)
  return result.error ? failWith(result) : json(result)
})
