// Website events for Google Analytics. Does nothing when analytics is off (no gtag on the page).
// Never pass names, emails or phone numbers: GA's terms forbid personal data.
//   track("create_workspace_click", { cta_location: "Hero" })
// Leads (generate_lead) are sent by the server when a request is saved: src/server/analytics/measurement.js
export function track(event, params = {}) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") window.gtag("event", event, params)
}

export const CONSENT_COOKIE = "pf-consent"
