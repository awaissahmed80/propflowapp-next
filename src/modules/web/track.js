// Website events for Google Analytics. Does nothing when analytics is off (no gtag on the page).
// Never pass names, emails or phone numbers: GA's terms forbid personal data.
//   track("generate_lead", { lead_type: "get_started" })
export function track(event, params = {}) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") window.gtag("event", event, params)
}

export const CONSENT_COOKIE = "pf-consent"
