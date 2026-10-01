// People in the workspace get a human code (MEM-00001) for their page URL, never the user id.
// Existing profiles are numbered in the order they were added.
export async function up(knex) {
  await knex.schema.alterTable("members", (t) => {
    t.string("code", 30).nullable().after("id")
  })
  await knex("sequences").insert({ key: "member", prefix: "MEM", format: "{PREFIX}-{SEQ}", padding: 5, reset: "never", next_value: 1 }).onConflict("key").ignore()
  const rows = await knex("members").orderBy("id").select("id")
  let n = 0
  for (const r of rows) await knex("members").where({ id: r.id }).update({ code: `MEM-${String(++n).padStart(5, "0")}` })
  if (n) await knex("sequences").where({ key: "member" }).update({ next_value: n + 1 })
  await knex.schema.alterTable("members", (t) => {
    t.string("code", 30).notNullable().alter()
    t.unique(["code"])
  })
}

export async function down(knex) {
  await knex.schema.alterTable("members", (t) => {
    t.dropUnique(["code"])
    t.dropColumn("code")
  })
  await knex("sequences").where({ key: "member" }).delete()
}
