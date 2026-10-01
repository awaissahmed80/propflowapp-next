import "server-only"
import { platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { withoutText } from "@/modules/portal/features"

const setting = async (db, key, fallback) => (await db("settings").where({ key }).first("value"))?.value ?? fallback

// Plans for the pricing section: public and available ones only, straight from the console.
// Each card lists what it adds over the plan before it ("Everything in Starter" + new apps).
// showPrices false (console Settings): no amounts leave the server at all.
export async function publicPricing({ showPrices = true } = {}) {
  const db = platformDb()
  const [plans, planApps, trialDays, yearlyMonths, extraUser] = await Promise.all([
    live(db, "plans").where({ isPublic: true, isActive: true }).orderBy("sortOrder").orderBy("id"),
    db("planApps as pa")
      .join("apps as a", "a.id", "pa.appId")
      .whereNull("a.deletedAt")
      .where("a.isActive", true)
      .where("a.alwaysOn", false)
      // Every workspace has Settings; it isn't a selling point
      .whereNot("a.code", "settings")
      .orderBy("a.sortOrder")
      .select("pa.planId", "a.code", "a.name", "pa.offFeatures"),
    setting(db, "trial_days", 15),
    setting(db, "yearly_months_charged", 10),
    setting(db, "extra_user_price", null),
  ])
  const limit = (n, one, many, none) => (n == null ? none : `${n} ${n === 1 ? one : many}`)
  let previous = null
  const cards = plans.map((p) => {
    const apps = planApps.filter((a) => a.planId === p.id)
    const added = previous ? apps.filter((a) => !previous.apps.some((b) => b.code === a.code)) : apps
    const card = {
      code: p.code,
      name: p.name,
      description: p.description,
      monthly: showPrices ? p.priceMonthly : null,
      limits: [
        limit(p.maxProjects, "project", "projects", "Unlimited projects"),
        limit(p.maxUsers, "user", "users", "Any team size"),
        p.maxDealers === 0 ? null : limit(p.maxDealers, "dealer login", "dealer logins", "Unlimited dealers"),
      ].filter(Boolean),
      // "Estate Management (without Resale & rentals)" when the plan leaves features out
      features: [...(previous ? [`Everything in ${previous.name}`] : []), ...added.map((a) => (withoutText(a.code, a.offFeatures) ? `${a.name} (${withoutText(a.code, a.offFeatures)})` : a.name))],
      apps: apps.map((a) => a.code),
    }
    previous = { name: p.name, apps }
    return card
  })
  return { plans: cards, trialDays, yearlyMonths, extraUser: showPrices ? extraUser : null, showPrices }
}
