// Screenshots on a support message: [{ ref, key, name, type, size }]. ref is a random id used in
// the console's file links (never the table id); key is where storage keeps the file.
export async function up(knex) {
  await knex.schema.alterTable("support_messages", (t) => {
    t.json("attachments").nullable().after("body")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("support_messages", (t) => {
    t.dropColumn("attachments")
  })
}
