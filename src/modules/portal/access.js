// Which apps a workspace role can open. Role permissions live in the workspace's own database:
//   ["*"]                      everything (Owner)
//   ["crm", "portfolio.view", …]  an app code, or any permission inside that app
export function canOpenApp(permissions = [], appCode) {
  if (!Array.isArray(permissions)) return false
  return permissions.includes("*") || permissions.includes(appCode) || permissions.some((p) => typeof p === "string" && p.startsWith(`${appCode}.`))
}

// Launcher and app switcher group apps in this order
export const CATEGORY_ORDER = ["Projects & Sales", "After-Sales", "Finance & HR", "Workspace & Admin"]

// Apps grouped into their sections: the known ones in CATEGORY_ORDER, any new section by its own
// name after them, and an app without one under Workspace & Admin (never an "Other" bucket)
export function groupApps(apps) {
  const sectionOf = (a) => a.category || "Workspace & Admin"
  const names = [...new Set([...CATEGORY_ORDER, ...apps.map(sectionOf)])]
  return names.map((category) => ({ category, apps: apps.filter((a) => sectionOf(a) === category) })).filter((g) => g.apps.length > 0)
}
