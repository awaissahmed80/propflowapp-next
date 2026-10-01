import { redirect } from "next/navigation"
import { getSession } from "@/server/auth/dal"
import { siteUrl } from "@/lib/sites"
import { LoginForm } from "./login-form"
import { googleEnabled } from "@/server/auth/google"
import { authErrorMessage } from "@/lib/auth-errors"
import { getSiteSettings } from "@/server/platform-settings"
import { Icon } from "@/components/ui/icon"

export const metadata = { title: "Sign in" }

export default async function LoginPage({ searchParams }) {
  const { redirect: redirectTo, email, error } = await searchParams
  // Already signed in on this browser: straight through (single sign-on across subdomains)
  const session = await getSession()
  if (session?.kind === "console") redirect(siteUrl("console"))
  const site = await getSiteSettings()

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your PropFlow account to continue.</p>
      {site.maintenance && (
        <p role="status" className="mt-6 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <Icon name="tools-line" className="mt-0.5 text-base" />
          {site.message || "PropFlow is down for maintenance."} Only the PropFlow team can sign in right now.
        </p>
      )}
      <LoginForm redirectTo={typeof redirectTo === "string" ? redirectTo : ""} email={typeof email === "string" ? email : ""} google={googleEnabled()} initialError={authErrorMessage(error)} />
    </>
  )
}
