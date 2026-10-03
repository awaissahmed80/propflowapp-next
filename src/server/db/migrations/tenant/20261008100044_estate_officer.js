// The default "Customer Services" role becomes "Estate Officer" (the app is now Estate
// Management). Renames the name and description only where the workspace hasn't changed them.
const OLD_NAMES = ["Customer Services", "Customer Care"]
const DESCRIPTION = "Runs the estate office: transfers, NDC, possession, maintenance and complaints"

export async function up(knex) {
  const role = await knex("roles").where({ code: "customer-services" }).first("id", "name")
  if (!role) return
  if (await knex("roles").where({ code: "estate-officer" }).first("id")) return
  await knex("roles")
    .where({ id: role.id })
    .update({ code: "estate-officer", ...(OLD_NAMES.includes(role.name) ? { name: "Estate Officer", description: DESCRIPTION } : {}), updated_at: knex.fn.now() })
}

export async function down(knex) {
  const role = await knex("roles").where({ code: "estate-officer" }).first("id", "name")
  if (!role) return
  await knex("roles")
    .where({ id: role.id })
    .update({
      code: "customer-services",
      ...(role.name === "Estate Officer" ? { name: "Customer Services", description: "Runs the service desk: transfers, NDC, possession and complaints" } : {}),
      updated_at: knex.fn.now(),
    })
}
