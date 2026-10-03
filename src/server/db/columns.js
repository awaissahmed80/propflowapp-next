// Migration helpers so every table follows the same conventions:
//   snake_case plural tables, BIGINT id, a human `code` where people refer to the record,
//   DATETIME(3) in UTC, DECIMAL(15,2) money, and on business tables
//   created_at / updated_at / deleted_at with created_by / updated_by / deleted_by
//   (user ids from pf_auth, plain columns: no foreign keys across databases).

// InnoDB, utf8mb4 (Urdu names) — call first inside createTable
export function tableDefaults(t) {
  t.engine("InnoDB")
  t.charset("utf8mb4")
  t.collate("utf8mb4_unicode_ci")
}

// Human code in a sequence, e.g. BK-SKE-00412: unique forever, never reused or changed
export const code = (t, length = 30) => t.string("code", length).notNullable().unique()

export const money = (t, name) => t.decimal(name, 15, 2)
export const percent = (t, name) => t.decimal(name, 5, 2)
export const datetime = (t, name) => t.datetime(name, { precision: 3 })

// Reference to a user in pf_auth (or a record in another database): no foreign key
export const externalId = (t, name) => t.bigInteger(name).unsigned()

// Standard trailing columns. Leave softDelete off only for append-only logs and system tables;
// leave audit off where no person acts (e.g. sessions).
export function timestamps(t, knex, { softDelete = true, audit = true } = {}) {
  t.datetime("created_at", { precision: 3 }).notNullable().defaultTo(knex.fn.now(3))
  t.datetime("updated_at", { precision: 3 }).nullable()
  if (audit) {
    externalId(t, "created_by").nullable()
    externalId(t, "updated_by").nullable()
  }
  if (softDelete) {
    t.datetime("deleted_at", { precision: 3 }).nullable().index()
    if (audit) externalId(t, "deleted_by").nullable()
  }
}

// Unique among live rows only, so a deleted record doesn't block its email, mobile or slug
// being used again. Adds a generated `alive` column (1 when live, NULL when deleted; MySQL
// ignores NULLs in unique indexes) once per table, then the unique index.
export async function uniqueAlive(knex, table, columns, name) {
  if (!(await knex.schema.hasColumn(table, "alive"))) await knex.raw("ALTER TABLE ?? ADD COLUMN `alive` TINYINT GENERATED ALWAYS AS (IF(`deleted_at` IS NULL, 1, NULL)) VIRTUAL", [table])
  const cols = Array.isArray(columns) ? columns : [columns]
  await knex.schema.alterTable(table, (t) => t.unique([...cols, "alive"], { indexName: name ?? `${table}_${cols.join("_")}_alive_unique` }))
}
