"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { completeSetup, removeBankAccount, removeLogo, saveBankAccount, saveCashOpening, saveCompanyProfile, savePreferences, uploadLogo } from "../server/setup-actions"

const STEPS = [
  { key: "profile", title: "Company profile", text: "Name, address and tax details for documents", icon: "building-2-line", required: true },
  { key: "logo", title: "Logo", text: "Shown on receipts, letters and invoices", icon: "image-line" },
  { key: "accounts", title: "Cash & bank accounts", text: "Where your collections are received (you can add these later in Finance)", icon: "bank-line" },
  { key: "preferences", title: "Preferences", text: "Financial year and marla size", icon: "settings-4-line" },
]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function Notice({ tone = "success", children }) {
  return (
    <p role="status" className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", tone === "error" ? "bg-red-500/10 text-red-800 dark:text-red-300" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300")}>
      <Icon name={tone === "error" ? "error-warning-line" : "checkbox-circle-line"} className="mt-0.5" /> {children}
    </p>
  )
}

// Saves, then refreshes the page data and moves on to `next`
function useSave(next) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const save = (fn, { stay = false, success = "" } = {}) =>
    startTransition(async () => {
      setErrors({})
      setError("")
      setSaved("")
      const r = await fn()
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.error) setError(r.error)
      else {
        if (!stay && next) router.push(`/setup?step=${next}`)
        if (success) setSaved(success)
        router.refresh()
      }
    })
  return { save, pending, errors, error, saved }
}

function StepHeader({ step }) {
  return (
    <div className="border-b pb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{step.title}</h2>
        {step.required ? <Badge color="amber">Required</Badge> : <Badge color="gray">Optional</Badge>}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">{step.text}</p>
    </div>
  )
}

// ---------- steps ----------

// inSettings: used in Settings › Company Profile (saves in place) rather than the setup wizard
export function ProfileStep({ settings, disabled, inSettings = false }) {
  const [form, setForm] = useState(() => ({
    company_name: settings.company_name ?? "",
    company_legal_name: settings.company_legal_name ?? "",
    company_address: settings.company_address ?? "",
    company_city: settings.company_city ?? "",
    company_phone: settings.company_phone ?? "",
    company_email: settings.company_email ?? "",
    company_ntn: settings.company_ntn ?? "",
    company_strn: settings.company_strn ?? "",
    company_secp: settings.company_secp ?? "",
    company_website: settings.company_website ?? "",
  }))
  const { save, pending, errors, error, saved } = useSave(inSettings ? null : "logo")
  const field = (k, label, props = {}) => <Input label={label} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} error={errors[k]} disabled={disabled} {...props} />
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save(() => saveCompanyProfile(form), { success: inSettings ? "Company profile saved." : "" })
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice>{saved}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("company_name", "Name customers know you by", { required: true, placeholder: "Skyline Developers" })}
        {field("company_legal_name", "Registered name", { required: true, placeholder: "Skyline Developers (Pvt) Ltd", info: "As registered with SECP or the tax office. Printed on receipts and agreements." })}
        <div className="sm:col-span-2">{field("company_address", "Office address", { required: true, placeholder: "Plot 12, Main Boulevard, Gulberg III" })}</div>
        {field("company_city", "City", { required: true, placeholder: "Lahore" })}
        {field("company_phone", "Office phone", { required: true, type: "tel", placeholder: "042 35761234" })}
        {field("company_email", "Office email", { required: true, type: "email", placeholder: "info@skyline.pk" })}
        {field("company_website", "Website", { placeholder: "skyline.pk" })}
      </div>
      <div className="border-t pt-4">
        <p className="mb-3 text-sm font-medium">Tax &amp; registration (optional)</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("company_ntn", "NTN", { placeholder: "1234567-8" })}
          {field("company_strn", "STRN", { placeholder: "Sales tax registration" })}
          {field("company_secp", "SECP registration", { placeholder: "0123456" })}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={disabled}>
          {inSettings ? "Save changes" : "Save and continue"}
        </Button>
      </div>
    </form>
  )
}

export function LogoStep({ logoUrl, disabled, inSettings = false }) {
  const { save, pending, error } = useSave(null)
  const router = useRouter()
  const pick = (file) => {
    if (!file) return
    const data = new FormData()
    data.set("logo", file)
    save(() => uploadLogo(data), { stay: true })
  }
  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
        <div className="flex h-32 items-center justify-center rounded-xl border bg-white p-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL preview
            <img src={logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-gray-400">
              <Icon name="image-line" className="block text-3xl" />
              No logo yet
            </span>
          )}
        </div>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">Use a PNG with a transparent background if you have one, at least 400 px wide. JPG and WebP work too, up to 2 MB.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leftIcon="upload-2-line" loading={pending} disabled={disabled} nativeButton={false} render={<label />}>
              {logoUrl ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled} onChange={(e) => pick(e.target.files?.[0])} />
            </Button>
            {logoUrl && (
              <Button variant="ghost" leftIcon="delete-bin-line" disabled={disabled || pending} onClick={() => save(() => removeLogo(), { stay: true })}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {!inSettings && (
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant={logoUrl ? "default" : "outline"} onClick={() => router.push("/setup?step=accounts")}>
            {logoUrl ? "Continue" : "Skip for now"}
          </Button>
        </div>
      )}
    </div>
  )
}

function BankDialog({ account, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    bankName: account?.bankName ?? "",
    purpose: account?.description ?? (account ? "" : "Collections"),
    accountTitle: account?.accountTitle ?? "",
    accountNumber: account?.accountNumber ?? "",
    iban: account?.iban ?? "",
    branch: account?.branch ?? "",
    openingBalance: account?.openingBalance ?? 0,
    isDefault: account?.isDefault ?? false,
  }))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const field = (k, label, props = {}) => <Input label={label} value={form[k]} onChange={(e) => set(k)(e.target.value)} error={errors[k]} {...props} />
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-xl"
      title={account ? `Edit ${account.name}` : "Add a bank account"}
      description="The accounts your buyers pay into, and that you pay from."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await saveBankAccount(account?.id ?? null, { ...form, openingBalance: Number(form.openingBalance) || 0 })
                if (r.fieldErrors) setErrors(r.fieldErrors)
                else if (r.error) setError(r.error)
                else onSaved()
              })
            }
          >
            {account ? "Save" : "Add account"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("bankName", "Bank", { required: true, placeholder: "Meezan Bank" })}
        {field("purpose", "Used for", { placeholder: "Collections, Payroll, Current…" })}
        {field("accountTitle", "Account title", { required: true, placeholder: "Skyline Developers (Pvt) Ltd" })}
        {field("accountNumber", "Account number", { required: true, placeholder: "0102-0104567821" })}
        <div className="sm:col-span-2">{field("iban", "IBAN", { placeholder: "PK36 MEZN 0001 0201 0456 7821", info: "Printed on invoices and receipts so buyers can transfer." })}</div>
        {field("branch", "Branch", { placeholder: "Main Boulevard Gulberg, Lahore" })}
        <NumberInput
          label="Opening balance"
          prefix="Rs"
          min={0}
          value={form.openingBalance}
          onChange={(v) => set("openingBalance")(v ?? 0)}
          error={errors.openingBalance}
          info="Balance on the day you start using PropFlow."
        />
      </div>
      <div className="rounded-lg border p-3">
        <Switch label="Default account for receipts" description="Buyer payments are received into this account unless someone picks another." checked={form.isDefault} onChange={set("isDefault")} />
      </div>
    </Dialog>
  )
}

function AccountsStep({ accounts, disabled }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null) // "new" | account
  const [cash, setCash] = useState(() => Object.fromEntries(accounts.filter((a) => a.kind === "cash").map((a) => [a.code, a.openingBalance])))
  const { save, pending, errors, error } = useSave(null)
  const banks = accounts.filter((a) => a.kind === "bank")
  const cashAccounts = accounts.filter((a) => a.kind === "cash")
  return (
    <div className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Bank accounts</p>
            <p className="text-sm text-muted-foreground">Add the accounts your buyers pay into now, or later in Finance.</p>
          </div>
          <Button leftIcon="add-line" disabled={disabled} onClick={() => setDialog("new")}>
            Add bank account
          </Button>
        </div>
        {banks.length ? (
          <ul className="divide-y rounded-xl border">
            {banks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="bank-line" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {b.name}
                    {b.isDefault && <Badge color="green">Default for receipts</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {b.code} · {b.accountTitle} · {b.accountNumber}
                    {b.iban ? ` · ${b.iban}` : ""}
                  </span>
                </span>
                <span className="text-sm tabular-nums">{formatAmount(b.openingBalance)}</span>
                <IconButton icon="edit-line" aria-label={`Edit ${b.name}`} disabled={disabled} onClick={() => setDialog(b)} />
                <IconButton icon="delete-bin-line" aria-label={`Remove ${b.name}`} disabled={disabled || pending} onClick={() => save(() => removeBankAccount(b.id), { stay: true })} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No bank accounts yet. You can skip this and add them later.</div>
        )}
      </section>

      <section className="border-t pt-5">
        <p className="font-medium">Cash</p>
        <p className="mb-3 text-sm text-muted-foreground">Cash in hand and petty cash are ready to use. Enter what you have today, if anything.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {cashAccounts.map((a) => (
            <NumberInput
              key={a.code}
              label={`${a.name} (${a.code})`}
              prefix="Rs"
              min={0}
              value={cash[a.code] ?? 0}
              onChange={(v) => setCash((c) => ({ ...c, [a.code]: v ?? 0 }))}
              error={errors[a.code]}
              disabled={disabled}
            />
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button disabled={disabled} loading={pending} onClick={() => save(() => saveCashOpening(cash).then((r) => (r.ok ? (router.push("/setup?step=preferences"), r) : r)), { stay: true })}>
          {banks.length ? "Save and continue" : "Continue"}
        </Button>
      </div>
      {dialog && (
        <BankDialog
          account={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function PreferencesStep({ settings, disabled }) {
  const [form, setForm] = useState({ financial_year_start_month: Number(settings.financial_year_start_month ?? 7), marla_sq_ft: Number(settings.marla_sq_ft ?? 225) })
  const { save, pending, error } = useSave(null)
  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Financial year starts in"
          value={form.financial_year_start_month}
          onChange={(v) => setForm((f) => ({ ...f, financial_year_start_month: v }))}
          options={MONTHS.map((m, i) => ({ value: i + 1, label: i === 6 ? `${m} (Pakistan's tax year)` : m }))}
          disabled={disabled}
        />
        <Select
          label="One marla is"
          value={form.marla_sq_ft}
          onChange={(v) => setForm((f) => ({ ...f, marla_sq_ft: v }))}
          options={[
            { value: 225, label: "225 sq ft (most societies)" },
            { value: 250, label: "250 sq ft" },
            { value: 272, label: "272 sq ft (revenue record)" },
          ]}
          disabled={disabled}
        />
      </div>
      <p className="text-sm text-muted-foreground">You can change these later in Settings. Projects can also use their own marla size.</p>
      <div className="flex justify-end border-t pt-4">
        <Button loading={pending} disabled={disabled} onClick={() => save(() => savePreferences(form), { stay: true })}>
          Save preferences
        </Button>
      </div>
    </div>
  )
}

// ---------- page ----------

export function SetupWizard({ step, setup, logoUrl, canSetUp, firstName, workspaceName }) {
  const [finishing, startFinishing] = useTransition()
  const [finishError, setFinishError] = useState("")
  const current = STEPS.find((s) => s.key === step) ?? STEPS[0]
  const doneCount = STEPS.filter((s) => setup.steps[s.key]).length
  const disabled = !canSetUp

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Get started</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{setup.completedAt ? `${workspaceName} setup` : `Welcome, ${firstName}. Let's set up ${workspaceName}.`}</h1>
          <p className="mt-1 text-muted-foreground">
            {setup.requiredDone
              ? "Your company profile is done. Add the optional details now or later, then finish setup to open your apps."
              : "A few details before your team starts. Only the company profile is required."}
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{doneCount}</span> of {STEPS.length} done
          <span className="mt-1 block h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <span className="block h-full bg-primary transition-all" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
          </span>
        </div>
      </div>

      {!canSetUp && (
        <div className="mt-6">
          <Notice tone="error">Your workspace owner is setting things up. You&apos;ll be able to use the apps once they finish.</Notice>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label="Setup steps" className="h-fit rounded-xl border bg-background p-2 shadow-xs">
          <ol className="space-y-1">
            {STEPS.map((s, i) => {
              const done = setup.steps[s.key]
              const active = s.key === current.key
              return (
                <li key={s.key}>
                  <Link
                    href={`/setup?step=${s.key}`}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex items-start gap-3 rounded-lg px-3 py-2.5 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                      active && "bg-accent text-accent-foreground hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        done ? "border-emerald-600 bg-emerald-600 text-white" : active ? "border-primary text-primary" : "text-muted-foreground",
                      )}
                    >
                      {done ? <Icon name="check-line" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block text-xs text-muted-foreground">{s.required ? "Required" : "Optional"}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
          <div className="mt-2 border-t p-2">
            {finishError && <p className="mb-2 text-xs text-destructive">{finishError}</p>}
            <Button
              className="w-full"
              leftIcon="rocket-2-line"
              disabled={!setup.requiredDone || disabled}
              loading={finishing}
              onClick={() =>
                startFinishing(async () => {
                  const r = await completeSetup()
                  if (r?.error) setFinishError(r.error)
                })
              }
            >
              {setup.completedAt ? "Back to apps" : "Finish setup"}
            </Button>
            {!setup.requiredDone && <p className="mt-2 text-center text-xs text-muted-foreground">Fill in the company profile to finish.</p>}
          </div>
        </nav>

        <section className="min-w-0 space-y-5 rounded-xl border bg-background p-5 shadow-xs sm:p-6">
          <StepHeader step={current} />
          {current.key === "profile" && <ProfileStep settings={setup.settings} disabled={disabled} />}
          {current.key === "logo" && <LogoStep logoUrl={logoUrl} disabled={disabled} />}
          {current.key === "accounts" && <AccountsStep accounts={setup.accounts} disabled={disabled} />}
          {current.key === "preferences" && <PreferencesStep settings={setup.settings} disabled={disabled} />}
        </section>
      </div>
    </main>
  )
}
