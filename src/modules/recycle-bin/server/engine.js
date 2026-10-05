import "server-only"
import { authDb } from "@/server/db/connections"
import { deleteFile } from "@/server/storage"
import { logActivity } from "@/server/tenants/activity"
import { KINDS } from "../kinds"

// The recycle bin's work, for a workspace (ctx: { db, user, tenant }). Who may do what is checked
// in actions.js. A record moved to the bin takes its child rows with it (same deletedAt), and a
// restore brings back exactly those.

const find = (db, k, key, { trashed = false } = {}) => {
  let q = db(k.table)
    .where(`${k.table}.${k.byId ? "id" : "code"}`, k.byId ? Number(key) : String(key ?? "").toUpperCase())
    [trashed ? "whereNotNull" : "whereNull"](`${k.table}.deletedAt`)
  if (k.scope) q = k.scope(q)
  if (k.extra) q = k.extra(q)
  return q.first(`${k.table}.id`, `${k.table}.deletedAt`, ...k.columns.filter((c) => c !== "id").map((c) => `${k.table}.${c}`))
}
const loaded = async (db, k, row) => (row && k.load ? k.load(db, row) : row)
const name = (k, r) => `${k.label.toLowerCase()} ${k.title(r) ?? r.code}${r.code && k.title(r) !== r.code ? ` (${r.code})` : ""}`

// Child rows that leave (and come back) with a record
function together(trx, k, row, set, onlyStamp) {
  return Promise.all(
    (k.together?.(row) ?? []).map(([table, where]) => {
      let q = trx(table)
      q = typeof where === "function" ? where(q) : q.where(where)
      q = onlyStamp ? q.where({ deletedAt: onlyStamp }) : q.whereNull("deletedAt")
      return q.update(set)
    }),
  )
}

// Move records to the bin: binDelete(ctx, "lead", ["LD-00012", …]) → { ok, count, skipped: [why] } | { error }
export async function binDelete(ctx, kind, keys) {
  const k = KINDS[kind]
  if (!k) return { error: "Unknown kind of record." }
  const list = [...new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))].slice(0, 500)
  if (!list.length) return { error: "Nothing to delete." }
  let count = 0
  const skipped = []
  for (const key of list) {
    const row = await loaded(ctx.db, k, await find(ctx.db, k, key))
    if (!row) {
      skipped.push(`${key}: not found`)
      continue
    }
    const why = await k.inUse?.(ctx.db, row)
    if (why) {
      skipped.push(`${k.title(row) ?? key}: ${why}`)
      continue
    }
    const stamp = new Date()
    const set = { deletedAt: stamp, deletedBy: ctx.user.id }
    await ctx.db.transaction(async (trx) => {
      await trx(k.table).where({ id: row.id }).update(set)
      await together(trx, k, row, set)
    })
    await logActivity(ctx.db, { type: k.app, action: `${kind}.deleted`, actorUserId: ctx.user.id, summary: `deleted ${name(k, row)}`, subjectType: kind, subjectId: row.id })
    count += 1
  }
  if (!count) return { error: skipped.length === 1 ? skipped[0].replace(/^[^:]+: /, "") : `None could be deleted. ${skipped.join("; ")}` }
  return { ok: true, count, skipped }
}

// Everything in the bin, newest first → { items: [{ kind, key, code, title, sub, label, group, icon, deletedAt, deletedBy }] }
export async function binList(ctx) {
  const items = []
  for (const [kind, k] of Object.entries(KINDS)) {
    let q = ctx.db(k.table).whereNotNull(`${k.table}.deletedAt`)
    if (k.scope) q = k.scope(q)
    if (k.extra) q = k.extra(q)
    const rows = await q
      .orderBy(`${k.table}.deletedAt`, "desc")
      .limit(500)
      .select(`${k.table}.id`, `${k.table}.deletedAt`, `${k.table}.deletedBy`, ...k.columns.filter((c) => c !== "id").map((c) => `${k.table}.${c}`))
    for (const r of rows)
      items.push({
        kind,
        key: k.byId ? String(r.id) : r.code,
        code: k.codeHidden ? null : (r.code ?? null),
        title: k.title(r) ?? r.code,
        sub: k.sub?.(r) ?? null,
        label: k.label,
        group: k.group,
        icon: k.icon,
        deletedAt: r.deletedAt,
        deletedById: r.deletedBy,
      })
  }
  const userIds = [...new Set(items.map((i) => i.deletedById).filter(Boolean))]
  const names = new Map(userIds.length ? (await authDb()("users").whereIn("id", userIds).select("id", "name")).map((u) => [u.id, u.name]) : [])
  items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))
  return { items: items.map(({ deletedById, ...i }) => ({ ...i, deletedAt: new Date(i.deletedAt).toISOString(), deletedBy: names.get(deletedById) ?? null })) }
}

// Bring records back: binRestore(ctx, [{ kind, key }]) → { ok, count, skipped } | { error }
export async function binRestore(ctx, list) {
  let count = 0
  const skipped = []
  for (const { kind, key } of (list ?? []).slice(0, 500)) {
    const k = KINDS[kind]
    const row = k && (await loaded(ctx.db, k, await find(ctx.db, k, key, { trashed: true })))
    if (!row) {
      skipped.push(`${key}: not in the bin`)
      continue
    }
    const why = await k.canRestore?.(ctx.db, row)
    if (why) {
      skipped.push(`${k.title(row)}: ${why}`)
      continue
    }
    const set = { deletedAt: null, deletedBy: null, updatedAt: new Date(), updatedBy: ctx.user.id }
    try {
      await ctx.db.transaction(async (trx) => {
        await together(trx, k, row, { deletedAt: null, deletedBy: null }, row.deletedAt)
        await trx(k.table).where({ id: row.id }).update(set)
      })
    } catch (err) {
      if (err.code !== "ER_DUP_ENTRY") throw err
      skipped.push(`${k.title(row)}: another ${k.label.toLowerCase()} now uses the same name, number or address. Change that one first.`)
      continue
    }
    await logActivity(ctx.db, { type: k.app, action: `${kind}.restored`, actorUserId: ctx.user.id, summary: `restored ${name(k, row)} from the recycle bin`, subjectType: kind, subjectId: row.id })
    count += 1
  }
  if (!count) return { error: skipped.join("; ") || "Nothing was restored." }
  return { ok: true, count, skipped }
}

// Remove records for good: binPurge(ctx, [{ kind, key }]) → { ok, count, skipped } | { error }
export async function binPurge(ctx, list) {
  let count = 0
  const skipped = []
  for (const { kind, key } of (list ?? []).slice(0, 500)) {
    const k = KINDS[kind]
    const row = k && (await loaded(ctx.db, k, await find(ctx.db, k, key, { trashed: true })))
    if (!row) {
      skipped.push(`${key}: not in the bin`)
      continue
    }
    let why = await k.keeps?.(ctx.db, row)
    if (!why && k.membershipsCheck && (await authDb()("memberships").where({ tenantId: ctx.tenant.id, roleId: row.id }).first("id"))) why = "People still have this role. Give them another role first."
    if (why) {
      skipped.push(`${k.title(row)}: ${why}`)
      continue
    }
    const keys = [...((await k.files?.(ctx.db, row)) ?? [])]
    await ctx.db.transaction(async (trx) => {
      await k.purge?.(trx, row)
      await trx(k.table).where({ id: row.id }).delete()
    })
    for (const f of keys.filter(Boolean)) await deleteFile(f).catch(() => {})
    await logActivity(ctx.db, { type: k.app, action: `${kind}.purged`, actorUserId: ctx.user.id, summary: `permanently deleted ${name(k, row)}`, subjectType: kind, subjectId: row.id })
    count += 1
  }
  if (!count) return { error: skipped.join("; ") || "Nothing was deleted." }
  return { ok: true, count, skipped }
}
