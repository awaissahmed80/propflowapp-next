"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { removeEmailSettings, saveEmailSettings, sendTestEmail } from "./actions"

// Common providers: picking one fills in the server, port and security
const PRESETS = [
  { value: "google", label: "Google Workspace / Gmail", host: "smtp.gmail.com", port: 587, security: "starttls", hint: "Use an app password (Google Account → Security → App passwords), not your normal password." },
  { value: "microsoft", label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, security: "starttls", hint: "SMTP sending must be allowed for this mailbox in the Microsoft 365 admin center." },
  { value: "zoho", label: "Zoho Mail", host: "smtp.zoho.com", port: 465, security: "ssl", hint: "Use an app-specific password if two-factor sign-in is on." },
  { value: "hosting", label: "Your website hosting (cPanel)", host: "mail.", port: 465, security: "ssl", hint: "Usually mail.yourdomain.com with the mailbox's full email as the username." },
  { value: "other", label: "Other", host: "", port: 587, security: "starttls", hint: "" },
]
const SECURITY = [
  { value: "ssl", label: "SSL/TLS (usually port 465)" },
  { value: "starttls", label: "STARTTLS (usually port 587)" },
  { value: "none", label: "None (not recommended)" },
]

const blank = { host: "", port: "587", security: "starttls", user: "", password: "", fromName: "", fromEmail: "", replyTo: "" }

export function EmailSettingsView({ saved, canEdit, myEmail }) {
  const router = useRouter()
  const [editing, setEditing] = useState(!saved)
  const [form, setForm] = useState(saved ? { ...saved, port: String(saved.port), password: "" } : blank)
  const [preset, setPreset] = useState(saved ? "" : "google")
  const [errors, setErrors] = useState({})
  const { confirm } = useAlert()
  const [pending, startTransition] = useTransition()
  const hint = PRESETS.find((p) => p.value === preset)?.hint

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }))
  }
  const pickPreset = (value) => {
    setPreset(value)
    const p = PRESETS.find((x) => x.value === value)
    if (p && value !== "other") set({ host: p.host, port: String(p.port), security: p.security })
  }

  const save = (e) => {
    e.preventDefault()
    startTransition(async () => {
      const r = await toastAction(() => saveEmailSettings(form), { loading: "Connecting…", success: "Connected and saved. Send a test email to make sure it arrives." })
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (!r.error) {
        setEditing(false)
        set({ password: "" })
        router.refresh()
      }
    })
  }
  const test = () =>
    startTransition(async () => {
      await toastAction(() => sendTestEmail(), { loading: "Sending a test email…", success: (r) => `Test email sent to ${r.to}. Check the inbox (and spam folder).` })
    })
  const remove = async () => {
    const ok = await confirm({
      title: "Remove email settings?",
      description: "PropFlow stops sending email from this workspace, and the Email button disappears from leads until email is set up again.",
      confirmLabel: "Remove",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => removeEmailSettings(), { loading: "Removing…", success: "Email settings removed. PropFlow won't send email from this workspace until you set it up again." })
      if (r.error) return
      setForm(blank)
      setPreset("google")
      setEditing(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Email" description="Your own email account for sending to leads and customers" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {saved && !editing ? (
          <SectionCard
            title="Outgoing email"
            action={
              <Badge color="green">
                <Icon name="checkbox-circle-line" /> Connected
              </Badge>
            }
          >
            <dl className="divide-y text-sm">
              {[
                ["Sends as", saved.fromName ? `${saved.fromName} <${saved.fromEmail}>` : saved.fromEmail],
                ["Replies go to", saved.replyTo || "The same address"],
                ["Server", `${saved.host}:${saved.port} · ${SECURITY.find((s) => s.value === saved.security)?.label.split(" (")[0]}`],
                ["Username", saved.user || "No sign-in"],
                ["Last checked", saved.verifiedAt ? formatDateTime(saved.verifiedAt) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {canEdit && (
              <div className="flex flex-wrap gap-2 border-t px-4 py-3">
                <Button leftIcon="mail-send-line" loading={pending} onClick={test}>
                  Send a test to {myEmail}
                </Button>
                <Button variant="outline" leftIcon="edit-line" onClick={() => setEditing(true)}>
                  Change
                </Button>
                <Button variant="ghost" className="ml-auto text-destructive" leftIcon="delete-bin-line" disabled={pending} onClick={remove}>
                  Remove
                </Button>
              </div>
            )}
          </SectionCard>
        ) : (
          <SectionCard title={saved ? "Change outgoing email" : "Set up outgoing email"}>
            <form onSubmit={save} noValidate className="space-y-5 p-4">
              {!canEdit && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Only the owner or an administrator can set up email.</p>}
              <fieldset disabled={!canEdit || pending} className="space-y-5">
                <div>
                  <Select label="Email provider" value={preset} onChange={pickPreset} placeholder="Pick your provider" options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} />
                  {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
                  <Input label="SMTP server" required placeholder="smtp.yourdomain.com" value={form.host} onChange={(e) => set({ host: e.target.value })} error={errors.host} />
                  <Input label="Port" required inputMode="numeric" value={form.port} onChange={(e) => set({ port: e.target.value.replace(/\D/g, "") })} error={errors.port} />
                </div>
                <Select label="Security" required value={form.security} onChange={(security) => set({ security })} options={SECURITY} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Username" autoComplete="off" placeholder="Usually the full email address" value={form.user} onChange={(e) => set({ user: e.target.value })} error={errors.user} />
                  <Input
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={saved?.hasPassword ? "Saved (leave empty to keep it)" : "Password or app password"}
                    value={form.password}
                    onChange={(e) => set({ password: e.target.value })}
                    error={errors.password}
                  />
                </div>
                <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
                  <Input label="Send as (name)" placeholder="e.g. Skyline Developers" value={form.fromName} onChange={(e) => set({ fromName: e.target.value })} error={errors.fromName} />
                  <Input label="Send from (email)" required type="email" placeholder="sales@yourdomain.com" value={form.fromEmail} onChange={(e) => set({ fromEmail: e.target.value })} error={errors.fromEmail} />
                  <div className="sm:col-span-2">
                    <Input
                      label="Replies go to (optional)"
                      type="email"
                      placeholder="Leave empty to use the address above"
                      value={form.replyTo}
                      onChange={(e) => set({ replyTo: e.target.value })}
                      error={errors.replyTo}
                    />
                  </div>
                </div>
              </fieldset>
              {canEdit && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button type="submit" leftIcon="plug-line" loading={pending}>
                    Connect and save
                  </Button>
                  {saved && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(false)
                        setForm({ ...saved, port: String(saved.port), password: "" })
                        setErrors({})
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </form>
          </SectionCard>
        )}

        <aside className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Icon name="mail-settings-line" className="text-lg text-primary" /> How it&apos;s used
          </p>
          <ul className="space-y-2 text-muted-foreground">
            {[
              "An Email button appears next to Call and WhatsApp on leads that have an email address.",
              "Emails go out from your own address, so replies come straight back to your inbox.",
              "Each email sent is added to the lead's timeline.",
              "The password is stored encrypted and is never shown again.",
            ].map((t) => (
              <li key={t} className={cn("flex gap-2")}>
                <Icon name="check-line" className="mt-0.5 shrink-0 text-primary" />
                {t}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
