// App codes follow the app names: estate → portfolio (Project Portfolio), sales → operations
// (Operations), services → estate (Estate Management). Plans and workspaces link apps by id, so
// only the code changes. Goes through temporary codes so "estate" is never taken twice.
const UP = { estate: "portfolio", sales: "operations", services: "estate" }
const DOWN = { portfolio: "estate", operations: "sales", estate: "services" }

export async function up(knex) {
  for (const [from] of Object.entries(UP))
    await knex("apps")
      .where({ code: from })
      .update({ code: `tmp-${from}` })
  for (const [from, to] of Object.entries(UP))
    await knex("apps")
      .where({ code: `tmp-${from}` })
      .update({ code: to })
}

export async function down(knex) {
  for (const [from] of Object.entries(DOWN))
    await knex("apps")
      .where({ code: from })
      .update({ code: `tmp-${from}` })
  for (const [from, to] of Object.entries(DOWN))
    await knex("apps")
      .where({ code: `tmp-${from}` })
      .update({ code: to })
}
