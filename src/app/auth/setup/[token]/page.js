import Link from "next/link"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { googleEnabled } from "@/server/auth/google"
import { findWorkspaceInvite } from "@/server/tenants/invitations"
import { getSiteSettings } from "@/server/platform-settings"
import { authErrorMessage } from "@/lib/auth-errors"
import { suggestSlug } from "@/lib/workspace"
import { Icon } from "@/components/ui/icon"
import { cookies } from "next/headers"
import { GOOGLE_SETUP_COOKIE } from "@/server/auth/google"
import { readSigned } from "@/server/auth/secrets"
import { SetupForm } from "./setup-form"

export const metadata = { title: "Set up your workspace", robots: { index: false } }

// Company details kept in the signed setup cookie, if they belong to this link and are still fresh
function savedDetails(cookie, token) {
  const saved = readSigned(cookie)
  return saved && saved.token === token && saved.exp > Date.now() ? saved.company : null
}

// Where workspace invitation links land: company details + the owner's account → a new workspace
export default async function SetupPage({ params, searchParams }) {
  const [{ token }, { error }] = await Promise.all([params, searchParams])
  const [invite, site] = await Promise.all([findWorkspaceInvite(token), getSiteSettings()])

  if (!invite) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-xl text-muted-foreground">
          <Icon name="mail-close-line" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Invitation not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link has expired, was already used, or was replaced by a newer invitation. If you already set up your workspace, sign in instead.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Go to sign in
        </Link>
      </div>
    )
  }

  const [account, jar] = await Promise.all([live(authDb(), "users").where({ email: invite.email }).first("id"), cookies()])
  // Details typed before going to Google (kept if that sign-in has to be retried)
  const savedCompany = savedDetails(jar.get(GOOGLE_SETUP_COOKIE)?.value, token)
  return (
    <SetupForm
      token={token}
      invite={{
        email: invite.email,
        contactName: invite.contactName,
        companyName: invite.companyName ?? "",
        phone: invite.phone ?? "",
        planName: invite.planName,
        startAs: invite.startAs,
        trialDays: invite.trialDays,
        maxProjects: invite.maxProjects,
        maxUsers: invite.maxUsers,
      }}
      savedCompany={savedCompany}
      suggestedSlug={suggestSlug(invite.companyName ?? "")}
      hasAccount={Boolean(account)}
      google={googleEnabled()}
      maintenance={site.maintenance ? site.message || "PropFlow is down for maintenance." : null}
      initialError={authErrorMessage(error, { email: invite.email })}
    />
  )
}
