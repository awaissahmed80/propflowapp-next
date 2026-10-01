// Details the website's enquiry form collects, and where the request came from (for spam limits)
export async function up(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    t.string("kind", 10).notNullable().defaultTo("demo").after("code").index() // demo | sales | trial
    t.string("plan", 60).nullable().after("projects") // plan they asked about
    t.string("team_size", 20).nullable().after("plan")
    t.json("interests").nullable().after("team_size")
    t.string("call_time", 20).nullable().after("interests")
    t.string("ip", 45).nullable().after("notes")
    t.string("user_agent", 255).nullable().after("ip")
  })
}

export async function down(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    for (const c of ["kind", "plan", "team_size", "interests", "call_time", "ip", "user_agent"]) t.dropColumn(c)
  })
}
