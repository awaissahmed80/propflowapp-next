"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { timeAgo } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useAlert } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { installDemoWorkspace, removeDemoWorkspace, resetDemoWorkspace, sendDemoDetails } from "../server/demo-workspace-actions"

// Console › Workspaces: the one-click demo workspace ("Skyline Developers"). Not installed →
// Install; installing → progress (polls every 2 s); ready → the shared password, one sign-in per
// role, Copy details / Send demo details, Reset and Remove; failed → the error with Retry / Remove;
// external (made by yarn demo:seed) → Reset to give it a shareable password.
//   demo: { status, step, percent, error, code, password, installedAt, seconds, people, company, signInUrl }
//   manage: may install / reset / remove · canSend: may share the details

const STEPS = {
  workspace: "Creating the workspace and its database",
  people: "Adding the sign-ins",
  data: "Projects, inventory, leads, bookings, payments and accounts",
  hr: "Employees, leave, rosters and payroll",
  documents: "Documents",
  finish: "Finishing",
}
const STATES = { none: ["gray", "Not installed"], installing: ["sky", "Installing"], removing: ["amber", "Removing"], ready: ["green", "Ready"], failed: ["red", "Failed"], external: ["amber", "No shared password"] }

const copy = async (text, done) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.error("Couldn't copy. Select the text and copy it instead.")
  }
}

// The details as plain text, to paste into an email, a chat or a note
export const demoDetailsText = (demo) =>
  [
    `PropFlow demo: ${demo.company}`,
    `Sign in: ${demo.signInUrl}`,
    `Password (every sign-in): ${demo.password}`,
    "",
    ...demo.people.map((p) => `${p.label}: ${p.email}`),
    "",
    "A shared demo that resets from time to time; please don't enter real customer details.",
  ].join("\n")

export function DemoWorkspaceCard({ demo, manage, canSend }) {
  const router = useRouter()
  const { confirm } = useAlert()
  const [pending, start] = useTransition()
  const [showPassword, setShowPassword] = useState(false)
  const [sending, setSending] = useState(false)
  const status = demo.status ?? "none"
  const working = status === "installing" || status === "removing"
  const ready = status === "ready" && demo.password

  // Follow a running job
  useEffect(() => {
    if (!working) return
    const id = setInterval(() => router.refresh(), 2000)
    return () => clearInterval(id)
  }, [working, router])

  const run = (fn, success) =>
    start(async () => {
      const r = await fn()
      if (r?.error) return toast.error(r.error)
      if (success) toast.success(success)
      router.refresh()
    })
  const ask = async (kind) => {
    const ok = await confirm(
      kind === "remove"
        ? { title: "Remove the demo workspace?", description: "Its database, files and sign-ins are deleted for good. You can install it again any time.", confirmLabel: "Remove", destructive: true }
        : {
            title: "Reset the demo workspace?",
            description: "Everything in it is wiped and built again fresh, and the shared password changes. Anyone signed in to it is signed out.",
            confirmLabel: "Reset",
            icon: "restart-line",
          },
    )
    if (ok) run(kind === "remove" ? removeDemoWorkspace : resetDemoWorkspace, kind === "remove" ? "Removing the demo workspace…" : "Rebuilding the demo workspace. This takes a minute or two.")
  }
  const [color, label] = STATES[status] ?? STATES.none

  return (
    <section className="rounded-xl border bg-background shadow-xs">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
            <Icon name="presentation-line" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">Demo workspace</span>
              <Badge color={color} dot>
                {label}
              </Badge>
              {demo.code && (status === "ready" || status === "external") && (
                <Link href={`/workspaces/${urlCode(demo.code)}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                  {demo.code}
                </Link>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {status === "ready"
                ? `${demo.company} · installed ${timeAgo(demo.installedAt)}${demo.seconds ? ` · took ${demo.seconds} s` : ""}`
                : status === "external"
                  ? `${demo.company} was made from the command line. Reset it to get a password you can share.`
                  : `${demo.company}: a sample developer with every app filled in, to show PropFlow. One sign-in per role, one shared password.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {status === "none" && manage && (
            <Button size="sm" leftIcon="download-2-line" loading={pending} onClick={() => run(installDemoWorkspace, "Installing the demo workspace. This takes a minute or two.")}>
              Install
            </Button>
          )}
          {(status === "failed" || status === "external") && manage && (
            <>
              <Button size="sm" leftIcon="refresh-line" loading={pending} onClick={() => run(resetDemoWorkspace, "Rebuilding the demo workspace. This takes a minute or two.")}>
                {status === "failed" ? "Retry" : "Reset"}
              </Button>
              <Button size="sm" variant="outline" leftIcon="delete-bin-line" disabled={pending} onClick={() => ask("remove")}>
                Remove
              </Button>
            </>
          )}
          {ready && (
            <>
              {canSend && (
                <>
                  <Button size="sm" variant="outline" leftIcon="file-copy-line" onClick={() => copy(demoDetailsText(demo), "Demo details copied. Paste them in an email or a chat.")}>
                    Copy details
                  </Button>
                  <Button size="sm" leftIcon="mail-send-line" onClick={() => setSending(true)}>
                    Send demo details
                  </Button>
                </>
              )}
              {manage && (
                <DropdownMenu
                  align="end"
                  items={[
                    { label: "Open the sign-in page", icon: "external-link-line", onClick: () => window.open(demo.signInUrl, "_blank", "noopener") },
                    { type: "separator" },
                    { label: "Reset…", icon: "restart-line", onClick: () => ask("reset") },
                    { label: "Remove…", icon: "delete-bin-line", variant: "destructive", onClick: () => ask("remove") },
                  ]}
                  trigger={<Button size="smicon" variant="ghost" leftIcon="more-2-line" aria-label="More demo workspace actions" loading={pending} />}
                />
              )}
            </>
          )}
        </div>
      </div>

      {working && (
        <div className="border-t px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Icon name="loader-4-line" className="animate-spin" />
              {status === "removing" ? "Removing the demo workspace…" : (STEPS[demo.step] ?? "Working…")}
            </span>
            {status === "installing" && <span className="font-medium tabular-nums">{demo.percent ?? 0}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full bg-primary transition-[width] duration-700", status === "removing" && "w-1/3 animate-pulse")}
              style={status === "installing" ? { width: `${Math.max(3, demo.percent ?? 0)}%` } : undefined}
            />
          </div>
        </div>
      )}

      {status === "failed" && (
        <p className="border-t px-4 py-3 text-xs text-red-600 dark:text-red-400">
          <Icon name="error-warning-line" className="mr-1 align-[-2px]" />
          The last job didn&apos;t finish: {demo.error ?? "unknown error"}
        </p>
      )}

      {ready && (
        <div className="space-y-3 border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Password for every sign-in</span>
            <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm tracking-wide">{showPassword ? demo.password : "••••-••••-••••"}</code>
            <Button size="smicon" variant="ghost" leftIcon={showPassword ? "eye-off-line" : "eye-line"} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} />
            <Button size="smicon" variant="ghost" leftIcon="file-copy-line" aria-label="Copy password" onClick={() => copy(demo.password, "Password copied.")} />
            <span className="text-xs text-muted-foreground">· same for all roles · sign in at {demo.signInUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {demo.people.map((p) => (
              <li key={p.key} className="flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5" title={p.try.length ? `Try: ${p.try.join(" · ")}` : undefined}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {p.label} · {p.name}
                  </p>
                  <p className="truncate font-mono text-xs">{p.email}</p>
                </div>
                <Button size="smicon" variant="ghost" leftIcon="file-copy-line" aria-label={`Copy ${p.email}`} onClick={() => copy(p.email, "Sign-in copied.")} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            <Icon name="information-line" className="mr-1 align-[-2px]" />
            To try it yourself, use a private window: signing in here as a demo user signs you out of the console.
          </p>
        </div>
      )}

      {sending && <DemoDetailsDialog onClose={() => setSending(false)} />}
    </section>
  )
}

// "Send demo details": email the demo's sign-ins and password to someone
export function DemoDetailsDialog({ initial = {}, onClose }) {
  const [form, setForm] = useState({ email: initial.email ?? "", name: initial.name ?? "", note: "" })
  const [error, setError] = useState(null)
  const [pending, start] = useTransition()
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = (e) => {
    e?.preventDefault()
    setError(null)
    start(async () => {
      const r = await sendDemoDetails(form)
      if (r?.error) {
        setError(r)
        return toast.error(r.error)
      }
      toast.success(`Demo details sent to ${form.email}.`)
      onClose()
    })
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title="Send demo details"
      description="Email the demo workspace's sign-ins, the shared password and what to try with each role."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="demo-details" leftIcon="mail-send-line" loading={pending}>
            Send
          </Button>
        </>
      }
    >
      <form id="demo-details" onSubmit={submit} className="space-y-4">
        <Input label="Their name" required value={form.name} onChange={set("name")} maxLength={120} error={error?.field === "name" ? error.error : undefined} autoFocus={!initial.name} />
        <Input label="Email address" required type="email" value={form.email} onChange={set("email")} maxLength={190} error={error?.field === "email" ? error.error : undefined} />
        <Textarea label="Personal note (optional)" rows={3} maxLength={1000} placeholder="Lovely to speak with you today…" value={form.note} onChange={set("note")} />
      </form>
    </Dialog>
  )
}
