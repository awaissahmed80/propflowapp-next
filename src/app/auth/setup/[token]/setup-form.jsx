"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { checkSlug, setupWorkspace, startGoogleSetup } from "@/server/tenants/setup-actions"
import { MIN_PASSWORD } from "@/lib/password"
import { slugProblem, suggestSlug } from "@/lib/workspace"
import { cn } from "@/lib/utils"
import { GoogleButton, OrDivider } from "@/components/google-button"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"

function Section({ n, title, children }) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

// Checks the short name as it's typed: format rules at once, "is it taken?" after a pause
function useSlugCheck(slug) {
  const [answer, setAnswer] = useState({ slug: null }) // the server's answer for one slug
  const problem = slug ? slugProblem(slug) : null
  useEffect(() => {
    if (!slug || slugProblem(slug)) return
    let live = true
    const id = setTimeout(async () => {
      const result = await checkSlug(slug)
      if (live) setAnswer({ slug, ok: Boolean(result.ok), message: result.error })
    }, 400)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, [slug])
  if (!slug) return { status: "idle" }
  if (problem) return { status: "error", message: problem }
  if (answer.slug !== slug) return { status: "checking" }
  return answer.ok ? { status: "ok" } : { status: "error", message: answer.message }
}

// savedCompany: details typed before a Google sign-in that has to be retried
export function SetupForm({ token, invite, savedCompany, suggestedSlug, hasAccount, google, maintenance, initialError }) {
  const [company, setCompany] = useState(savedCompany ?? { name: invite.companyName, slug: suggestedSlug, city: "", phone: invite.phone, ntn: "" })
  const [account, setAccount] = useState({ name: invite.contactName, password: "", confirm: "" })
  const [slugEdited, setSlugEdited] = useState(Boolean(suggestedSlug))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(initialError ?? "")
  const [pending, startTransition] = useTransition()
  const [via, setVia] = useState(null) // "password" | "google" while working
  const slugState = useSlugCheck(company.slug)
  const top = useRef(null)

  const setC = (key) => (e) => {
    const value = e.target.value
    setCompany((c) => ({ ...c, [key]: value, ...(key === "name" && !slugEdited ? { slug: suggestSlug(value) } : {}) }))
    setErrors((x) => ({ ...x, [key]: undefined }))
  }
  const setA = (key) => (e) => {
    setAccount((a) => ({ ...a, [key]: e.target.value }))
    setErrors((x) => ({ ...x, [key === "name" ? "accountName" : key]: undefined }))
  }
  const fail = (result) => {
    if (result.fieldErrors) setErrors(result.fieldErrors)
    setError(result.error ?? (result.fieldErrors ? "Please check the highlighted fields." : ""))
    setVia(null)
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const create = (e) => {
    e.preventDefault()
    setError("")
    setVia("password")
    startTransition(async () => {
      const result = await setupWorkspace(token, { company, account })
      // On success the action signs in and opens the portal
      if (result) fail(result)
    })
  }

  const withGoogle = () => {
    setError("")
    setVia("google")
    startTransition(async () => {
      const result = await startGoogleSetup(token, { company })
      if (result.url) window.location.assign(result.url)
      else fail(result)
    })
  }

  const slugHint =
    slugState.status === "checking" ? (
      <span className="text-muted-foreground">Checking…</span>
    ) : slugState.status === "ok" ? (
      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
        <Icon name="checkbox-circle-line" /> Available
      </span>
    ) : null

  return (
    <div data-wide ref={top} className="scroll-mt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your workspace</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Welcome, {invite.contactName.split(" ")[0]}. This takes about a minute.</p>

      <dl className="mt-5 grid grid-cols-3 divide-x rounded-lg border text-sm">
        <div className="px-3 py-2">
          <dt className="text-xs text-muted-foreground">Plan</dt>
          <dd className="font-medium">{invite.planName}</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-xs text-muted-foreground">Starts with</dt>
          <dd className="font-medium">{invite.startAs === "trial" ? `${invite.trialDays}-day trial` : "Full access"}</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-xs text-muted-foreground">To pay now</dt>
          <dd className="font-medium">Nothing</dd>
        </div>
      </dl>

      {maintenance && (
        <p role="status" className="mt-5 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <Icon name="tools-line" className="mt-0.5 text-base" />
          {maintenance} Your invitation is safe; please come back to this link a little later.
        </p>
      )}
      {error && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Icon name="error-warning-line" className="mt-0.5 text-base" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={create} noValidate className="mt-6 space-y-8">
        <Section n={1} title="Your company">
          <Input label="Company name" autoComplete="organization" value={company.name} onChange={setC("name")} error={errors.name} placeholder="Skyline Developers" />
          <div>
            <Input
              label="Workspace short name"
              info="A short, unique name for your workspace, used in your PropFlow links. You can change it later."
              value={company.slug}
              onChange={(e) => {
                setSlugEdited(true)
                setC("slug")({ target: { value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") } })
              }}
              error={errors.slug ?? (slugState.status === "error" ? slugState.message : undefined)}
              placeholder="skyline"
              startElement={<Icon name="links-line" />}
            />
            {!errors.slug && slugHint && <p className="mt-1 text-[13px]">{slugHint}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="City" autoComplete="address-level2" value={company.city} onChange={setC("city")} error={errors.city} placeholder="Lahore" />
            <Input label="Office phone" type="tel" autoComplete="tel" value={company.phone} onChange={setC("phone")} error={errors.phone} placeholder="042 35761234" />
          </div>
          <Input label="NTN (optional)" value={company.ntn} onChange={setC("ntn")} error={errors.ntn} placeholder="1234567-8" info="Shown on receipts and invoices. You can add it later in Settings." />
        </Section>

        <Section n={2} title="Your account">
          <Input label="Email" type="email" name="email" autoComplete="username" value={invite.email} readOnly startElement={<Icon name="mail-line" />} />
          {google && (
            <>
              <GoogleButton
                params={{}}
                label={hasAccount ? "Continue with Google" : "Sign up with Google"}
                onClick={(e) => {
                  e.preventDefault()
                  if (!pending) withGoogle()
                }}
                className={cn(pending && via === "google" && "pointer-events-none opacity-60")}
              />
              <p className="-mt-2 text-center text-xs text-muted-foreground">Use the Google account for {invite.email}.</p>
              <OrDivider />
            </>
          )}
          {hasAccount ? (
            <>
              <p className="text-sm text-muted-foreground">You already have a PropFlow account. Enter its password to add this workspace to it.</p>
              <Input.Password label="Password" name="password" autoComplete="current-password" value={account.password} onChange={setA("password")} startElement={<Icon name="lock-line" />} />
            </>
          ) : (
            <>
              <Input label="Your name" autoComplete="name" value={account.name} onChange={setA("name")} error={errors.accountName} startElement={<Icon name="user-3-line" />} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input.Password
                  label="Choose a password"
                  name="password"
                  autoComplete="new-password"
                  placeholder={`${MIN_PASSWORD}+ characters`}
                  value={account.password}
                  onChange={setA("password")}
                  error={errors.password}
                />
                <Input.Password label="Confirm password" name="confirm" autoComplete="new-password" value={account.confirm} onChange={setA("confirm")} error={errors.confirm} />
              </div>
            </>
          )}
        </Section>

        <div className="space-y-3">
          <Button type="submit" className="w-full" size="lg" loading={pending && via === "password"} disabled={pending || Boolean(maintenance)}>
            {pending && via === "password" ? "Setting up your workspace…" : "Create workspace"}
          </Button>
          {pending && via === "password" && <p className="text-center text-xs text-muted-foreground">Creating your own secure database. This can take a few seconds.</p>}
          <p className="text-center text-xs text-muted-foreground">
            {invite.maxUsers ? `Up to ${invite.maxUsers} users` : "Any number of users"} · {invite.maxProjects ? `${invite.maxProjects} project${invite.maxProjects === 1 ? "" : "s"}` : "unlimited projects"} on your plan
          </p>
        </div>
      </form>
    </div>
  )
}
