"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { Notice } from "@/modules/users/components/user-parts"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { projectHref } from "../links"
import { rateRange } from "../pricing"
import { createPriceList } from "../server/price-lists"
import { ProjectMark } from "./project-parts"

export const PRICE_LIST_STATUS = {
  draft: { label: "Draft", color: "amber" },
  pending: { label: "Awaiting approval", color: "blue" },
  active: { label: "Active", color: "green" },
  archived: { label: "Archived", color: "gray" },
}

export const priceListHref = (code) => `/estate/price-lists/${urlCode(code)}`

function VersionRow({ list }) {
  const s = PRICE_LIST_STATUS[list.status]
  return (
    <Link href={priceListHref(list.code)} className="group flex items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
      <span className="w-8 font-mono text-xs text-muted-foreground">v{list.version}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium transition-colors group-hover:text-primary">{list.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {["draft", "pending"].includes(list.status) ? "Proposed" : "Effective"} from {formatDate(list.effectiveFrom)}
          {list.createdBy ? ` · ${list.createdBy}` : ""}
        </span>
      </span>
      <Badge color={s.color} dot>
        {s.label}
      </Badge>
      <Icon name="arrow-right-s-line" className="text-lg text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function ProjectCard({ project, lists, canEdit, onNew }) {
  const active = lists.find((l) => l.status === "active")
  return (
    <section className="flex flex-col rounded-xl border bg-background shadow-xs">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <ProjectMark project={project} size="sm" />
        <div className="min-w-0 flex-1">
          <Link href={projectHref(project.code)} className="block truncate font-medium hover:text-primary">
            {project.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{project.location}</p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" leftIcon={lists.length ? "file-copy-2-line" : "add-line"} onClick={() => onNew(project.code)}>
            {lists.length ? "New version" : "Create price list"}
          </Button>
        )}
      </header>
      {active ? (
        <dl className="grid grid-cols-2 gap-3 border-b px-4 py-3 text-sm sm:grid-cols-4">
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Base rates</dt>
            <dd className="font-medium tabular-nums">{rateRange(active.rates) || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Payment plans</dt>
            <dd className="font-medium">{active.plans.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Effective from</dt>
            <dd className="font-medium">{formatDate(active.effectiveFrom)}</dd>
          </div>
        </dl>
      ) : (
        <p className="flex items-center gap-1.5 border-b px-4 py-3 text-sm text-muted-foreground">
          <Icon name="error-warning-line" className="text-amber-500" /> No active price list. Units keep the prices they were added at.
        </p>
      )}
      {lists.length ? (
        <div className="divide-y">
          {lists.map((l) => (
            <VersionRow key={l.code} list={l} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No price lists yet.</p>
      )}
    </section>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

// Start a draft: pick the project and what to start from
export function NewPriceListDialog({ groups, projectCode, onClose }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState({})
  const nameFor = (code) => {
    const g = groups.find((x) => x.project.code === code)
    if (!g) return ""
    const v = Math.max(0, ...g.lists.map((l) => l.version)) + 1
    return `${g.project.name} price list ${new Date().getFullYear()}${v > 1 ? ` v${v}` : ""}`
  }
  const sourceFor = (code) => (groups.find((x) => x.project.code === code)?.lists.some((l) => l.status === "active") ? "active" : "inventory")
  const first = projectCode ?? groups[0]?.project.code ?? ""
  const [form, setForm] = useState({ projectCode: first, source: sourceFor(first), name: nameFor(first), effectiveFrom: today() })
  const group = groups.find((g) => g.project.code === form.projectCode)
  const hasActive = group?.lists.some((l) => l.status === "active")
  const others = (group?.lists ?? []).filter((l) => l.status !== "active")

  const sources = [
    ...(hasActive ? [{ value: "active", icon: "file-copy-2-line", label: "Copy the active list", hint: "Same rates, premiums, charges and plans; change what's new" }] : []),
    { value: "inventory", icon: "layout-grid-line", label: "Current inventory prices", hint: "A rate for each unit type and size, at what units are priced at now" },
    { value: "blank", icon: "file-add-line", label: "Start blank", hint: "Add rates yourself; starter plans and charges included" },
    ...(others.length ? [{ value: "other", icon: "history-line", label: "Copy an older version", hint: "A draft or archived list of this project" }] : []),
  ]
  const sourceKind = ["active", "inventory", "blank"].includes(form.source) ? form.source : "other"

  const submit = () =>
    startTransition(async () => {
      setError("")
      setFieldErrors({})
      const r = await createPriceList(form)
      if (r.fieldErrors) setFieldErrors(r.fieldErrors)
      else if (r.error) setError(r.error)
      else router.push(priceListHref(r.code))
    })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-xl"
      title="New price list"
      description="It starts as a draft. Nothing changes for buyers or inventory until it's activated."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="add-line" loading={pending} disabled={!form.projectCode} onClick={submit}>
            Create draft
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Select
        label="Project"
        value={form.projectCode}
        onChange={(code) => setForm((f) => ({ ...f, projectCode: code, source: sourceFor(code), name: nameFor(code) }))}
        options={groups.map((g) => ({ value: g.project.code, label: g.project.name }))}
        error={fieldErrors.projectCode}
      />
      <div className="space-y-1.5">
        <p className="text-base text-muted-foreground">Start from</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {sources.map((s) => {
            const on = sourceKind === s.value
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                onClick={() => setForm((f) => ({ ...f, source: s.value === "other" ? others[0].code : s.value }))}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <Icon name={s.icon} className={cn("mt-0.5 text-lg", on ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
        {fieldErrors.source && <p className="text-[13px] text-destructive">{fieldErrors.source}</p>}
      </div>
      {sourceKind === "other" && (
        <Select
          label="Version to copy"
          value={form.source}
          onChange={(code) => setForm((f) => ({ ...f, source: code }))}
          options={others.map((l) => ({ value: l.code, label: `v${l.version} · ${l.name} (${PRICE_LIST_STATUS[l.status].label})` }))}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={fieldErrors.name} />
        <DatePicker label="Effective from" required clearable={false} value={form.effectiveFrom} onChange={(v) => setForm((f) => ({ ...f, effectiveFrom: v || today() }))} error={fieldErrors.effectiveFrom} />
      </div>
    </Dialog>
  )
}

export function PriceListsView({ groups, canEdit }) {
  const [creating, setCreating] = useState(null) // { projectCode } while the dialog is open
  const all = groups.flatMap((g) => g.lists)
  const active = all.filter((l) => l.status === "active").length
  const drafts = all.filter((l) => ["draft", "pending"].includes(l.status)).length
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Price Lists"
        info={groups.length > 0 && `${active} active · ${drafts} ${drafts === 1 ? "draft" : "drafts"}`}
        actions={
          canEdit &&
          groups.length > 0 && (
            <Button leftIcon="add-line" onClick={() => setCreating({ projectCode: groups[0].project.code })}>
              New price list
            </Button>
          )
        }
      />
      {groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-4 py-16 text-center">
          <Icon name="price-tag-3-line" className="text-4xl text-muted-foreground" />
          <p className="mt-3 font-medium">Create a project first</p>
          <p className="mt-1 text-sm text-muted-foreground">Price lists set the rates, premiums, charges and payment plans of a project.</p>
          <Button className="mt-5" variant="outline" leftIcon="community-line" nativeButton={false} render={<Link href="/estate/projects" />}>
            Go to projects
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((g) => (
              <ProjectCard key={g.project.code} project={g.project} lists={g.lists} canEdit={canEdit} onNew={(projectCode) => setCreating({ projectCode })} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Base rates exclude premiums, development and possession charges, which each price list sets out.</p>
        </>
      )}
      {creating && <NewPriceListDialog groups={groups} projectCode={creating.projectCode} onClose={() => setCreating(null)} />}
    </div>
  )
}
