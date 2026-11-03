import { tenantDb } from "@/server/db/connections"
import { json, mobileRoute, paging } from "@/modules/mobile/server/api"

// GET /api/mobile/v1/notifications?page=&size=: this person's notifications, newest first
// → { items: [{ id, app, kind, title, body, href, icon, read, at }], unread, page, size, more }.
// href: a portal path; the app opens the ones it has screens for. docs/mobile-api.md
export const GET = mobileRoute(async (request, access) => {
  const db = tenantDb({ dbName: access.tenant.dbName, dbHost: access.tenant.dbHost })
  const { page, size } = paging(request.url, { size: 30, max: 100 })
  const mine = () => db("notifications").where({ userId: access.user.id })
  const [rows, unread] = await Promise.all([
    mine()
      .orderBy("createdAt", "desc")
      .orderBy("id", "desc")
      .limit(size + 1)
      .offset((page - 1) * size)
      .select("id", "app", "kind", "title", "body", "href", "icon", "readAt", "createdAt"),
    mine().whereNull("readAt").count({ n: "id" }).first(),
  ])
  return json({
    items: rows.slice(0, size).map((r) => ({ id: r.id, app: r.app, kind: r.kind, title: r.title, body: r.body, href: r.href, icon: r.icon, read: Boolean(r.readAt), at: r.createdAt })),
    unread: Number(unread?.n ?? 0),
    page,
    size,
    more: rows.length > size,
  })
})
