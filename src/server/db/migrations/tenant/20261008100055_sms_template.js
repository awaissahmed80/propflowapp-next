// Which template an SMS came from (installment-before, receipt…), so automatic messages are sent
// once per installment or receipt
export async function up(knex) {
  await knex.schema.alterTable("sms_messages", (t) => {
    t.string("template", 40).nullable()
    t.index(["subject_type", "subject_id", "template"])
  })
}

export async function down(knex) {
  await knex.schema.alterTable("sms_messages", (t) => {
    t.dropIndex(["subject_type", "subject_id", "template"])
    t.dropColumn("template")
  })
}
