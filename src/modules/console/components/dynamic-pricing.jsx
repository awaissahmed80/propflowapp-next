"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatAmount } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { cn } from "@/lib/utils"
import { AppIcon } from "@/components/app-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { NumberInput } from "@/components/ui/number-input"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/page-header"
import { quote } from "@/modules/web/dynamic-pricing"
import { saveDynamicPricing } from "../server/pricing-actions"

// Console › Dynamic Pricing. While it's on, the website shows a package builder
// (base fee + apps + users, live price) instead of the plans, and its "Request workspace" lands in
// Enquiries with the package and the quoted price. The plans stay for workspaces you set up by hand.
//   config: getDynamicPricing() · editable: Plans & Pricing rights

export function DynamicPricingCard({ config, editable }) {
  const router = useRouter()
  const [mode, setMode] = useState(config.mode)
  const [p, setP] = useState(config.pricing)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (k, v) => {
    setP((x) => ({ ...x, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const inBase = (code) => p.baseApps.includes(code)
  const toggleBase = (code, on) => set("baseApps", on ? [...p.baseApps, code] : p.baseApps.filter((c) => c !== code))
  const setPrice = (code, v) => set("appPrices", { ...p.appPrices, [code]: v })
  const dirty = mode !== config.mode || JSON.stringify(p) !== JSON.stringify(config.pricing)

  // An example: every app, 15 users
  const example = useMemo(
    () =>
      quote(
        { ...p, appPrices: Object.fromEntries(config.catalog.filter((a) => !inBase(a.code)).map((a) => [a.code, Number(p.appPrices[a.code] ?? 0)])) },
        { apps: config.catalog.map((a) => a.code), users: 15 },
        { catalog: config.catalog, yearlyMonths: config.yearlyMonths },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inBase reads p
    [p, config],
  )

  const save = (nextMode = mode) =>
    startTransition(async () => {
      const r = await toastAction(() => saveDynamicPricing({ mode: nextMode, ...p, appPrices: Object.fromEntries(config.catalog.filter((a) => !inBase(a.code)).map((a) => [a.code, Number(p.appPrices[a.code] ?? 0)])) }), {
        loading: "Saving…",
        success: nextMode !== config.mode ? (nextMode === "dynamic" ? "The website now shows the package builder." : "The website shows the plans again.") : "Dynamic pricing saved.",
      })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      if (r?.error || r?.fieldErrors) setMode(config.mode)
      if (r?.ok) router.refresh()
    })

  return (
    <section aria-labelledby="dynamic-title" className={cn("rounded-2xl border bg-card shadow-xs", mode === "dynamic" && "border-primary/40")}>
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b p-5">
        <AppIcon icon="price-tag-3-line" color={mode === "dynamic" ? "blue" : "slate"} size="sm" className="size-11 rounded-xl text-xl" />
        <div className="min-w-0 flex-1 basis-72">
          <h2 id="dynamic-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            Dynamic pricing
            {config.mode === "dynamic" ? <Badge color="green">On the website</Badge> : <Badge color="gray">Off: the website shows the plans</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">
            The website&apos;s create-workspace wizard suggests apps from the visitor&apos;s answers and prices their package as they change it. Their request lands in Enquiries with the package and quoted price, ready
            to create the workspace. Plans &amp; Pricing stays for workspaces you set up yourself.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          Use on the website
          <Switch aria-label="Use dynamic pricing on the website" checked={mode === "dynamic"} disabled={!editable || pending} onChange={(on) => setMode(on ? "dynamic" : "plans")} />
        </label>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <NumberInput label="Base fee / month (Rs)" value={p.baseMonthly} onChange={(v) => set("baseMonthly", v ?? 0)} min={0} disabled={!editable} error={errors.baseMonthly} />
            <NumberInput label="Users in the base" value={p.baseUsers} onChange={(v) => set("baseUsers", v ?? 0)} min={1} disabled={!editable} error={errors.baseUsers} />
            <NumberInput label="Extra user / month (Rs)" value={p.userPrice} onChange={(v) => set("userPrice", v ?? 0)} min={0} disabled={!editable} error={errors.userPrice} />
            <NumberInput label="Most users on the website" value={p.maxUsers} onChange={(v) => set("maxUsers", v ?? 0)} min={1} disabled={!editable} error={errors.maxUsers} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Apps</p>
            <ul className="divide-y rounded-xl border">
              {config.catalog.map((a) => (
                <li key={a.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <AppIcon icon={a.icon} color={a.color} size="sm" className="size-8 rounded-lg text-base" />
                  <span className="min-w-0 flex-1 basis-40 text-sm">
                    <span className="block font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.category}</span>
                  </span>
                  <Checkbox className="text-xs text-muted-foreground" checked={inBase(a.code)} disabled={!editable} onChange={(on) => toggleBase(a.code, on)} label="In the base" />
                  {inBase(a.code) ? (
                    <span className="w-36 text-right text-sm text-muted-foreground">Included</span>
                  ) : (
                    <NumberInput aria-label={`${a.name}: price per month`} className="w-36" value={p.appPrices[a.code] ?? 0} onChange={(v) => setPrice(a.code, v ?? 0)} min={0} disabled={!editable} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl bg-muted/50 p-4 text-sm">
            <p className="mb-2 font-medium">Example: every app, 15 users</p>
            <ul className="space-y-1">
              {example.lines.map((l) => (
                <li key={l.label} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">{l.label}</span>
                  <span className="tabular-nums">{formatAmount(l.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between border-t pt-2 font-semibold">
              <span>A month</span>
              <span className="tabular-nums">{formatAmount(example.monthly)}</span>
            </p>
            <p className="flex justify-between text-xs text-muted-foreground">
              <span>A year ({config.yearlyMonths} months charged)</span>
              <span className="tabular-nums">{formatAmount(example.monthly * config.yearlyMonths)}</span>
            </p>
          </div>
          {editable && (
            <Button className="w-full" disabled={!dirty} loading={pending} onClick={() => save()}>
              Save pricing
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Prices exclude sales tax. Requests come in as Enquiries; the workspace is created on the hidden Custom plan with the package and price.</p>
        </aside>
      </div>
    </section>
  )
}

// The page: Console › Dynamic Pricing
export function DynamicPricingView({ config, editable }) {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Dynamic Pricing" description="Pay for what you use: a base fee, the apps a workspace needs and its users. Shown on the website instead of the plans while it's on." />
      <DynamicPricingCard config={config} editable={editable} />
    </div>
  )
}
