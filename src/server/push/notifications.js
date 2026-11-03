import "server-only"
import { after } from "next/server"
import { authDb, platformDb, tenantDb } from "@/server/db/connections"
import { siteUrl } from "@/lib/sites"
import { pushEnabled, sendPushes } from "@/server/push/fcm"

// New bell notifications → pushes to the people's PropFlow app (server/notifications.js notify()
// calls queuePush after inserting them). Runs after the response (next/server after()), or straight
// away without waiting when there is no request (scripts): requests never wait on FCM. No queue
// table: pushes are best-effort, like the bell itself.
//
// For each batch: the recipients' phones (auth sessions: kind "mobile", this workspace, not revoked
// or expired, with a push token), their notification ids and unread counts (the badge), then the
// sends. Tokens FCM calls dead are cleared from their sessions. docs/mobile-api.md › Push.

const MOBILE = "mobile"

// The Android channel (the app's Notifee channels), from the notification's app and event
export function channelFor(app, kind = "") {
  const k = String(kind)
  if (app === "approvals" || /\.(approval|review|requested|submitted)$/.test(k)) return "approvals"
  if (app === "crm" || /^lead\./.test(k)) return "leads"
  if (app === "finance" || /^(payment|receipt|cheque|voucher)\./.test(k)) return "payments"
  return "general"
}

// The workspace (id, code, dbName, dbHost) a tenant db belongs to, remembered per db name
const workspaces = (globalThis.__pfPushWorkspaces ??= new Map())
async function workspaceOf(dbName) {
  if (!dbName) return null
  if (!workspaces.has(dbName)) workspaces.set(dbName, (await platformDb()("tenants").where({ dbName }).first("id", "code", "dbName", "dbHost")) ?? null)
  return workspaces.get(dbName)
}

// FCM's message for one phone
export function pushMessage(row, { workspace, badge }) {
  return {
    notification: { title: row.title, ...(row.body ? { body: row.body } : {}) },
    data: { notificationId: String(row.id ?? ""), app: String(row.app ?? ""), kind: String(row.kind ?? ""), tenant: String(workspace.code ?? ""), href: String(row.href ?? ""), url: row.href ? siteUrl("portal", row.href) : "", unread: String(badge) },
    android: { priority: "high", notification: { channel_id: channelFor(row.app, row.kind) } },
    apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default", badge, "mutable-content": 1 } } },
  }
}

// rows: the inserted notifications ({ userId, app, kind, title, body, href }) in insert order;
// firstId: the insert's first id; dbName: the workspace's database
export async function pushNow(dbName, rows, { firstId }) {
  const workspace = await workspaceOf(dbName)
  if (!workspace) return
  // Its own connection: notify() may have been called with a transaction that has since ended
  const db = tenantDb(workspace)
  const userIds = [...new Set(rows.map((r) => r.userId))]
  const sessions = await authDb()("sessions")
    .whereIn("userId", userIds)
    .where({ kind: MOBILE, tenantId: workspace.id })
    .whereNull("revokedAt")
    .where("expiresAt", ">", new Date())
    .whereNotNull("pushToken")
    .select("id", "userId", "pushToken")
  // Phones per person; Expo tokens can't be reached through FCM
  const phones = new Map()
  for (const s of sessions) {
    if (s.pushToken.startsWith("ExponentPushToken")) continue
    if (!phones.has(s.userId)) phones.set(s.userId, [])
    phones.get(s.userId).push(s)
  }
  const wanted = rows.filter((r) => phones.has(r.userId))
  if (!wanted.length) return
  const who = [...new Set(wanted.map((r) => r.userId))]

  const [inserted, unread] = await Promise.all([
    // The ids of the rows inserted (a multi-row insert only answers the first): ours are at or
    // after firstId, for these people and events, matched in order
    db("notifications")
      .where("id", ">=", firstId)
      .whereIn("userId", who)
      .whereIn("kind", [...new Set(wanted.map((r) => r.kind))])
      .orderBy("id")
      .select("id", "userId", "kind", "title", "href"),
    db("notifications").whereIn("userId", who).whereNull("readAt").groupBy("userId").select("userId").count({ n: "id" }),
  ])
  const badges = new Map(unread.map((u) => [u.userId, Number(u.n)]))
  const used = new Set()
  const items = []
  for (const r of wanted) {
    const match = inserted.find((i) => !used.has(i.id) && i.userId === r.userId && i.kind === r.kind && i.title === r.title && (i.href ?? null) === (r.href ?? null))
    if (match) used.add(match.id)
    const message = pushMessage({ ...r, id: match?.id }, { workspace, badge: badges.get(r.userId) ?? 1 })
    for (const s of phones.get(r.userId)) items.push({ token: s.pushToken, message, sessionId: s.id })
  }

  const { dead } = await sendPushes(items)
  if (dead.length) {
    const gone = new Set(dead)
    const ids = items.filter((i) => gone.has(i.token)).map((i) => i.sessionId)
    await authDb()("sessions").whereIn("id", ids).whereIn("pushToken", [...gone]).update({ pushToken: null })
  }
}

// Push these just-inserted notifications to their people's phones, after the response. Never
// throws; does nothing without FCM_SERVICE_ACCOUNT.
export function queuePush(db, rows, { firstId }) {
  if (!rows?.length || !firstId || !pushEnabled()) return
  const dbName = db?.client?.config?.connection?.database
  const run = () => pushNow(dbName, rows, { firstId }).catch((err) => console.error("[push] failed:", err.message))
  try {
    after(run)
  } catch {
    // Not inside a request (scripts): straight away, not waited on
    run()
  }
}
