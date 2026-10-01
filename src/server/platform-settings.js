import "server-only"
import { platformDb } from "@/server/db/connections"

// Site-wide switches from pf_platform.settings, read on almost every public request, so kept in
// memory for a few seconds. Saving from the console clears the cache on this server at once;
// other servers pick the change up within CACHE_MS.

const CACHE_MS = 10_000

// GA_MEASUREMENT_ID in .env: the website's Google Analytics when the console field is empty.
// Production only, so local and staging visits don't end up in the reports.
export const envAnalyticsId = () => {
  const id = process.env.APP_ENV === "production" ? process.env.GA_MEASUREMENT_ID?.trim().toUpperCase() : ""
  return /^G-[A-Z0-9]{4,20}$/.test(id ?? "") ? id : null
}
const store = (globalThis.__pfSiteSettings ??= { at: 0, value: null })

export async function getSiteSettings() {
  if (store.value && Date.now() - store.at < CACHE_MS) return store.value
  const rows = await platformDb()("settings").whereIn("key", ["site_status", "signup_mode", "prices_visible", "quote_requests", "signin_visible", "analytics_id", "analytics_consent"]).select("key", "value")
  const get = (key) => rows.find((r) => r.key === key)?.value
  const status = get("site_status") ?? {}
  store.value = {
    maintenance: status.mode === "maintenance",
    message: status.message ?? null,
    until: status.until ?? null,
    signupOpen: get("signup_mode") === "open",
    pricesVisible: get("prices_visible") === true,
    // Prices hidden: offer the custom-quote wizard (on unless switched off)
    quoteRequests: get("quote_requests") !== false,
    // The website's Sign in link (the sign-in page itself always works)
    signInVisible: get("signin_visible") !== false,
    // Google Analytics 4 on the website (null = off), and whether visitors are asked first
    analyticsId: get("analytics_id") || null,
    analyticsEnvId: envAnalyticsId(),
    analyticsConsent: get("analytics_consent") === true,
  }
  store.at = Date.now()
  return store.value
}

export function clearSiteSettingsCache() {
  store.value = null
}
