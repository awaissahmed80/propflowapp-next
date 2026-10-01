"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { AppFeatures } from "./app-features"
import { withoutText } from "@/modules/portal/features"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { deletePlan, savePlan, setPlanActive } from "../server/actions"
import { Notice } from "./parts"

const toCode = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 30)

// Apps on the left, grouped like the app launcher; the always-on ones are shown but locked
function AppPicker({ apps, value, onChange, off = {}, onOffChange, error }) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const a of apps) map.set(a.category ?? "Other", [...(map.get(a.category ?? "Other") ?? []), a])
    return [...map]
  }, [apps])
  const optional = apps.filter((a) => !a.alwaysOn)
  const allOn = optional.every((a) => value.includes(a.code))
  return (
    <div className="flex min-h-0 flex-col md:border-r md:pr-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Apps</p>
          <p className="text-xs text-muted-foreground">
            {value.length} of {optional.length} included
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(allOn ? [] : optional.map((a) => a.code))}>
          {allOn ? "Clear all" : "Select all"}
        </Button>
      </div>
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <ScrollView className="-mr-3 min-h-0 flex-1 pr-3 md:max-h-[26rem]">
        <div className="space-y-4 pb-1">
          {groups.map(([category, list]) => (
            <div key={category}>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{category}</p>
              <ul className="space-y-1">
                {list.map((a) => {
                  const on = a.alwaysOn || value.includes(a.code)
                  return (
                    <li key={a.code}>
                      <label className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", a.alwaysOn ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted/60")}>
                        <AppIcon icon={a.icon} color={a.color} size="sm" className="size-8 shrink-0 rounded-lg text-base" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{a.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.alwaysOn ? (
                              <>
                                <Icon name="lock-line" className="mr-0.5 align-[-2px]" />
                                Included with every plan
                              </>
                            ) : (
                              a.description
                            )}
                          </span>
                        </span>
                        <Switch
                          aria-label={a.name}
                          checked={on}
                          disabled={a.alwaysOn}
                          onChange={(checked) => onChange(checked ? [...value, a.code] : value.filter((c) => c !== a.code))}
                        />
                      </label>
                      {on && !a.alwaysOn && onOffChange && <AppFeatures app={a.code} off={off[a.code] ?? []} onChange={(keys) => onOffChange({ ...off, [a.code]: keys })} className="mt-1 mb-1 ml-13" />}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </ScrollView>
    </div>
  )
}

function PlanDialog({ plan, apps, onClose, onSaved }) {
  const creating = !plan
  const [form, setForm] = useState(() => ({
    name: plan?.name ?? "",
    code: plan?.code ?? "",
    description: plan?.description ?? "",
    priceMonthly: plan?.priceMonthly ?? 0,
    maxProjects: plan?.maxProjects ?? null,
    maxUsers: plan?.maxUsers ?? null,
    maxDealers: plan?.maxDealers ?? null,
    isPublic: plan?.isPublic ?? true,
    apps: (plan?.apps ?? []).filter((c) => apps.some((a) => a.code === c && !a.alwaysOn)),
    off: plan?.off ?? {}, // features left out, per app
  }))
  const [codeTouched, setCodeTouched] = useState(!creating)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const set = (key) => (v) => {
    setForm((f) => ({ ...f, [key]: v, ...(key === "name" && !codeTouched ? { code: toCode(v) } : {}) }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = (e) => {
    e.preventDefault()
    startTransition(async () => {
      const result = await savePlan({
        ...(plan ? { id: plan.id } : { code: form.code }),
        name: form.name,
        description: form.description.trim() || null,
        priceMonthly: form.priceMonthly,
        maxProjects: form.maxProjects,
        maxUsers: form.maxUsers,
        maxDealers: form.maxDealers,
        isPublic: form.isPublic,
        apps: form.apps,
        off: Object.fromEntries(Object.entries(form.off).filter(([app]) => form.apps.includes(app))),
      })
      if (result.fieldErrors) setErrors(result.fieldErrors)
      else if (result.error) setError(result.error)
      else onSaved(creating ? `${form.name} added.` : `${form.name} saved.`)
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-4xl"
      title={creating ? "New plan" : `Edit ${plan.name}`}
      description={creating ? "Choose what the plan includes and what it costs." : "Changes show on the website and at signup straight away. Workspaces already on this plan keep their price until renewal."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="plan-form" loading={pending}>
            {creating ? "Add plan" : "Save plan"}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={save} noValidate className="grid min-h-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AppPicker apps={apps} value={form.apps} onChange={set("apps")} off={form.off} onOffChange={set("off")} error={errors.apps} />

        <div className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Input label="Name" autoFocus={creating} value={form.name} onChange={(e) => set("name")(e.target.value)} error={errors.name} />
            <Input
              label="Code"
              info="Permanent ID used in links and records. Can't be changed later."
              value={form.code}
              disabled={!creating}
              onChange={(e) => {
                setCodeTouched(true)
                set("code")(e.target.value)
              }}
              error={errors.code}
            />
          </div>
          <Textarea label="Description" rows={2} placeholder="Who it's for, shown on the pricing page" value={form.description} onChange={(e) => set("description")(e.target.value)} error={errors.description} />
          <NumberInput label="Price a month" prefix="Rs" min={0} step={500} value={form.priceMonthly} onChange={(v) => set("priceMonthly")(v ?? 0)} error={errors.priceMonthly} />
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberInput label="Projects" placeholder="Unlimited" min={1} value={form.maxProjects} onChange={(v) => set("maxProjects")(v || null)} error={errors.maxProjects} />
            <NumberInput label="Users" placeholder="Unlimited" min={1} value={form.maxUsers} onChange={(v) => set("maxUsers")(v || null)} error={errors.maxUsers} />
            <NumberInput label="Dealers" placeholder="Unlimited" min={0} value={form.maxDealers} onChange={(v) => set("maxDealers")(v ?? null)} error={errors.maxDealers} />
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Leave a limit blank for unlimited.</p>
          <div className="rounded-lg border p-3">
            <Switch label="Show on the website" description="Hidden plans can still be given to a workspace from the console." checked={form.isPublic} onChange={set("isPublic")} />
          </div>
        </div>
      </form>
    </Dialog>
  )
}

function ConfirmDelete({ plan, onClose, onDeleted }) {
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Delete ${plan.name}?`}
      description="The plan disappears from the console, website and signup. Plans that workspaces have used can't be deleted; disable them instead."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deletePlan(plan.id)
                if (result.error) setError(result.error)
                else onDeleted(`${plan.name} deleted.`)
              })
            }
          >
            Delete plan
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
    </Dialog>
  )
}

export function PlansView({ plans, apps, trialDays, editable }) {
  const router = useRouter()
  const [dialog, setDialog] = useState(null) // { edit: plan|null } | { delete: plan }
  const [notice, setNotice] = useState(null)
  const [pending, startTransition] = useTransition()
  // My Desk comes with every plan, so the cards list the rest
  const listed = apps.filter((a) => !a.alwaysOn)

  const done = (text) => {
    setDialog(null)
    setNotice({ tone: "success", text })
    router.refresh()
  }
  const toggleActive = (p) =>
    startTransition(async () => {
      const result = await setPlanActive(p.id, !p.isActive)
      if (result.error) setNotice({ tone: "error", text: result.error })
      else done(p.isActive ? `${p.name} disabled. Workspaces already on it keep it.` : `${p.name} is available again.`)
    })

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Plans & Pricing"
        description={`What customers can buy. Every plan starts with a ${trialDays}-day free trial.`}
        actions={
          editable && (
            <Button leftIcon="add-line" onClick={() => setDialog({ edit: null })}>
              New plan
            </Button>
          )
        }
      />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {plans.map((p) => (
          <article key={p.id} className={cn("flex flex-col rounded-2xl border bg-card p-5 shadow-xs", !p.isActive && "opacity-70")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {!p.isActive && <Badge color="gray">Disabled</Badge>}
                  {p.isActive && !p.isPublic && <Badge color="amber">Hidden from website</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {p.workspaces} workspace{p.workspaces === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              {editable && (
                <DropdownMenu
                  align="end"
                  items={[
                    { label: "Edit plan", icon: "edit-line", onClick: () => setDialog({ edit: p }) },
                    { label: p.isActive ? "Disable" : "Enable", icon: p.isActive ? "forbid-line" : "checkbox-circle-line", onClick: () => toggleActive(p) },
                    { type: "separator" },
                    { label: "Delete", icon: "delete-bin-line", variant: "destructive", onClick: () => setDialog({ delete: p }) },
                  ]}
                  trigger={<Button variant="ghost" size="icon" aria-label={`Options for ${p.name}`} leftIcon="more-2-line" disabled={pending} />}
                />
              )}
            </div>
            {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
            <p className="mt-3 text-2xl font-bold tabular-nums">
              {formatAmount(p.priceMonthly)}
              <span className="text-sm font-normal text-muted-foreground"> / month</span>
            </p>
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              <li className="rounded-full bg-muted px-2.5 py-1">{p.maxProjects ?? "Unlimited"} projects</li>
              <li className="rounded-full bg-muted px-2.5 py-1">{p.maxUsers ?? "Unlimited"} users</li>
              <li className="rounded-full bg-muted px-2.5 py-1">{p.maxDealers == null ? "Unlimited" : p.maxDealers} dealers</li>
            </ul>
            <ul className="mt-4 flex-1 space-y-1.5 border-t pt-4 text-sm">
              {listed.map((a) => {
                const on = p.apps.includes(a.code)
                return (
                  <li key={a.code} className={on ? "flex items-start gap-2" : "flex items-start gap-2 text-muted-foreground/60"}>
                    <Icon name={on ? "check-line" : "close-line"} className={cn("mt-0.5", on && "text-primary")} />
                    <span>
                      {a.name}
                      {on && p.off?.[a.code]?.length > 0 && <span className="block text-xs text-muted-foreground">{withoutText(a.code, p.off[a.code])}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
            {editable && (
              <Button className="mt-5" variant="outline" leftIcon="edit-line" onClick={() => setDialog({ edit: p })}>
                Edit plan
              </Button>
            )}
          </article>
        ))}
      </div>
      {dialog && "edit" in dialog && <PlanDialog plan={dialog.edit} apps={apps} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.delete && <ConfirmDelete plan={dialog.delete} onClose={() => setDialog(null)} onDeleted={done} />}
    </div>
  )
}
