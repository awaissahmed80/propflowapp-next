"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { requestResetCode, setNewPassword, verifyResetCode } from "@/server/auth/reset-actions"
import { MIN_PASSWORD } from "@/lib/password"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { OtpField } from "@/components/ui/input-otp"

function Alert({ children }) {
  return (
    <div role="alert" className="mt-6 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <Icon name="error-warning-line" className="mt-0.5 text-base" />
      <span>{children}</span>
    </div>
  )
}

function BackToSignIn({ email }) {
  return (
    <Link href={email ? `/?email=${encodeURIComponent(email)}` : "/"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <Icon name="arrow-left-line" /> Back to sign in
    </Link>
  )
}

// Counts down to when "Send a new code" is allowed again
function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [left])
  return [left, setLeft]
}

// Forgot password in three steps: email → 6-digit code → new password
export function ResetFlow({ initialEmail }) {
  const [step, setStep] = useState("email") // email | code | password | done
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState("")
  const [ticket, setTicket] = useState(null)
  const [form, setForm] = useState({ password: "", confirm: "" })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [resendIn, setResendIn] = useCountdown(0)
  // Remounts the code field so it takes focus again after a wrong code or a new code
  const [codeRound, setCodeRound] = useState(0)
  const [pending, startTransition] = useTransition()

  const sendCode = (again = false) =>
    startTransition(async () => {
      setError("")
      setErrors({})
      const result = await requestResetCode(email)
      if (result.fieldErrors) return setErrors(result.fieldErrors)
      if (result.error) return setError(result.error)
      setEmail(result.email)
      setCode("")
      setCodeRound((r) => r + 1)
      setResendIn(result.resendIn)
      if (again) toast.success("If there's an account for this email, a new code is on its way.")
      setStep("code")
    })

  const checkCode = (value) =>
    startTransition(async () => {
      setError("")
      const result = await verifyResetCode(email, value)
      if (result.error) {
        setError(result.error)
        setCode("")
        setCodeRound((r) => r + 1)
        return
      }
      setTicket(result.ticket)
      setStep("password")
    })

  const savePassword = (e) => {
    e.preventDefault()
    startTransition(async () => {
      setError("")
      setErrors({})
      const result = await setNewPassword(ticket, form)
      if (result?.fieldErrors) return setErrors(result.fieldErrors)
      if (result?.error) {
        setError(result.error)
        if (result.restart) {
          setTicket(null)
          setStep("email")
        }
        return
      }
      // Signed in and sent to the console by redirect, or: password set, sign in normally
      if (result?.done) setStep("done")
    })
  }

  if (step === "done")
    return (
      <>
        <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-xl text-emerald-600">
          <Icon name="checkbox-circle-line" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Password changed</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">You can now sign in with your new password. Every other device was signed out.</p>
        <Button className="mt-6 w-full" nativeButton={false} render={<Link href={`/?email=${encodeURIComponent(email)}`} />}>
          Sign in
        </Button>
      </>
    )

  if (step === "password")
    return (
      <>
        <BackToSignIn email={email} />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          For <span className="font-medium text-foreground">{email}</span>. At least {MIN_PASSWORD} characters.
        </p>
        {error && <Alert>{error}</Alert>}
        <form onSubmit={savePassword} noValidate className="mt-6 space-y-4">
          {/* Lets password managers save the new password under the right email */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <Input.Password
            label="New password"
            name="password"
            autoComplete="new-password"
            autoFocus
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
            startElement={<Icon name="lock-line" />}
          />
          <Input.Password
            label="Confirm new password"
            name="confirm"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            error={errors.confirm}
            startElement={<Icon name="lock-line" />}
          />
          <Button type="submit" loading={pending} className="w-full">
            {pending ? "Saving…" : "Save password and sign in"}
          </Button>
        </form>
      </>
    )

  if (step === "code")
    return (
      <>
        <button type="button" onClick={() => setStep("email")} className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Use a different email
        </button>
        <span className="mt-4 flex size-11 items-center justify-center rounded-full bg-primary/10 text-xl text-primary">
          <Icon name="mail-send-line" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          If there&apos;s an account for <span className="font-medium text-foreground">{email}</span>, we&apos;ve sent a 6-digit code. It works for 15 minutes.
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="mt-6">
          <OtpField
            key={codeRound}
            fill
            label="Enter the code"
            value={code}
            onChange={(v) => {
              setCode(v)
              setError("")
            }}
            onComplete={(v) => !pending && checkCode(v)}
            autoFocus
          />
        </div>
        <Button className="mt-6 w-full" loading={pending} disabled={code.length !== 6} onClick={() => checkCode(code)}>
          {pending ? "Checking…" : "Continue"}
        </Button>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Didn&apos;t get it? Check spam, or{" "}
          {resendIn > 0 ? (
            <span>send a new code in {resendIn}s</span>
          ) : (
            <button type="button" onClick={() => sendCode(true)} disabled={pending} className="cursor-pointer font-medium text-primary hover:underline">
              send a new code
            </button>
          )}
          .
        </p>
      </>
    )

  return (
    <>
      <BackToSignIn email={email} />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a code to choose a new password.</p>
      {error && <Alert>{error}</Alert>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          sendCode()
        }}
        noValidate
        className="mt-6 space-y-4"
      >
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          placeholder="name@company.pk"
          startElement={<Icon name="mail-line" />}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setErrors({})
          }}
          error={errors.email}
        />
        <Button type="submit" loading={pending} className="w-full">
          {pending ? "Sending…" : "Send code"}
        </Button>
      </form>
    </>
  )
}
