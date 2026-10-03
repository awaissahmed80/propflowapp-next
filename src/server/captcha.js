import "server-only"

// Cloudflare Turnstile on public lead forms (campaigns.<domain>): one key pair for the platform,
// since every form, embed and landing page is served from the campaigns site. Keys come from
// NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY. Outside production without keys, the
// documented always-pass test keys are used so forms work in development.
const TEST_SITE_KEY = "1x00000000000000000000AA"
const TEST_SECRET = "1x0000000000000000000000000000000AA"
const prod = process.env.NODE_ENV === "production"

export const captchaSiteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || (prod ? null : TEST_SITE_KEY)
const secret = () => process.env.TURNSTILE_SECRET_KEY || (prod ? null : TEST_SECRET)

// → true when the token is valid (or captcha isn't set up on this server, so leads aren't lost)
export async function verifyCaptcha(token, ip) {
  const key = secret()
  if (!key || !captchaSiteKey()) {
    console.warn("Turnstile keys are missing: public forms are accepted without a captcha check.")
    return true
  }
  if (!token) return false
  try {
    const body = new URLSearchParams({ secret: key, response: String(token) })
    if (ip && ip !== "?") body.set("remoteip", ip)
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    return Boolean(data.success)
  } catch (err) {
    // Cloudflare unreachable: let the entry through rather than lose a lead
    console.error("Turnstile check failed:", err.message)
    return true
  }
}
