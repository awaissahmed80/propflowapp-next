// Sidebar locks (AppShell). Items the person can't use stay in the sidebar, locked (grayed, with a
// lock and why on hover): a feature this workspace's plan doesn't include (the portal app's off
// list), or a need their role lacks. need mirrors the page's own check, so only pages that would
// 404 lock:
//   action: "create" | "edit" | "approve"… — that permission in this app
//   grant: "hr.payroll" | ["hr.payroll", "hr.salaries"] — any of these grants (a choice grant set
//          to "none", e.g. operations.commissions, counts as not granted)
//   admin: true — administrators only (full access)
//   setup: true — setup rights (owner, administrator or a settings permission: portal.canSetUp)
//   any: [need, …] — instead of the above: passes when any one of them does
// Full access ("*") passes everything. Items can also arrive already locked (locked, lockedReason).
export const PLAN = "Not included in your plan"
export const ROLE = "Your role doesn't include this"

const granted = (v) => Boolean(v) && v !== "none"

// access: { permissions, grants } (portal.access); canSetUp: portal.canSetUp
export function meetsNeed(need, appCode, access, canSetUp) {
  if (need.any) return need.any.some((n) => meetsNeed(n, appCode, access, canSetUp))
  if (access.permissions?.includes("*")) return true
  if (need.admin) return false
  if (need.setup && !canSetUp) return false
  if (need.action && !access.permissions?.includes(`${appCode}.${need.action}`)) return false
  const grants = [need.grant].flat().filter(Boolean)
  return !grants.length || grants.some((g) => granted(access.grants?.[g]))
}

export function lockFor(item, off, appCode, access, canSetUp) {
  if (item.feature && off.includes(item.feature)) return { ...item, locked: true, lockedReason: PLAN }
  if (item.need && access && !meetsNeed(item.need, appCode, access, canSetUp)) return { ...item, locked: true, lockedReason: ROLE }
  return item
}
