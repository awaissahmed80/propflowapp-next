// The PropFlow mobile app's sign-ins are sessions too (kind "mobile"): the phone holds a bearer
// token instead of a cookie. These say which phone it is and where its push notifications go.
export async function up(knex) {
  await knex.schema.alterTable("sessions", (t) => {
    t.string("device_name", 80).nullable().after("user_agent")
    t.string("platform", 10).nullable().after("device_name") // ios | android
    t.string("app_version", 20).nullable().after("platform")
    t.string("push_token", 255).nullable().after("app_version")
    t.index(["user_id", "kind"], "sessions_user_kind_idx")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("sessions", (t) => {
    t.dropIndex(["user_id", "kind"], "sessions_user_kind_idx")
    t.dropColumn("push_token")
    t.dropColumn("app_version")
    t.dropColumn("platform")
    t.dropColumn("device_name")
  })
}
