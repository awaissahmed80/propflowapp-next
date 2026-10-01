// Reading and writing business tables with soft deletes. Services use these instead of
// db("table") directly, so deleted rows never leak into lists, reports or exports.
// Names here are camelCase; the case mapping turns them into snake_case columns.

// Rows that aren't deleted
export const live = (db, table) => db(table).whereNull(`${table}.deletedAt`)
// Only deleted rows (recycle bin)
export const trashed = (db, table) => db(table).whereNotNull(`${table}.deletedAt`)
// Everything, deleted or not
export const withTrashed = (db, table) => db(table)

// Join that skips deleted rows of the joined table:
//   joinLive(live(db, "bookings"), "units", "units.id", "bookings.unitId")
export const joinLive = (query, table, left, right) =>
  query.join(table, function () {
    this.on(left, "=", right).andOnNull(`${table}.deletedAt`)
  })
export const leftJoinLive = (query, table, left, right) =>
  query.leftJoin(table, function () {
    this.on(left, "=", right).andOnNull(`${table}.deletedAt`)
  })

// Insert with who created it; returns the new id
export async function insert(db, table, row, userId = null) {
  const [id] = await db(table).insert({ ...row, createdBy: userId })
  return id
}

// Update live rows only, with who changed it and when
export const update = (db, table, where, changes, userId = null) =>
  live(db, table)
    .where(where)
    .update({ ...changes, updatedAt: db.fn.now(3), updatedBy: userId })

export const softDelete = (db, table, where, userId = null) =>
  live(db, table).where(where).update({ deletedAt: db.fn.now(3), deletedBy: userId })

export const restore = (db, table, where, userId = null) =>
  trashed(db, table).where(where).update({ deletedAt: null, deletedBy: null, updatedAt: db.fn.now(3), updatedBy: userId })

// Permanent removal: recycle-bin purge and "delete permanently" only
export const purge = (db, table, where) => trashed(db, table).where(where).delete()
