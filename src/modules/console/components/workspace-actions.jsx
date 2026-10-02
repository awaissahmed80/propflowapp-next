"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { AppFeatures } from "./app-features"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { CATEGORY_ORDER } from "@/modules/portal/access"
import { changeWorkspacePlan, extendWorkspace, reactivateWorkspace, retryWorkspaceSetup, setWorkspaceApps, suspendWorkspace, updateWorkspaceDetails } from "../server/workspace-actions"
import { Notice } from "./parts"

// Runs an action; on success closes the dialog, shows a note and reloads the page's data
function useRun(onDone) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const run = (fn, message) =>
    startTransition(async () => {
      setError("")
      setFieldErrors({})
      const result = await fn()
      if (result?.fieldErrors) setFieldErrors(result.fieldErrors)
      else if (result?.error) setError(result.error)
      else {
        onDone(message)
        router.refresh()
      }
    })
  return { run, pending, error, fieldErrors }
}

function Footer({ onClose, pending, label, variant, form, onClick }) {
  return (
    <>
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button type={form ? "submit" : "button"} form={form} variant={variant} loading={pending} onClick={onClick}>
        {label}
      </Button>
    </>
  )
}

// ---------- apps ----------

function AppsDialog({ t, apps, planApps, onClose, onDone }) {
  const [on, setOn] = useState(() => t.apps.map((a) => a.code))
  // Features left out, per app (custom package)
  const [off, setOff] = useState(() => Object.fromEntries(t.apps.filter((a) => a.off?.length).map((a) => [a.code, a.off])))
  const { run, pending, error } = useRun(onDone)
  const groups = useMemo(() => {
    const cats = [...CATEGORY_ORDER, ...new Set(apps.map((a) => a.category).filter((c) => !CATEGORY_ORDER.includes(c)))]
    return cats.map((c) => [c, apps.filter((a) => a.category === c)]).filter(([, list]) => list.length)
  }, [apps])
  const extras = on.filter((c) => !planApps.includes(c) && !apps.find((a) => a.code === c)?.alwaysOn).length

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-xl"
      title={`Apps for ${t.name}`}
      description={`Switch apps, and the features inside them, on or off for this workspace. Apps marked "Extra" aren't in the ${t.planName} plan.`}
      footer={<Footer onClose={onClose} pending={pending} label="Save apps" onClick={() => run(() => setWorkspaceApps(t.id, on, off), "Apps updated. People see the change next time they open the launcher.")} />}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-4">
        {groups.map(([category, list]) => (
          <div key={category}>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{category}</p>
            <ul className="space-y-1">
              {list.map((a) => {
                const inPlan = planApps.includes(a.code)
                return (
                  <li key={a.code}>
                    <label className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", a.alwaysOn ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted/60")}>
                      <AppIcon icon={a.icon} color={a.color} size="sm" className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {a.name}
                          {!inPlan && !a.alwaysOn && on.includes(a.code) && <Badge color="violet">Extra</Badge>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.alwaysOn ? (
                            <>
                              <Icon name="lock-line" className="mr-0.5 align-[-2px]" />
                              Included with every workspace
                            </>
                          ) : inPlan ? (
                            `In the ${t.planName} plan`
                          ) : (
                            "Not in the plan"
                          )}
                        </span>
                      </span>
                      <Switch aria-label={a.name} checked={a.alwaysOn || on.includes(a.code)} disabled={a.alwaysOn} onChange={(v) => setOn((list) => (v ? [...list, a.code] : list.filter((c) => c !== a.code)))} />
                    </label>
                    {!a.alwaysOn && on.includes(a.code) && <AppFeatures app={a.code} off={off[a.code] ?? []} onChange={(keys) => setOff((o) => ({ ...o, [a.code]: keys }))} className="mt-1 mb-1 ml-12" />}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      {extras > 0 && (
        <p className="text-xs text-muted-foreground">
          {extras} extra app{extras === 1 ? "" : "s"} beyond the plan. Charge for them separately if agreed.
        </p>
      )}
    </Dialog>
  )
}

// ---------- details ----------

function DetailsDialog({ t, onClose, onDone }) {
  const [form, setForm] = useState({ name: t.name, slug: t.slug, city: t.city ?? "", phone: t.phone ?? "", email: t.email ?? "", ntn: t.ntn ?? "" })
  const { run, pending, error, fieldErrors } = useRun(onDone)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === "slug" ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") : e.target.value }))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} className="sm:max-w-xl" title="Edit workspace details" footer={<Footer onClose={onClose} pending={pending} label="Save details" form="ws-details" />}>
      <form
        id="ws-details"
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => updateWorkspaceDetails(t.id, form), "Workspace details saved.")
        }}
      >
        {error && <Notice tone="error">{error}</Notice>}
        <Input label="Company name" value={form.name} onChange={set("name")} error={fieldErrors.name} />
        <Input
          label="Short name"
          info="Used in the workspace's links. Changing it breaks links people saved."
          value={form.slug}
          onChange={set("slug")}
          error={fieldErrors.slug}
          startElement={<Icon name="links-line" />}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="City" value={form.city} onChange={set("city")} error={fieldErrors.city} />
          <Input label="Phone" type="tel" value={form.phone} onChange={set("phone")} error={fieldErrors.phone} />
          <Input label="Contact email" type="email" value={form.email} onChange={set("email")} error={fieldErrors.email} />
          <Input label="NTN" value={form.ntn} onChange={set("ntn")} error={fieldErrors.ntn} />
        </div>
      </form>
    </Dialog>
  )
}

// ---------- dates ----------

// "yyyy-MM-dd" for today in Pakistan (UTC+5, no daylight saving)
const pakistanToday = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)

function DateDialog({ t, trial, onClose, onDone }) {
  const [date, setDate] = useState("")
  const { run, pending, error } = useRun(onDone)
  const today = pakistanToday()
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={trial ? "Set the trial end date" : "Set the renewal date"}
      description={trial ? "The trial ends at the end of the chosen day (Pakistan time)." : "The subscription runs until the end of the chosen day (Pakistan time)."}
      footer={<Footer onClose={onClose} pending={pending} label="Save date" onClick={() => date && run(() => extendWorkspace(t.id, { date }), `${trial ? "Trial" : "Renewal"} date changed.`)} />}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <DatePicker label={trial ? "Trial ends on" : "Renews on"} value={date} onChange={setDate} minDate={today} placeholder="Pick a date" />
    </Dialog>
  )
}

// ---------- plan ----------

function PlanDialog({ t, plans, yearlyMonths, onClose, onDone }) {
  const [planId, setPlanId] = useState(t.planId)
  const [cycle, setCycle] = useState(t.billingCycle)
  const [resetApps, setResetApps] = useState(false)
  const { run, pending, error } = useRun(onDone)
  const plan = plans.find((p) => p.id === planId)
  const price = plan ? (cycle === "yearly" ? plan.priceMonthly * yearlyMonths : plan.priceMonthly) : 0
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Change plan"
      description="New apps from the plan are switched on straight away. Paying workspaces move to the new price from now."
      footer={<Footer onClose={onClose} pending={pending} label="Change plan" onClick={() => run(() => changeWorkspacePlan(t.id, { planId, billingCycle: cycle, resetApps }), "Plan changed.")} />}
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <Select label="Plan" value={planId} onChange={setPlanId} options={plans.map((p) => ({ value: p.id, label: `${p.name} · ${formatAmount(p.priceMonthly)}/mo` }))} />
        <ToggleGroup
          value={cycle}
          onChange={setCycle}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          {formatAmount(price)} per {cycle === "yearly" ? `year (${yearlyMonths} months charged)` : "month"}
        </p>
        <div className="rounded-lg border p-3">
          <Switch label="Reset apps to this plan" description="Switch off any app that isn't in the new plan. Leave off to keep extra apps." checked={resetApps} onChange={setResetApps} />
        </div>
      </div>
    </Dialog>
  )
}

// ---------- suspend ----------

function SuspendDialog({ t, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const { run, pending, error, fieldErrors } = useRun(onDone)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Suspend ${t.name}?`}
      description="Everyone in this workspace is signed out and can't open it until it's reactivated. Their data is kept."
      footer={<Footer onClose={onClose} pending={pending} label="Suspend workspace" variant="destructive" onClick={() => run(() => suspendWorkspace(t.id, reason), "Workspace suspended. Its users were signed out.")} />}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Textarea label="Reason" rows={3} placeholder="e.g. Payment overdue since 15 Sep" value={reason} onChange={(e) => setReason(e.target.value)} error={fieldErrors.reason} />
    </Dialog>
  )
}

// ---------- header bar ----------

// Buttons on the workspace page. can: { workspaces, billing } for the viewer's role.
export function WorkspaceActions({ t, apps, planApps, plans, yearlyMonths, can }) {
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState(null)
  const { run, pending } = useRun((message) => setNotice({ tone: "success", text: message }))
  const done = (message) => {
    setDialog(null)
    setNotice({ tone: "success", text: message })
  }
  const suspended = t.status === "suspended"
  const trial = t.status === "trial" || (suspended && t.trialEndsAt && !t.currentPeriodEndsAt)
  const settingUp = t.status === "provisioning"

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {can.workspaces && settingUp && (
          <Button leftIcon="restart-line" loading={pending} onClick={() => run(() => retryWorkspaceSetup(t.id), "Setup finished. The workspace is ready.")}>
            Retry setup
          </Button>
        )}
        {can.workspaces && (
          <Button variant="outline" leftIcon="apps-2-line" onClick={() => setDialog("apps")}>
            Edit apps
          </Button>
        )}
        {can.billing && !settingUp && (
          <DropdownMenu
            align="end"
            items={[
              { type: "label", label: trial ? "Extend the trial" : "Extend the subscription" },
              ...[7, 15, 30].map((d) => ({ label: `Add ${d} days`, icon: "add-line", onClick: () => run(() => extendWorkspace(t.id, { days: d }), `${trial ? "Trial" : "Subscription"} extended by ${d} days.`) })),
              { type: "separator" },
              { label: "Pick a date…", icon: "calendar-line", onClick: () => setDialog("date") },
            ]}
            trigger={
              <Button variant="outline" leftIcon="hourglass-line" loading={pending}>
                {trial ? "Extend trial" : "Extend"}
              </Button>
            }
          />
        )}
        {(can.workspaces || can.billing) && (
          <DropdownMenu
            align="end"
            items={[
              ...(can.billing ? [{ label: "Change plan", icon: "exchange-line", onClick: () => setDialog("plan") }] : []),
              ...(can.workspaces
                ? [
                    { label: "Edit details", icon: "edit-line", onClick: () => setDialog("details") },
                    { type: "separator" },
                    suspended
                      ? { label: "Reactivate workspace", icon: "play-circle-line", onClick: () => run(() => reactivateWorkspace(t.id), "Workspace reactivated. Its users can sign in again.") }
                      : { label: "Suspend workspace", icon: "pause-circle-line", variant: "destructive", onClick: () => setDialog("suspend") },
                  ]
                : []),
            ]}
            trigger={<Button variant="outline" size="icon" aria-label="More actions" leftIcon="more-2-line" />}
          />
        )}
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {dialog === "apps" && <AppsDialog t={t} apps={apps} planApps={planApps} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "details" && <DetailsDialog t={t} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "date" && <DateDialog t={t} trial={trial} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "plan" && <PlanDialog t={t} plans={plans} yearlyMonths={yearlyMonths} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "suspend" && <SuspendDialog t={t} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}
