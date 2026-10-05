// Dynamic pricing ("build your own package"), shared by the console, the website and the server:
// a base fee that includes the core apps and some users, a monthly price for each optional app,
// and a price per extra user. Yearly is charged as yearly_months_charged months. The server works
// the quote out again from the saved prices when a request comes in; the browser's is a preview.

export const PRICING_MODE_KEY = "pricing_mode" // plans | dynamic
export const DYNAMIC_PRICING_KEY = "dynamic_pricing"

export const DEFAULT_DYNAMIC_PRICING = {
  baseMonthly: 4999,
  baseUsers: 5,
  // Always in the base package (My Desk is always on)
  baseApps: ["users", "settings", "contacts", "documents", "dashboards"],
  userPrice: 799, // per extra user, per month
  maxUsers: 500,
  appPrices: { portfolio: 2999, crm: 3999, campaigns: 2999, operations: 4999, estate: 3999, finance: 4999, hr: 2999 },
}

export function mergeDynamicPricing(saved) {
  const v = saved && typeof saved === "object" ? saved : {}
  const num = (n, d) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Math.round(Number(n)) : d)
  const d = DEFAULT_DYNAMIC_PRICING
  return {
    baseMonthly: num(v.baseMonthly, d.baseMonthly),
    baseUsers: Math.max(1, num(v.baseUsers, d.baseUsers)),
    baseApps: Array.isArray(v.baseApps) ? v.baseApps.filter((x) => typeof x === "string") : d.baseApps,
    userPrice: num(v.userPrice, d.userPrice),
    maxUsers: Math.max(1, num(v.maxUsers, d.maxUsers)),
    appPrices: Object.fromEntries(Object.entries(v.appPrices && typeof v.appPrices === "object" ? v.appPrices : d.appPrices).map(([k, p]) => [k, num(p, 0)])),
  }
}

// What a package costs → { lines: [{ label, amount }], monthly, cycleTotal, months, users, apps }
//   apps: the optional app codes picked (base apps are always in) · users: total users
//   catalog: [{ code, name }] for labels · yearlyMonths: months charged for a year
export function quote(pricing, { apps = [], users, cycle = "monthly" }, { catalog = [], yearlyMonths = 12 } = {}) {
  const name = (code) => catalog.find((a) => a.code === code)?.name ?? code
  const picked = [...new Set(apps)].filter((c) => !pricing.baseApps.includes(c) && pricing.appPrices[c] != null)
  const seats = Math.min(pricing.maxUsers, Math.max(pricing.baseUsers, Math.round(Number(users) || pricing.baseUsers)))
  const extra = seats - pricing.baseUsers
  const lines = [
    { label: `Base: ${pricing.baseApps.map(name).join(", ")} · ${pricing.baseUsers} users`, amount: pricing.baseMonthly },
    ...picked.map((c) => ({ label: name(c), amount: pricing.appPrices[c] })),
    ...(extra > 0 ? [{ label: `${extra} more ${extra === 1 ? "user" : "users"}`, amount: extra * pricing.userPrice }] : []),
  ]
  const monthly = lines.reduce((s, l) => s + l.amount, 0)
  const months = cycle === "yearly" ? yearlyMonths : 1
  return { lines, monthly, cycleTotal: monthly * months, months, users: seats, apps: picked }
}
