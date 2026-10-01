import Link from "next/link"
import { accountFor, findConsoleInvite, findInvite, findMemberInvite } from "@/server/auth/invitations"
import { getSession } from "@/server/auth/dal"
import { usersByIds } from "@/modules/console/server/queries"
import { PLATFORM_ROLES } from "@/modules/console/roles"
import { Icon } from "@/components/ui/icon"
import { AcceptForm } from "./accept-form"
import { googleEnabled } from "@/server/auth/google"
import { authErrorMessage } from "@/lib/auth-errors"

export const metadata = { title: "Accept invitation", robots: { index: false } }

export default async function InvitePage({ params, searchParams }) {
  const [{ token }, { error }] = await Promise.all([params, searchParams])
  const kind = (await findInvite(token))?.kind
  const invite = kind === "tenant" ? await findMemberInvite(token) : kind === "console" ? await findConsoleInvite(token) : null

  if (!invite) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-xl text-muted-foreground">
          <Icon name="mail-close-line" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Invitation not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">This link has expired, was already used, or was replaced by a newer invitation. Ask whoever invited you to send a new one.</p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Go to sign in
        </Link>
      </div>
    )
  }

  const [account, inviters, session] = await Promise.all([accountFor(invite.email), usersByIds([invite.invitedBy]), getSession()])
  // Joining a workspace, or the PropFlow console team
  const member = invite.kind === "tenant"
  const role = member ? { label: invite.role?.name ?? "a member", description: invite.role?.description } : PLATFORM_ROLES[invite.consoleRole]
  const signedInAs = session && session.user.email !== invite.email ? session.user.email : null
  const inviter = inviters.get(invite.invitedBy)?.name ?? (member ? "Your company" : "The platform owner")

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{member ? `Join ${invite.tenant.name}` : "Join the PropFlow team"}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {inviter} invited you to {member ? `${invite.tenant.name} on PropFlow` : "the console"} as <span className="font-medium text-foreground">{role?.label}</span>.
      </p>
      {role?.description && (
        <p className="mt-4 flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Icon name="shield-user-line" className="mt-0.5 text-base" />
          {role.description}
        </p>
      )}
      {signedInAs && (
        <p className="mt-3 text-xs text-muted-foreground">
          You&apos;re signed in as {signedInAs} on this browser. Accepting signs you in as {invite.email} instead.
        </p>
      )}
      <AcceptForm token={token} email={invite.email} name={invite.name ?? ""} hasAccount={Boolean(account)} google={googleEnabled()} initialError={authErrorMessage(error, { email: invite.email })} />
    </>
  )
}
