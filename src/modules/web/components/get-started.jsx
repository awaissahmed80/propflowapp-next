"use client"

import { useRef, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { BUSINESS_TYPES, NEEDS_FOR, NEED_GROUPS } from "../quote"
import { submitEnquiry } from "../server/actions"
import { LegalLink } from "./legal"
import { track } from "../track"

// "Create workspace" on the website (prices hidden, get-started on): a step-by-step wizard right
// in the page. What kind of business, then one plain question per area (leads, selling,
// after-sale, finance, HR), and finally where to email them when their workspace is ready. For us it's a lead in the console (kind "quote") with the package their answers imply.

const STEPS = [{ key: "business" }, ...NEED_GROUPS.map((g) => ({ key: g.title, group: g })), { key: "contact" }]

function Choice({ on, icon, title, hint, onClick, role = "checkbox" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-xs transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-lg", on ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
      {role === "checkbox" && <Icon name={on ? "checkbox-circle-fill" : "checkbox-blank-circle-line"} className={cn("shrink-0 text-xl", on ? "text-primary" : "text-muted-foreground/40")} />}
    </button>
  )
}

export function GetStartedWizard({ trialDays = 15 }) {
  const top = useRef(null)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ businessType: "", interests: [], name: "", company: "", email: "", phone: "", website: "", acceptTerms: false })
  const [touched, setTouched] = useState(false) // they changed the suggested answers themselves
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }))
  }
  const current = STEPS[step]
  const go = (n) => {
    setStep(n)
    // Which steps people reach (and where they stop) in Google Analytics
    if (n > step) track("get_started_step", { step_number: n + 1, step_name: STEPS[n].group?.title ?? STEPS[n].key })
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const toggle = (v) => {
    setTouched(true)
    set({ interests: form.interests.includes(v) ? form.interests.filter((x) => x !== v) : [...form.interests, v] })
  }

  const next = () => {
    if (current.key === "business" && !form.businessType) return setErrors({ businessType: "Pick the one closest to you." })
    if (current.key === "contact") {
      if (!form.acceptTerms) return setErrors({ acceptTerms: "Please accept the Terms & Conditions and Privacy Policy." })
      return submit()
    }
    // Before the last question: at least one answer overall
    if (STEPS[step + 1]?.key === "contact" && !form.interests.length) return setErrors({ interests: "Pick at least one thing you'd like PropFlow to do." })
    go(step + 1)
  }
  const submit = () =>
    startTransition(async () => {
      setError("")
      const r = await submitEnquiry({ ...form, kind: "quote", source: "Create workspace" })
      if (r.fieldErrors) {
        setErrors(r.fieldErrors)
        if (r.fieldErrors.businessType) go(0)
      } else if (r.error) setError(r.error)
      else {
        setDone(true)
        top.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    })

  if (done)
    return (
      <div ref={top} className="mx-auto mt-10 max-w-2xl scroll-mt-24 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-3xl text-emerald-600">
          <Icon name="mail-check-line" />
        </span>
        <h3 className="mt-4 text-xl font-semibold">You&apos;re on the list, {form.name.split(" ")[0]}!</h3>
        <p className="mt-2 text-muted-foreground">
          We&apos;re putting the final touches on PropFlow before launch. Your workspace for {form.company || "your business"} will be one of the first we set up, at an early-bird price, and we&apos;ll email{" "}
          <span className="font-medium text-foreground">{form.email}</span> when it&apos;s ready.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">We&apos;ve just sent you a confirmation email with everything you picked.</p>
      </div>
    )

  return (
    <>
      <div ref={top} className="mx-auto mt-10 max-w-3xl scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-1">
            {STEPS.map((s, i) => (
              <span key={s.key} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <div key={current.key} className="mt-6 animate-in duration-300 fade-in slide-in-from-right-4 motion-reduce:animate-none">
          {current.key === "business" && (
            <>
              <h3 className="text-xl font-semibold">What kind of business are you?</h3>
              <p className="mt-1 text-sm text-muted-foreground">We&apos;ll suggest what businesses like yours usually use.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {BUSINESS_TYPES.map((b) => (
                  <Choice
                    key={b.value}
                    role="radio"
                    on={form.businessType === b.value}
                    icon={b.icon}
                    title={b.label}
                    hint={b.hint}
                    onClick={() => {
                      set({ businessType: b.value, ...(touched ? {} : { interests: NEEDS_FOR[b.value] ?? [] }) })
                      go(1)
                    }}
                  />
                ))}
              </div>
              {errors.businessType && <p className="mt-2 text-[13px] text-destructive">{errors.businessType}</p>}
            </>
          )}

          {current.group && (
            <>
              <h3 className="text-xl font-semibold">{current.group.question}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{current.group.hint} Leave all unticked if you don&apos;t need any.</p>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {current.group.needs.map((n) => (
                  <Choice key={n.value} on={form.interests.includes(n.value)} icon={n.icon} title={n.label} onClick={() => toggle(n.value)} />
                ))}
              </div>
              {errors.interests && <p className="mt-2 text-[13px] text-destructive">{errors.interests}</p>}
            </>
          )}

          {current.key === "contact" && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                next()
              }}
            >
              <h3 className="text-xl font-semibold">Last step: who&apos;s the workspace for?</h3>
              <p className="mt-1 text-sm text-muted-foreground">We&apos;ll create your workspace with everything you picked and email your sign-in link to this address. Please use an email you check often.</p>
              {error && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  <Icon name="information-line" className="mt-0.5" /> {error}
                </p>
              )}
              {/* Honeypot: invisible to people, so only bots fill it in */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] size-px opacity-0"
                value={form.website}
                onChange={(e) => set({ website: e.target.value })}
              />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Input label="Your name" autoComplete="name" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
                <Input label="Company" autoComplete="organization" value={form.company} onChange={(e) => set({ company: e.target.value })} error={errors.company} />
                <Input label="Work email" required type="email" autoComplete="email" placeholder="you@company.pk" value={form.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
                <Input label="Mobile (optional)" type="tel" autoComplete="tel" placeholder="0300 1234567" value={form.phone} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} />
              </div>
              <div className="mt-5">
                <Checkbox
                  checked={form.acceptTerms}
                  onChange={(acceptTerms) => set({ acceptTerms })}
                  aria-invalid={errors.acceptTerms ? true : undefined}
                  label={
                    <>
                      I agree to the <LegalLink doc="terms" /> and <LegalLink doc="privacy" />.
                    </>
                  }
                />
                {errors.acceptTerms && <p className="mt-1.5 pl-6 text-[13px] text-destructive">{errors.acceptTerms}</p>}
              </div>
            </form>
          )}
        </div>

        <div className="mt-8 flex items-center gap-2 border-t pt-5">
          {step > 0 && (
            <Button variant="ghost" leftIcon="arrow-left-line" onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          {current.group && <span className="text-xs text-muted-foreground">{form.interests.length} picked so far</span>}
          {current.key !== "business" && (
            <Button
              className="ml-auto"
              size="lg"
              rightIcon={current.key === "contact" ? undefined : "arrow-right-line"}
              leftIcon={current.key === "contact" ? "rocket-2-line" : undefined}
              loading={pending}
              onClick={next}
            >
              {current.key === "contact" ? "Create my workspace" : "Next"}
            </Button>
          )}
        </div>
      </div>
      <TrialNote days={trialDays} />
    </>
  )
}

// Under the wizard: what they're signing up for
function TrialNote({ days }) {
  return (
    <ul className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
      {[
        ["gift-line", `${days}-day free trial`],
        ["bank-card-line", "No card or payment needed"],
        ["shield-check-line", "Your data stays yours"],
      ].map(([icon, text]) => (
        <li key={text} className="flex items-center gap-1.5">
          <Icon name={icon} className="text-base text-primary" /> {text}
        </li>
      ))}
    </ul>
  )
}
