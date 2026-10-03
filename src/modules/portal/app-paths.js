// Where each app lives in the portal. The app code (permissions, lookups, the database) differs
// same; only the URL is friendlier. Apps not listed live at /<code>.
export const APP_SLUGS = { portfolio: "project-portfolio", operations: "operations", estate: "estate-management", hr: "hrm" }

// Old URLs that still reach the app (links in past notifications, bookmarks)
export const OLD_SLUGS = { portfolio: ["estate"], operations: ["sales"], estate: ["services", "customer-care"], hr: ["hr"] }

// "/estate-management" for estate, "/crm" for crm
export const appPath = (code) => `/${APP_SLUGS[code] ?? code}`

// The app code for a URL's first segment ("estate-management" → "estate")
export const codeForSlug = (slug) => Object.keys(APP_SLUGS).find((code) => APP_SLUGS[code] === slug) ?? slug
