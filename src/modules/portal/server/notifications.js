"use server"

import { requireTenant } from "@/server/auth/dal"
import { tenantDb } from "@/server/db/connections"

// The bell: this person's latest notifications and how many are unread
async function me() {
  const s = await requireTenant("/")
  return { db: tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost }), userId: s.user.id }
}

export async function loadNotifications() {
  const { db, userId } = await me()
  const [rows, unread] = await Promise.all([
    db("notifications").where({ userId }).orderBy("createdAt", "desc").orderBy("id", "desc").limit(30).select("id", "app", "kind", "title", "body", "href", "icon", "readAt", "createdAt"),
    db("notifications").where({ userId }).whereNull("readAt").count({ n: "id" }).first(),
  ])
  return { items: rows.map((r) => ({ id: r.id, app: r.app, title: r.title, body: r.body, href: r.href, icon: r.icon, read: Boolean(r.readAt), at: r.createdAt })), unread: Number(unread?.n ?? 0) }
}

export async function unreadNotifications() {
  const { db, userId } = await me()
  const r = await db("notifications").where({ userId }).whereNull("readAt").count({ n: "id" }).first()
  return Number(r?.n ?? 0)
}

// Mark these read (or all of this person's when ids is empty) → { ok }
export async function markNotificationsRead(ids = []) {
  const { db, userId } = await me()
  const q = db("notifications").where({ userId }).whereNull("readAt")
  if (ids.length) q.whereIn("id", ids.map(Number))
  await q.update({ readAt: new Date() })
  return { ok: true }
}
