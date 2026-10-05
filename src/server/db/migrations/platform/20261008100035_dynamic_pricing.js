import { DEFAULT_DYNAMIC_PRICING } from "../../../../modules/web/dynamic-pricing.js"

// Dynamic pricing: the website can show a package builder (base fee + apps + users) instead of the
// plans, and workspace requests from it carry the package, users, cycle and the quoted price.
// Workspaces from those requests use the hidden "Custom" plan with their own package and price.
export async function up(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    t.json("package").nullable() // { apps: [codes] } picked on the website
    t.integer("users").unsigned().nullable()
    t.string("billing_cycle", 10).nullable() // monthly | yearly
    t.json("quote").nullable() // { lines, monthly, cycleTotal, months } as worked out by the server
  })
  await knex("settings")
    .insert([
      { key: "pricing_mode", value: JSON.stringify("plans"), description: "Website pricing: plans or dynamic (build your own package)" },
      { key: "dynamic_pricing", value: JSON.stringify(DEFAULT_DYNAMIC_PRICING), description: "Base fee, users included, price per app and per extra user" },
    ])
    .onConflict("key")
    .ignore()
  if (!(await knex("plans").where({ code: "custom" }).first("id"))) {
    const max = (await knex("plans").max({ m: "sort_order" }).first())?.m ?? 0
    await knex("plans").insert({ code: "custom", name: "Custom", description: "A package built on the website (dynamic pricing): its own apps and price", price_monthly: 0, currency: "PKR", max_projects: null, max_users: null, max_dealers: null, is_public: false, is_active: true, sort_order: max + 100 })
  }
}

export async function down(knex) {
  await knex.schema.alterTable("enquiries", (t) => {
    for (const c of ["package", "users", "billing_cycle", "quote"]) t.dropColumn(c)
  })
  await knex("settings").whereIn("key", ["pricing_mode", "dynamic_pricing"]).delete()
}
