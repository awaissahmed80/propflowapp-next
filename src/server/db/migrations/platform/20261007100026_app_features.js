// Features inside apps (src/modules/portal/features.js): plans and workspaces keep the optional
// features they DON'T have, per app, so everything stays on unless switched off. Invitations can
// carry a custom package (apps and switched-off features) instead of the plan's.
export async function up(knex) {
  await knex.schema.alterTable("plan_apps", (t) => {
    t.json("off_features").nullable() // ["resale", …] for this app
  })
  await knex.schema.alterTable("tenant_apps", (t) => {
    t.json("off_features").nullable()
  })
  await knex.schema.alterTable("workspace_invitations", (t) => {
    t.json("package").nullable().after("trial_days") // { apps: [codes], off: { app: [keys] } }
  })
}

export async function down(knex) {
  await knex.schema.alterTable("plan_apps", (t) => t.dropColumn("off_features"))
  await knex.schema.alterTable("tenant_apps", (t) => t.dropColumn("off_features"))
  await knex.schema.alterTable("workspace_invitations", (t) => t.dropColumn("package"))
}
