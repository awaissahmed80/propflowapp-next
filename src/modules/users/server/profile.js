import "server-only"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"

// A person's profile row in the workspace (code, team, designation, department), created the
// first time it's needed. The code (MEM-00001) is theirs for good and is what URLs use.
export async function saveProfile(db, userId, patch, actorId) {
  const row = await live(db, "members").where({ userId }).first("id")
  if (row) {
    if (Object.keys(patch).length) await db("members").where({ id: row.id }).update({ ...patch, updatedAt: new Date(), updatedBy: actorId })
    return
  }
  await db.transaction(async (trx) => {
    await trx("members").insert({ userId, ...patch, code: await nextCode(trx, "member"), createdBy: actorId })
  })
}

// Profile rows for people who don't have one yet (e.g. the owner who set the workspace up)
export async function ensureProfiles(db, userIds, joinedAt = {}) {
  const have = new Set((await live(db, "members").whereIn("userId", userIds).select("userId")).map((r) => r.userId))
  for (const userId of userIds.filter((id) => !have.has(id))) await saveProfile(db, userId, { joinedAt: joinedAt[userId] ?? null }, userId)
  return userIds.length - have.size
}
