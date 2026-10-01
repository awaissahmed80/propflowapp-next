import "server-only"
import crypto from "node:crypto"

// "Sign in with Google" (OpenID Connect, authorization code flow with PKCE). No SDK: two HTTPS
// calls to Google. Keys come from .env; with no client ID the Google buttons are hidden.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"]

// Short-lived signed cookie holding state, nonce and PKCE verifier between start and callback
export const GOOGLE_COOKIE = "pf_google"
// Company details typed on the workspace setup page, kept while the visitor is at Google
export const GOOGLE_SETUP_COOKIE = "pf_google_setup"

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI)

const base64url = (buf) => Buffer.from(buf).toString("base64url")

// Google profile photos end in a size like "=s96-c"; ask for 256px so large avatars stay sharp
function sharperPhoto(url) {
  if (typeof url !== "string" || !url.startsWith("https://")) return null
  return /=s\d+-c$/.test(url) ? url.replace(/=s\d+-c$/, "=s256-c") : url
}

// Photos we set from Google (a photo the user uploads later is never replaced)
export const isGooglePhoto = (url) => typeof url === "string" && /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(url)

// A new sign-in attempt: the values we keep (in a signed cookie) and the Google URL to open.
// loginHint pre-selects an account, e.g. the invited email.
export function startGoogleSignIn({ loginHint } = {}) {
  const state = base64url(crypto.randomBytes(24))
  const nonce = base64url(crypto.randomBytes(24))
  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest())
  const url = new URL(AUTH_URL)
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString()
  return { url: url.toString(), secrets: { state, nonce, verifier } }
}

// Swap the code for Google's ID token and check it. The token comes straight from Google over
// HTTPS (not through the browser), so TLS vouches for the issuer; we still check who it's for,
// that it's fresh, that it answers our nonce, and that Google has verified the email.
// Returns { sub, email, name, picture } or throws with a short reason.
export async function finishGoogleSignIn({ code, verifier, nonce }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.id_token) throw new Error(`token exchange failed: ${body.error ?? res.status}`)

  const [, payload] = body.id_token.split(".")
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString())
  const now = Math.floor(Date.now() / 1000)
  if (!ISSUERS.includes(claims.iss)) throw new Error("wrong issuer")
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("wrong audience")
  if (!claims.exp || claims.exp < now - 60) throw new Error("expired")
  if (claims.nonce !== nonce) throw new Error("nonce mismatch")
  if (!claims.sub || !claims.email) throw new Error("no account details")
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("unverified email")

  return {
    sub: String(claims.sub),
    email: String(claims.email).toLowerCase(),
    name: claims.name || claims.email.split("@")[0],
    picture: sharperPhoto(claims.picture),
  }
}
