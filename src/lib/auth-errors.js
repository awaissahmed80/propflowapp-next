// Messages for sign-in problems passed back to a page as ?error=<code> (Google sign-in redirects)
export const AUTH_ERRORS = {
  "google-off": "Google sign-in isn't set up yet. Use your email and password.",
  "google-cancelled": "Google sign-in was canceled.",
  "google-failed": "We couldn't sign you in with Google. Please try again.",
  "google-expired": "That Google sign-in took too long or was already used. Please try again.",
  "google-no-account": "There's no PropFlow account for that Google email. Sign-up is by invitation: ask your company admin, or PropFlow, to invite you.",
  "google-mismatch": "That email is linked to a different Google account. Sign in with the Google account you used before, or use your password.",
  "google-wrong-email": "That Google account uses a different email. This invitation is for {email}: choose the Google account with that email, or use a password below.",
  disabled: "This account has been disabled. Contact your administrator.",
  maintenance: "PropFlow is down for maintenance. Please try again a little later.",
  "no-workspace": "Your account isn't linked to any workspace yet. Ask your company admin for an invitation.",
  "setup-expired": "Your workspace details timed out while you were at Google. Please fill them in again.",
  "slug-taken": "That short name was taken while you were at Google. Choose another and try again.",
  "setup-failed": "Your workspace was created, but its setup didn't finish. Our team has been alerted and will email you when it's ready.",
  "workspace-suspended": "Your workspace is suspended, so it can't be opened right now. Please contact your company administrator or PropFlow support.",
  "invite-gone": "This invitation has expired or was already used. Ask whoever invited you to send a new one.",
}

// vars fill {placeholders}, e.g. { email: "invited@company.pk" }
export const authErrorMessage = (code, vars = {}) => {
  const text = typeof code === "string" ? AUTH_ERRORS[code] : null
  return text ? text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "the invited email") : null
}
