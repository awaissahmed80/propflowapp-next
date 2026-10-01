// Which apps a workspace role can open. Role permissions live in the workspace's own database:
//   ["*"]                      everything (Owner)
//   ["crm", "estate.view", …]  an app code, or any permission inside that app
export function canOpenApp(permissions = [], appCode) {
  if (!Array.isArray(permissions)) return false
  return permissions.includes("*") || permissions.includes(appCode) || permissions.some((p) => typeof p === "string" && p.startsWith(`${appCode}.`))
}

// Launcher and app switcher group apps in this order
export const CATEGORY_ORDER = ["Property & Sales", "Operations & Finance", "Workspace & Admin"]
