"use client"

import { useActionState, useState } from "react"
import { acceptInvite } from "@/server/auth/invite-actions"
import { MIN_PASSWORD } from "@/lib/password"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { GoogleButton, OrDivider } from "@/components/google-button"

export function AcceptForm({ token, email, name: invitedName, hasAccount, google, initialError }) {
  const [state, formAction, pending] = useActionState(acceptInvite, { error: initialError ?? undefined })
  const [name, setName] = useState(invitedName)
  const errors = state.fieldErrors ?? {}

  return (
    <>
      {state.error && (
        <div role="alert" className="mt-6 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Icon name="error-warning-line" className="mt-0.5 text-base" />
          {state.error}
        </div>
      )}
      {google && (
        <div className="mt-6 space-y-4">
          <GoogleButton params={{ intent: "invite", token }} label="Accept with Google" />
          <p className="text-center text-xs text-muted-foreground">Use the Google account for {email}.</p>
          <OrDivider />
        </div>
      )}

      <form action={formAction} noValidate className={google ? "mt-4 space-y-4" : "mt-6 space-y-4"}>
        <input type="hidden" name="token" value={token} />
        {/* Lets password managers file the new password under the right email */}
        <Input label="Email" type="email" name="email" autoComplete="username" value={email} readOnly startElement={<Icon name="mail-line" />} />

        {hasAccount ? (
          <>
            <p className="text-sm text-muted-foreground">You already have a PropFlow account. Enter its password to accept.</p>
            <Input.Password label="Password" name="password" autoComplete="current-password" autoFocus placeholder="Your password" startElement={<Icon name="lock-line" />} />
          </>
        ) : (
          <>
            <Input label="Your name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} startElement={<Icon name="user-3-line" />} />
            <div>
              <Input.Password
                label="Choose a password"
                name="password"
                autoComplete="new-password"
                autoFocus
                placeholder={`At least ${MIN_PASSWORD} characters`}
                error={errors.password}
                startElement={<Icon name="lock-line" />}
              />
            </div>
            <Input.Password label="Confirm password" name="confirm" autoComplete="new-password" placeholder="Type it again" error={errors.confirm} startElement={<Icon name="lock-line" />} />
          </>
        )}

        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Joining…" : hasAccount ? "Accept and sign in" : "Create account and join"}
        </Button>
      </form>
      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon name="shield-keyhole-line" className="text-sm" />
        Secured by PropFlow ID. Activity is logged.
      </p>
    </>
  )
}
