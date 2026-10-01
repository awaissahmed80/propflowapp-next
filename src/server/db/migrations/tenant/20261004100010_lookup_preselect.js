import { LOOKUP_LISTS } from "../../../../modules/lookups/catalog.js"

// Some lists have a value that forms pick by default (city, authority, marla size…): one per list,
// chosen in Lists & Labels. (is_default already means "came with PropFlow".)
export async function up(knex) {
  await knex.schema.alterTable("lookups", (t) => {
    t.boolean("is_preselected").notNullable().defaultTo(false).after("is_default")
  })
  for (const list of LOOKUP_LISTS.filter((l) => l.defaultValue))
    await knex("lookups").where({ list_key: list.key, value: list.defaultValue }).whereNull("deleted_at").update({ is_preselected: true })
}

export async function down(knex) {
  await knex.schema.alterTable("lookups", (t) => {
    t.dropColumn("is_preselected")
  })
}
