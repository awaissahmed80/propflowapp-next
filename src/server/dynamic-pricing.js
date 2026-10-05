import "server-only"
import { platformDb } from "@/server/db/connections"
import { DYNAMIC_PRICING_KEY, PRICING_MODE_KEY, mergeDynamicPricing } from "@/modules/web/dynamic-pricing"

// JSON settings arrive parsed from MySQL; a plain string ("dynamic") is already the value
const parse = (v) => {
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return v
  }
}

// Dynamic pricing as saved in the console → { mode, pricing, catalog, yearlyMonths, trialDays }
//   catalog: the apps a package can have ([{ code, name, description, icon, color, category }]),
//   active and not always on (My Desk comes with every workspace)
export async function getDynamicPricing(db = platformDb()) {
  const [rows, apps] = await Promise.all([
    db("settings").whereIn("key", [PRICING_MODE_KEY, DYNAMIC_PRICING_KEY, "yearly_months_charged", "trial_days"]).select("key", "value"),
    db("apps").where({ isActive: true, alwaysOn: false }).whereNull("deletedAt").orderBy("sortOrder").select("code", "name", "description", "icon", "color", "category"),
  ])
  const get = (key) => {
    const r = rows.find((x) => x.key === key)
    return r ? parse(r.value) : undefined
  }
  return {
    mode: get(PRICING_MODE_KEY) === "dynamic" ? "dynamic" : "plans",
    pricing: mergeDynamicPricing(get(DYNAMIC_PRICING_KEY)),
    catalog: apps,
    yearlyMonths: Number(get("yearly_months_charged")) || 12,
    trialDays: Number(get("trial_days")) || 15,
  }
}
