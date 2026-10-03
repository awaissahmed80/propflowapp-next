"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount, formatDate } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { AppIcon } from "@/components/app-icon"
import { AppFeatures } from "./app-features"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { inviteWorkspace, resendWorkspaceInvite, revokeWorkspaceInvite } from "../server/workspace-invites"
import { LinkSentDialog } from "@/components/link-sent-dialog"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { Notice } from "./parts"

const INVITE_DAYS = 14

// plans: active plans [{ id, name, priceMonthly, apps, off }]; defaults: { trialDays, yearlyMonths }
// apps: sellable apps (for a custom package); initial: prefill (e.g. from a get-started lead),
// may include package: { apps, off }
function InviteWorkspaceDialog({ plans, defaults, apps = [], initial = {}, onClose, onDone }) {
  const [form, setForm] = useState({
    contactName: initial.contactName ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    companyName: initial.companyName ?? "",
    planId: initial.planId ?? plans[0]?.id ?? null,
    billingCycle: "monthly",
    startAs: "trial",
    trialDays: defaults.trialDays,
    price: null,
    note: initial.note ?? "",
  })
  // null: the plan's apps and features; { apps, off }: a custom package
  const [pkg, setPkg] = useState(initial.package ?? null)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (key) => (v) => {
    setForm((f) => ({ ...f, [key]: v }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const plan = plans.find((p) => p.id === form.planId)
  const listPrice = plan ? (form.billingCycle === "yearly" ? plan.priceMonthly * defaults.yearlyMonths : plan.priceMonthly) : 0

  const submit = (e) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await inviteWorkspace({ ...form, trialDays: form.startAs === "trial" ? form.trialDays : null, package: pkg })
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else onDone(result, form.email.trim().toLowerCase())
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-2xl"
      title="Invite a new workspace"
      description="They get an email to set up their company on PropFlow. You choose the plan and terms here; they don't pick a plan or pay at setup."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="workspace-invite-form" loading={pending} leftIcon="send-plane-line">
            Send invitation
          </Button>
        </>
      }
    >
      <form id="workspace-invite-form" onSubmit={submit} noValidate className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Who</legend>
          <Input label="Contact name" autoFocus value={form.contactName} onChange={(e) => set("contactName")(e.target.value)} error={errors.contactName} />
          <Input label="Email" type="email" placeholder="name@company.pk" value={form.email} onChange={(e) => set("email")(e.target.value)} error={errors.email} />
          <Input label="Mobile" type="tel" placeholder="0300 1234567 (optional)" value={form.phone} onChange={(e) => set("phone")(e.target.value)} error={errors.phone} />
          <Input label="Company" placeholder="Optional, they can change it" value={form.companyName} onChange={(e) => set("companyName")(e.target.value)} error={errors.companyName} />
        </fieldset>

        <fieldset className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <legend className="mb-2 pt-4 text-sm font-medium">Plan and terms</legend>
          <Select label="Plan" value={form.planId} onChange={set("planId")} options={plans.map((p) => ({ value: p.id, label: `${p.name} · ${formatAmount(p.priceMonthly)}/mo` }))} error={errors.planId} />
          <div>
            <Label className="mb-0.5 text-base text-muted-foreground">Billing</Label>
            <ToggleGroup
              value={form.billingCycle}
              onChange={set("billingCycle")}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly" },
              ]}
            />
          </div>
          <NumberInput
            label={`Price per ${form.billingCycle === "yearly" ? "year" : "month"}`}
            prefix="Rs"
            min={0}
            step={500}
            placeholder={formatAmount(listPrice).replace("Rs ", "")}
            value={form.price}
            onChange={(v) => set("price")(v ?? null)}
            error={errors.price}
          />
          <p className="self-end pb-2 text-xs text-muted-foreground">
            Leave blank for the plan price ({formatAmount(listPrice)}
            {form.billingCycle === "yearly" ? `, ${defaults.yearlyMonths} months charged` : ""}).
          </p>
          <div className="sm:col-span-2">
            <Label className="mb-0.5 text-base text-muted-foreground">Starts as</Label>
            <div className="flex flex-wrap items-end gap-4">
              <ToggleGroup
                value={form.startAs}
                onChange={set("startAs")}
                options={[
                  { value: "trial", label: "Free trial" },
                  { value: "active", label: "Active, billed by invoice" },
                ]}
              />
              {form.startAs === "trial" && (
                <div className="w-32">
                  <NumberInput aria-label="Trial days" min={1} max={90} value={form.trialDays} onChange={(v) => set("trialDays")(v ?? null)} error={errors.trialDays} />
                </div>
              )}
              {form.startAs === "trial" && <span className="pb-2 text-sm text-muted-foreground">days</span>}
            </div>
          </div>
        </fieldset>

        {apps.length > 0 && (
          <fieldset className="space-y-3 border-t pt-4">
            <legend className="mb-2 pt-4 text-sm font-medium">Apps and features</legend>
            <ToggleGroup
              value={pkg ? "custom" : "plan"}
              onChange={(v) => setPkg(v === "custom" ? (pkg ?? { apps: plan?.apps ?? [], off: plan?.off ?? {} }) : null)}
              options={[
                { value: "plan", label: `As in the ${plan?.name ?? ""} plan` },
                { value: "custom", label: "Custom package" },
              ]}
            />
            {pkg && (
              <ul className="space-y-1 rounded-lg border p-2">
                {apps.map((a) => {
                  const on = pkg.apps.includes(a.code)
                  return (
                    <li key={a.code} className="px-1 py-1">
                      <label className="flex cursor-pointer items-center gap-3">
                        <AppIcon icon={a.icon} color={a.color} size="sm" className="size-7 shrink-0 rounded-md text-sm" />
                        <span className="flex-1 text-sm font-medium">{a.name}</span>
                        <Switch aria-label={a.name} checked={on} onChange={(v) => setPkg((p) => ({ ...p, apps: v ? [...p.apps, a.code] : p.apps.filter((c) => c !== a.code) }))} />
                      </label>
                      {on && <AppFeatures app={a.code} off={pkg.off?.[a.code] ?? []} onChange={(keys) => setPkg((p) => ({ ...p, off: { ...p.off, [a.code]: keys } }))} className="mt-1 ml-10" />}
                    </li>
                  )
                })}
              </ul>
            )}
            {errors.package && <p className="text-[13px] text-destructive">{errors.package}</p>}
          </fieldset>
        )}

        <Textarea label="Internal note" rows={2} placeholder="Only the console team sees this, e.g. agreed at the Lahore expo" value={form.note} onChange={(e) => set("note")(e.target.value)} error={errors.note} />
      </form>
    </Dialog>
  )
}

// initial / label: e.g. "Create workspace" from a get-started lead, prefilled with its package
export function InviteWorkspaceButton({ plans, defaults, apps = [], initial, label = "Invite workspace", ...buttonProps }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null)
  return (
    <>
      <Button leftIcon="mail-send-line" {...buttonProps} onClick={() => setDialog("form")} disabled={!plans.length} title={plans.length ? undefined : "Enable a plan first"}>
        {label}
      </Button>
      {dialog === "form" && (
        <InviteWorkspaceDialog
          plans={plans}
          defaults={defaults}
          apps={apps}
          initial={initial}
          onClose={() => setDialog(null)}
          onDone={(result, email) => {
            setDialog({ result, email })
            router.refresh()
          }}
        />
      )}
      {dialog?.result && <LinkSentDialog result={dialog.result} email={dialog.email} days={INVITE_DAYS} onClose={() => setDialog(null)} />}
    </>
  )
}

export function PendingWorkspaceInvites({ invites, manage }) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [dialog, setDialog] = useState(null)
  const [pending, startTransition] = useTransition()
  if (!invites.length) return null

  // The outcome shows as a toast, or the link dialog after a resend
  const run = (fn, success) =>
    startTransition(async () => {
      const result = await toastAction(fn, { loading: "Working on it…", success: success.text })
      if (!result?.error) {
        if (result?.link) setDialog({ result, email: success.email })
        router.refresh()
      }
    })

  return (
    <section className="shrink-0 rounded-xl border bg-background">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <Icon name="mail-send-line" className="text-muted-foreground" />
        <span className="flex-1 text-sm font-semibold">Invited, not set up yet · {invites.filter((i) => i.state !== "cancelled").length}</span>
        <Icon name="arrow-down-s-line" className={open ? "rotate-180 text-muted-foreground transition-transform" : "text-muted-foreground transition-transform"} />
      </button>
      {open && (
        <div className="border-t">
          <ul className="max-h-64 divide-y overflow-y-auto">
            {invites.map((i) => (
              <li key={i.id} className={i.state === "cancelled" ? "flex flex-wrap items-center gap-3 px-4 py-2.5 opacity-70" : "flex flex-wrap items-center gap-3 px-4 py-2.5"}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {i.companyName ?? i.contactName}
                    {i.companyName && <span className="font-normal text-muted-foreground"> · {i.contactName}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.email} · {i.planName}, {i.billingCycle}
                    {i.price != null ? ` at ${formatAmount(i.price)}` : ""} · {i.startAs === "trial" ? `${i.trialDays}-day trial` : "active, invoiced"} · by {i.invitedByName} {formatDate(i.createdAt)}
                  </span>
                  {i.note && <span className="block truncate text-xs text-muted-foreground italic">{i.note}</span>}
                </span>
                {i.state === "cancelled" ? (
                  <Badge color="gray">Cancelled</Badge>
                ) : i.state === "expired" ? (
                  <Badge color="amber">Expired</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Link expires {formatDate(i.expiresAt)}</span>
                )}
                {manage && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon="send-plane-line"
                      disabled={pending}
                      title="Emails a new single-use link. The previous link stops working."
                      onClick={() => run(() => resendWorkspaceInvite(i.id), { email: i.email })}
                    >
                      Send new link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon="link"
                      disabled={pending}
                      title="Makes a new single-use link to copy and share yourself, without emailing it. The previous link stops working."
                      onClick={() => run(() => resendWorkspaceInvite(i.id, { send: false }), { email: i.email })}
                    >
                      Copy link
                    </Button>
                    {i.state !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon="close-line"
                        disabled={pending}
                        onClick={async () =>
                          (await confirm({
                            title: `Cancel the invitation to ${i.email}?`,
                            description: "The link in their email stops working, so they can't set up the workspace with it.",
                            confirmLabel: "Cancel invitation",
                            cancelLabel: "Keep it",
                            destructive: true,
                            icon: "mail-close-line",
                          })) && run(() => revokeWorkspaceInvite(i.id), { text: `Invitation to ${i.email} canceled. Its link no longer works.` })
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {dialog?.result && <LinkSentDialog result={dialog.result} email={dialog.email} days={INVITE_DAYS} onClose={() => setDialog(null)} />}
    </section>
  )
}
