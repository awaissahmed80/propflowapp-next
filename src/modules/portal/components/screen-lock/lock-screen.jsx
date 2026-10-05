"use client"

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { createPortal } from "react-dom"
import { signOut } from "@/server/auth/actions"
import { Logo } from "@/components/logo"
import { TenantMark } from "@/components/tenant-mark"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { OtpField } from "@/components/ui/input-otp"

// The minute on this computer's clock (null on the server, so the time never mismatches)
const tick = (cb) => {
  const t = setInterval(cb, 15_000)
  return () => clearInterval(t)
}
const useMinute = () =>
  useSyncExternalStore(
    tick,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  )
const never = () => () => {}
const time = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

// A wrong try gives the form a little shake (unless less motion is preferred)
const SHAKE = [0, -10, 9, -7, 5, -2, 0].map((x) => ({ transform: `translateX(${x}px)` }))
const shake = (el) => {
  if (!el?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  el.animate(SHAKE, { duration: 420, easing: "ease-out" })
}
// Staggered rise-in (globals.css .lock-screen [data-rise])
const rise = (ms) => ({ "data-rise": "", style: { "--delay": `${ms}ms` } })

// Full-screen lock: clock, who's locked, and passcode or password to get back in.
// Locking needs a passcode, so there's normally one; a screen locked before that rule (Google-only,
// no passcode) can only sign out. leaving: unlocked, playing the exit animation.
export function LockScreen({ user, tenant, settings, lockedAt, leaving = false, onUnlock }) {
  const { hasPasscode, passcodeLength, hasPassword } = settings
  const [method, setMethod] = useState(hasPasscode ? "passcode" : hasPassword ? "password" : null)
  const [secret, setSecret] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [signingOut, startSignOut] = useTransition()
  const minute = useMinute()
  // Rendered in place on the server (a reload while locked), then moved over everything else
  const client = useSyncExternalStore(
    never,
    () => true,
    () => false,
  )
  const input = useRef(null)
  const root = useRef(null)
  const form = useRef(null)

  useEffect(() => {
    if (method === "password") input.current?.focus()
    else if (!method) root.current?.querySelector("[data-sign-out]")?.focus()
  }, [method])

  const submit = async (value = secret) => {
    if (!value || busy) return
    setBusy(true)
    const r = await onUnlock(method === "passcode" ? { passcode: value } : { password: value })
    if (r.ok) return
    setSecret("")
    shake(form.current)
    setError(r.signedOut ? "Too many tries. Signing you out…" : r.error)
    if (!r.signedOut) {
      setBusy(false)
      input.current?.focus()
    }
  }
  const leave = () => startSignOut(() => signOut())

  const now = minute == null ? null : new Date(minute * 60_000)
  const first = user.name.split(" ")[0]

  const screen = (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      aria-describedby="lock-status"
      // Keep app shortcuts (⌘K search…) from firing behind the lock
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) e.stopPropagation()
      }}
      data-leaving={leaving || undefined}
      className="lock-screen fixed inset-0 z-[100] flex flex-col overflow-x-hidden overflow-y-auto bg-background"
    >
      {/* Slowly drifting light behind everything, over a faint moving grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lock-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-40 [background-image:radial-gradient(color-mix(in_oklab,var(--foreground)_14%,transparent)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div
          className="lock-aurora absolute -top-1/3 left-1/2 size-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_62%)] blur-2xl"
          style={{ "--drift": "24s", "--dx": "8%", "--dy": "5%" }}
        />
        <div
          className="lock-aurora absolute -bottom-1/2 -left-1/4 size-[46rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,#14b8a6_16%,transparent),transparent_62%)] blur-2xl"
          style={{ "--drift": "30s", "--dx": "10%", "--dy": "-6%" }}
        />
        <div
          className="lock-aurora absolute -right-1/4 -bottom-1/3 size-[40rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,#8b5cf6_14%,transparent),transparent_62%)] blur-2xl"
          style={{ "--drift": "36s", "--dx": "-9%", "--dy": "-4%" }}
        />
      </div>
      <header className="relative flex items-center justify-between gap-3 p-5 sm:p-8" {...rise(0)}>
        <Logo className="h-8" />
        <span id="lock-status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon name={leaving ? "lock-unlock-line" : "lock-line"} className="lock-padlock" /> {leaving ? "Unlocked" : <>Locked{now && ` at ${time(new Date(lockedAt))}`}</>}
        </span>
      </header>
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <p aria-hidden className="h-16 text-6xl font-light tracking-tight tabular-nums sm:h-20 sm:text-7xl" {...rise(80)}>
          {now && time(now)}
        </p>
        <p aria-hidden className="mt-1 h-6 text-muted-foreground" {...rise(140)}>
          {now?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>

        <form
          ref={form}
          {...rise(220)}
          className="mt-10 w-full max-w-xs text-center"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <span className="lock-halo mx-auto block w-fit rounded-full">
            <Avatar name={user.name} source={user.avatarUrl} size="xl" />
          </span>
          <h1 id="lock-title" className="mt-3 text-lg font-semibold">
            {user.name}
          </h1>
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <TenantMark tenant={tenant} className="size-4 text-[8px]" />
            {tenant.name}
          </p>

          {method ? (
            <>
              <div className="mt-6">
                {method === "passcode" ? (
                  <OtpField
                    label="Passcode"
                    length={passcodeLength ?? 4}
                    masked
                    autoFocus
                    disabled={busy}
                    value={secret}
                    onChange={(v) => {
                      setSecret(v)
                      setError("")
                    }}
                    onComplete={submit}
                    error={error}
                  />
                ) : (
                  <Input.Password
                    ref={input}
                    label="Password"
                    autoComplete="current-password"
                    value={secret}
                    onChange={(e) => {
                      setSecret(e.target.value)
                      setError("")
                    }}
                    error={error}
                  />
                )}
              </div>
              {method === "password" && (
                <Button type="submit" className="mt-4 w-full" loading={busy} disabled={!secret}>
                  Unlock
                </Button>
              )}
              {hasPasscode && hasPassword && (
                <button
                  type="button"
                  className="mt-4 text-sm text-primary hover:underline"
                  onClick={() => {
                    setMethod((m) => (m === "passcode" ? "password" : "passcode"))
                    setSecret("")
                    setError("")
                  }}
                >
                  {method === "passcode" ? "Use password instead" : "Use passcode instead"}
                </button>
              )}
            </>
          ) : (
            <div className="mt-6 space-y-4">
              <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">You haven&apos;t set a passcode, so sign in again to get back in. Set one in My Desk › Profile to unlock quickly next time.</p>
              <Button type="button" data-sign-out className="w-full" leftIcon="logout-box-r-line" loading={signingOut} onClick={leave}>
                Sign out
              </Button>
            </div>
          )}
        </form>
      </main>
      {method && (
        <footer className="relative p-5 text-center text-sm text-muted-foreground sm:p-8" {...rise(320)}>
          Not {first}?{" "}
          <button type="button" disabled={signingOut} className="font-medium text-foreground hover:underline" onClick={leave}>
            Sign out
          </button>
        </footer>
      )}
    </div>
  )
  return client ? createPortal(screen, document.body) : screen
}
