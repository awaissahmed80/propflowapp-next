import "server-only"

// Tell people something (the bell in the top bar). The person who did it is never told about
// their own action. Call inside the change's transaction or after it.
//   notify(db, [sellerId, handlerId], { app: "operations", kind: "booking.receipt", title, body, href, icon, by })
export async function notify(db, userIds, { app, kind, title, body = null, href = null, icon = null, by = null }) {
  const to = [...new Set(userIds.filter((id) => id && id !== by))]
  if (!to.length) return
  const now = new Date()
  await db("notifications").insert(to.map((userId) => ({ userId, app, kind, title: title.slice(0, 200), body: body?.slice(0, 500) ?? null, href, icon, createdBy: by, createdAt: now })))
}
