"use client"

import { createContext, useContext, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { siteUrl } from "@/lib/sites"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { submitEnquiry } from "../server/actions"
import { track } from "../track"

// One form for "Talk to sales" and "Start free trial". Any EnquiryButton on the
// page opens it; submissions land in the console's Sales Enquiries.

const INTERESTS = ["Inventory", "CRM", "Campaigns", "Sales", "Finance", "Resale & rentals"]
const TEXT = {
  sales: { title: "Talk to sales", description: "Tell us about your company and we'll prepare a quote.", submit: "Send" },
  trial: {
    title: "Start your free trial",
    description: "Tell us a little about your company. We'll set up your workspace and email you a link to get started, no card needed.",
    submit: "Request my trial",
  },
}

const EnquiryContext = createContext({ open: () => {}, signupOpen: false, quote: null })

// signupOpen: self sign-up is on (console Settings), so trial buttons go to the sign-up page
// quote: true when prices are hidden and the get-started wizard is on: every sales or trial
// button becomes "Create workspace", which goes to the wizard in the page (#get-started)
// initial: a form to open straight away, e.g. { kind: "trial" } from /?request=trial
export function EnquiryProvider({ trialDays, signupOpen = false, quote = false, initial = null, children }) {
  const [open, setOpen] = useState(quote ? null : initial) // { kind, plan, source }
  return (
    <EnquiryContext.Provider value={{ open: setOpen, signupOpen, quote }}>
      {children}
      {open && <EnquiryDialog key={JSON.stringify(open)} {...open} trialDays={trialDays} onClose={() => setOpen(null)} />}
    </EnquiryContext.Provider>
  )
}

// "Create workspace": to the get-started wizard further down the page
function CreateWorkspaceLink({ leftIcon, source, ...props }) {
  return (
    <Button
      {...props}
      leftIcon={leftIcon === null ? undefined : "rocket-2-line"}
      nativeButton={false}
      render={<a href="#get-started" />}
      onClick={() => track("create_workspace_click", { cta_location: source ?? "Website" })}
    >
      Create workspace
    </Button>
  )
}

export const useEnquiry = () => useContext(EnquiryContext)

// <EnquiryButton kind="sales" source="Pricing" plan="Growth">Talk to sales</EnquiryButton>, plus Button props
export function EnquiryButton({ kind = "sales", source, plan, signupPlan, ...props }) {
  const { open, signupOpen, quote } = useContext(EnquiryContext)
  // Get-started wizard on: no sales popup, every button goes to the wizard
  if (quote) {
    const { children, ...rest } = props
    void children
    return <CreateWorkspaceLink source={source} {...rest} />
  }
  if (kind === "trial" && signupOpen) {
    const href = siteUrl("auth", `/signup${signupPlan ? `?${new URLSearchParams(signupPlan)}` : ""}`)
    return <Button {...props} nativeButton={false} render={<a href={href} />} />
  }
  return <Button {...props} onClick={() => open({ kind, source, plan })} />
}

// The main call to action: "Start free trial" when self sign-up is on (console Settings),
// otherwise "Talk to sales", which opens the sales form.
export function TrialButton({ trialLabel = "Start free trial", source, plan, signupPlan, leftIcon = "rocket-2-line", ...props }) {
  const { signupOpen, quote } = useContext(EnquiryContext)
  if (quote) return <CreateWorkspaceLink leftIcon={leftIcon} source={source} {...props} />
  return signupOpen ? (
    <EnquiryButton kind="trial" source={source} plan={plan} signupPlan={signupPlan} leftIcon={leftIcon} {...props}>
      {trialLabel}
    </EnquiryButton>
  ) : (
    <EnquiryButton kind="sales" source={source} plan={plan} leftIcon={leftIcon && "customer-service-2-line"} {...props}>
      Talk to sales
    </EnquiryButton>
  )
}

function EnquiryDialog({ kind, plan, source, trialDays, onClose }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    city: "",
    projects: "2–3",
    teamSize: "6–15",
    interests: ["Inventory", "CRM"],
    callTime: "Any time",
    message: "",
    website: "",
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [sent, setSent] = useState(null)
  const [pending, startTransition] = useTransition()
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }))
  }
  const text = TEXT[kind] ?? TEXT.sales

  const submit = (e) => {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      const result = await submitEnquiry({ ...form, kind, plan: plan ?? null, source: source ?? "Website" })
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else setSent(result) // generate_lead is sent by the server once the request is saved
    })
  }

  if (sent)
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()} title="Thank you!" footer={<Button onClick={onClose}>Done</Button>}>
        <div className="py-4 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-600">
            <Icon name="check-line" />
          </span>
          <p className="mt-3 font-medium">{kind === "trial" ? "We'll email you a link to your workspace when it's ready." : "Someone from our team will call you to talk it through."}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {kind === "trial" ? `Your ${trialDays}-day trial starts when you set it up.` : "Our sales team will get back to you about your plan."}
            {sent.code && ` Your reference is ${sent.code}.`}
          </p>
        </div>
      </Dialog>
    )

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-xl"
      title={text.title}
      description={plan ? `${text.description} (${plan} plan)` : text.description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="enquiry-form" leftIcon="send-plane-line" loading={pending}>
            {text.submit}
          </Button>
        </>
      }
    >
      <form id="enquiry-form" onSubmit={submit} noValidate className="grid gap-4 p-px sm:grid-cols-2">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 sm:col-span-2 dark:text-amber-300">
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
        <Input label="Your name" autoComplete="name" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
        <Input label="Company" autoComplete="organization" value={form.company} onChange={(e) => set({ company: e.target.value })} error={errors.company} />
        <Input label="Work email" type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
        <Input label="Phone or WhatsApp" type="tel" autoComplete="tel" placeholder="0300 1234567" value={form.phone} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} />
        <Input label="City" autoComplete="address-level2" placeholder="Lahore" value={form.city} onChange={(e) => set({ city: e.target.value })} error={errors.city} />
        <Select label="Projects" value={form.projects} onChange={(v) => set({ projects: v })} options={["1", "2–3", "4–10", "More than 10"].map((x) => ({ value: x, label: x }))} />
        <Select label="Team size" value={form.teamSize} onChange={(v) => set({ teamSize: v })} options={["1–5", "6–15", "16–40", "More than 40"].map((x) => ({ value: x, label: `${x} people` }))} />
        <Select label="Best time to call" value={form.callTime} onChange={(v) => set({ callTime: v })} options={["Morning", "Afternoon", "Evening", "Any time"].map((x) => ({ value: x, label: x }))} />
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-base text-muted-foreground">Interested in</p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const on = form.interests.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ interests: on ? form.interests.filter((x) => x !== i) : [...form.interests, i] })}
                  className={cn("h-8 rounded-full border px-3 text-sm transition-colors", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40")}
                >
                  {i}
                </button>
              )
            })}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Textarea
            label="Anything we should know?"
            rows={3}
            placeholder="e.g. 2 housing projects, 600 plots, selling through dealers"
            value={form.message}
            onChange={(e) => set({ message: e.target.value })}
            error={errors.message}
          />
        </div>
      </form>
    </Dialog>
  )
}
