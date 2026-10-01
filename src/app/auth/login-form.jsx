"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { signIn } from "@/server/auth/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/ui/icon"
import { GoogleButton, OrDivider } from "@/components/google-button"

export function LoginForm({ redirectTo, email: initialEmail, google, initialError }) {
  const [state, formAction, pending] = useActionState(signIn, { error: initialError ?? undefined })
  // Controlled, so a failed attempt keeps what was typed (React resets forms after an action)
  const [email, setEmail] = useState(initialEmail)
  const [remember, setRemember] = useState(true)
  const [capsLock, setCapsLock] = useState(false)
  const detectCapsLock = (e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)
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
          <GoogleButton params={{ intent: "signin", redirect: redirectTo }} />
          <OrDivider />
        </div>
      )}

      <form action={formAction} noValidate className={google ? "mt-4 space-y-4" : "mt-6 space-y-4"}>
        <input type="hidden" name="redirect" value={redirectTo} />
        <input type="hidden" name="remember" value={remember ? "on" : ""} />

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          placeholder="name@company.pk"
          startElement={<Icon name="mail-line" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <div>
          <Input.Password
            label="Password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            startElement={<Icon name="lock-line" />}
            onKeyDown={detectCapsLock}
            onKeyUp={detectCapsLock}
            onBlur={() => setCapsLock(false)}
            error={errors.password}
          />
          {capsLock && (
            <p className="mt-1 flex items-center gap-1 text-[13px] text-amber-600 dark:text-amber-400">
              <Icon name="keyboard-line" /> Caps Lock is on
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <Checkbox label="Keep me signed in" className="text-muted-foreground" checked={remember} onChange={setRemember} />
          <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon name="shield-keyhole-line" className="text-sm" />
        Secured by PropFlow ID. Activity is logged.
      </p>
    </>
  )
}
