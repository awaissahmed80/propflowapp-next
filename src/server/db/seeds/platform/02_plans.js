// Starting plans in PKR (Pakistan only for now). Safe to run again: only adds plans that don't
// exist yet, with their apps. Once a plan exists the console owns it (name, price, limits, apps),
// so nothing here overwrites those edits. My Desk is always on, so it isn't listed here.
const PLANS = [
  { code: "starter", name: "Starter", price: 5999, projects: 1, users: 5, dealers: 0, apps: ["estate", "crm", "contacts", "dashboards", "documents", "users", "settings"] },
  { code: "growth", name: "Growth", price: 14999, projects: 3, users: 15, dealers: 5, apps: ["estate", "crm", "campaigns", "sales", "contacts", "dashboards", "documents", "users", "settings"] },
  { code: "professional", name: "Professional", price: 34999, projects: 10, users: 40, dealers: null, apps: ["estate", "crm", "campaigns", "sales", "services", "finance", "hr", "contacts", "dashboards", "documents", "users", "settings"] },
  { code: "enterprise", name: "Enterprise", price: 69999, projects: null, users: null, dealers: null, apps: ["estate", "crm", "campaigns", "sales", "services", "finance", "hr", "contacts", "dashboards", "documents", "users", "settings"] },
]

export async function seed(knex) {
  const existing = new Set(await knex("plans").pluck("code"))
  await knex("plans")
    .insert(
      PLANS.map((p, i) => ({
        code: p.code,
        name: p.name,
        price_monthly: p.price,
        currency: "PKR",
        max_projects: p.projects,
        max_users: p.users,
        max_dealers: p.dealers,
        sort_order: (i + 1) * 10,
      }))
    )
    .onConflict("code")
    .ignore()

  const plans = Object.fromEntries((await knex("plans").select("id", "code")).map((p) => [p.code, p.id]))
  const apps = Object.fromEntries((await knex("apps").select("id", "code")).map((a) => [a.code, a.id]))
  for (const p of PLANS.filter((x) => !existing.has(x.code))) {
    await knex("plan_apps").where({ plan_id: plans[p.code] }).delete()
    await knex("plan_apps").insert(p.apps.map((a) => ({ plan_id: plans[p.code], app_id: apps[a] })))
  }
}
