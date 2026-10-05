import "server-only"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { notify } from "@/server/notifications"
import { isFullAccess } from "@/modules/users/permissions"
import { SOON_DAYS, addDays, daysLeft, todayKey } from "../expiry"

// The 30-day expiry reminder, without a scheduler: the first time the Documents app or My Desk
// loads on a day, documents expiring within 30 days (or already expired) that weren't reminded
// about yet notify their uploader and the workspace's owners and admins (full access), then are
// marked (assets.reminded_at) so it goes out once. Changing a document's expiry date clears the
// mark, so the new date gets its own reminder.
const KEY = "documents_reminded_on"

export async function remindExpiring(db, tenant) {
  try {
    const today = todayKey()
    const last = (await db("settings").where({ key: KEY }).first("value"))?.value
    if (last === today || last === JSON.stringify(today)) return
    await db("settings")
      .insert({ key: KEY, value: JSON.stringify(today), description: "Last day the Documents expiry reminders ran" })
      .onConflict("key")
      .merge()

    const due = await live(db, "assets")
      .where({ app: "documents" })
      .whereNull("supersededAt")
      .whereNull("remindedAt")
      .whereNotNull("expiresOn")
      .where("expiresOn", "<=", addDays(today, SOON_DAYS))
      .orderBy("expiresOn")
      .select("id", "code", "title", "expiresOn", "createdBy")
    if (!due.length) return

    const fullRoles = (await live(db, "roles").select("id", "permissions")).filter((r) => isFullAccess(r.permissions)).map((r) => r.id)
    const admins = fullRoles.length ? (await authDb()("memberships").where({ tenantId: tenant.id, status: "active" }).whereIn("roleId", fullRoles).whereNull("deletedAt").select("userId")).map((m) => m.userId) : []

    // Who hears about what: each uploader their own documents, admins all of them
    const byPerson = new Map()
    for (const d of due)
      for (const userId of new Set([d.createdBy, ...admins].filter(Boolean))) {
        if (!byPerson.has(userId)) byPerson.set(userId, [])
        byPerson.get(userId).push(d)
      }
    const when = (d) => {
      const days = daysLeft(new Date(d.expiresOn).toISOString().slice(0, 10), today)
      return days < 0 ? `expired ${-days} ${days === -1 ? "day" : "days"} ago` : days === 0 ? "expires today" : `expires in ${days} ${days === 1 ? "day" : "days"}`
    }
    for (const [userId, docs] of byPerson) {
      if (docs.length <= 3)
        for (const d of docs)
          await notify(db, [userId], {
            app: "documents",
            kind: "documents.expiry",
            title: `${d.title} ${when(d)}`,
            body: "Renew it and upload the new copy as a new version.",
            href: `/documents/${d.code}`,
            icon: "alarm-warning-line",
          })
      else
        await notify(db, [userId], {
          app: "documents",
          kind: "documents.expiry",
          title: `${docs.length} documents expire within ${SOON_DAYS} days or have expired`,
          body: docs
            .slice(0, 3)
            .map((d) => d.title)
            .join(", ")
            .concat("…"),
          href: "/documents/expiring",
          icon: "alarm-warning-line",
        })
    }
    await db("assets")
      .whereIn(
        "id",
        due.map((d) => d.id),
      )
      .update({ remindedAt: new Date() })
  } catch (err) {
    // A reminder that fails mustn't break the page it runs on
    console.error("Documents reminders failed:", err.message)
  }
}
