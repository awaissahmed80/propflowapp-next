"use client"

import { createContext, useContext, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { submitEnquiry } from "../server/actions"
import { track } from "../track"

// "Book a demo": the website's main action. Every DemoButton opens the same short form (name,
// phone, company; email and city optional), which saves a demo request (kind "demo") to the
// console's Sales Enquiries. DemoForm is also used inline: the closing section and /book-a-demo.

const DemoContext = createContext({ open: () => {} })
export const useDemo = () => useContext(DemoContext)

// initial: open the form straight away (links like /?request=demo)
export function DemoProvider({ initial = false, children }) {
  const [source, setSource] = useState(initial ? "Link" : null)
  return (
    <DemoContext.Provider value={{ open: setSource }}>
      {children}
      {source && (
        <Dialog open onOpenChange={(o) => !o && setSource(null)} scrollable className="sm:max-w-lg" title="Book a demo" description="A 30-minute walk-through of PropFlow, set up around your own projects. We'll call you to pick a time.">
          <DemoForm source={source} autoFocus onDone={() => setSource(null)} />
        </Dialog>
      )}
    </DemoContext.Provider>
  )
}

// <DemoButton source="Hero" />: the site's one button shape (.pf-btn)
export function DemoButton({ source, className, tone, children = "Book a demo", arrow = true }) {
  const { open } = useDemo()
  return (
    <button
      type="button"
      data-tone={tone}
      className={cn("pf-btn", className)}
      onClick={() => {
        track("demo_click", { cta_location: source })
        open(source)
      }}
    >
      {children}
      {arrow && <Icon name="arrow-right-line" className="pf-arrow" aria-hidden />}
    </button>
  )
}

const TIMES = ["Morning", "Afternoon", "Evening"]
const EMPTY = { name: "", phone: "", company: "", email: "", city: "", callTime: "Morning", website: "" }

// The form itself. compact: only name, phone and company (plus the call time)
export function DemoForm({ source, compact = false, autoFocus = false, onDone, defaults, className }) {
  const [form, setForm] = useState({ ...EMPTY, ...defaults })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [sent, setSent] = useState(null)
  const [pending, startTransition] = useTransition()
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }))
  }
  const submit = (e) => {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      const result = await submitEnquiry({ ...form, kind: "demo", source: source ?? "Website" })
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else setSent(result) // generate_lead (lead_type demo) is sent by the server
    })
  }

  if (sent)
    return (
      <div role="status" className={cn("py-6 text-center", className)}>
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-600">
          <Icon name="check-line" />
        </span>
        <p className="mt-3 text-lg font-medium">Thank you, we’ll call you soon.</p>
        <p className="mt-1 text-muted-foreground">
          We’ll ring you in the {form.callTime.toLowerCase()} to pick a time for your demo.
          {sent.code && ` Your reference is ${sent.code}.`}
        </p>
        {onDone && (
          <Button className="mt-5" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    )

  return (
    <form onSubmit={submit} noValidate className={cn("grid gap-4", !compact && "sm:grid-cols-2", className)}>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
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
      <Input size="lg" label="Your name" autoComplete="name" autoFocus={autoFocus} value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
      <Input size="lg" label="Phone or WhatsApp" type="tel" autoComplete="tel" placeholder="0300 1234567" value={form.phone} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} />
      <div className={cn(!compact && "sm:col-span-2")}>
        <Input size="lg" label="Company" autoComplete="organization" placeholder="e.g. Skyline Developers" value={form.company} onChange={(e) => set({ company: e.target.value })} error={errors.company} />
      </div>
      {!compact && (
        <>
          <Input size="lg" label="Email (optional)" type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
          <Input size="lg" label="City (optional)" autoComplete="address-level2" placeholder="Lahore" value={form.city} onChange={(e) => set({ city: e.target.value })} error={errors.city} />
        </>
      )}
      <fieldset className={cn(!compact && "sm:col-span-2")}>
        <legend className="mb-1.5 text-sm text-muted-foreground">Best time to call</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={form.callTime === t}
              onClick={() => set({ callTime: t })}
              className={cn("h-9 rounded-[5px] text-sm transition-colors", form.callTime === t ? "bg-background font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="lg" loading={pending} rightIcon="arrow-right-line" className={cn("h-13 w-full text-base", !compact && "sm:col-span-2")}>
        Book my demo
      </Button>
      <p className={cn("text-center text-sm text-muted-foreground", !compact && "sm:col-span-2")}>Free, no obligation. We only use your number to arrange the demo.</p>
    </form>
  )
}
