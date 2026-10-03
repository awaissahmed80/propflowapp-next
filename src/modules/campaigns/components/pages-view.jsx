"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { urlCode } from "@/lib/url"
import { timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { percent } from "../constants"
import { LandingView } from "../landing/landing-view"
import { TEMPLATES, fillPlaceholders, templateSections } from "../landing/library"
import { createPage, deletePage, duplicatePage, setPagePublished } from "../server/page-actions"

// Campaigns › Landing pages: every page as a card with a live preview of its top, where it's
// published, and views / entries / conversion. New pages start from a template.

// The top of a page, drawn small
function Thumb({ theme, sections, workspace, className }) {
  return (
    <div className={cn("pointer-events-none relative overflow-hidden bg-white", className)} aria-hidden>
      <div className="absolute top-0 left-0 w-[1200px] origin-top-left scale-[0.27]">
        <LandingView
          still
          page={{ theme, sections }}
          workspace={workspace}
          form={
            <div className="space-y-3 p-6">
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-14 rounded bg-(--accent)" />
            </div>
          }
        />
      </div>
    </div>
  )
}

function NewPageDialog({ options, workspace, onClose }) {
  const router = useRouter()
  const [form, setForm] = useState({ name: "", template: "launch", campaign: "", project: "", form: "new" })
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const previews = useMemo(
    () =>
      Object.fromEntries(
        TEMPLATES.map((t) => [
          t.key,
          fillPlaceholders(templateSections(t.key).slice(0, 2), {
            project: options.projects.find((p) => p.value === form.project)?.label ?? "Your project",
            location: "Lahore",
            authority: "LDA",
            noc: "",
            workspace: workspace.name,
          }),
        ]),
      ),
    [form.project, options.projects, workspace.name],
  )
  const create = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => createPage(form), { loading: "Creating the page…", success: "Page created. Make it yours, then publish." })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) router.push(`/campaigns/pages/${urlCode(r.code)}`)
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-3xl"
      title="New landing page"
      description="Start from a ready-made page and change anything after. Project details and prices fill in from the project you pick."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="add-line" loading={pending} onClick={create}>
            Create page
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => set({ template: t.key })}
              aria-pressed={form.template === t.key}
              className={cn("cursor-pointer overflow-hidden rounded-xl border text-left transition", form.template === t.key ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40")}
            >
              {t.sections.length ? (
                <Thumb theme={{ accent: "blue" }} sections={previews[t.key]} workspace={workspace} className="h-24 border-b" />
              ) : (
                <div className="flex h-24 items-center justify-center border-b border-dashed bg-muted/40 text-2xl text-muted-foreground">
                  <Icon name="add-line" />
                </div>
              )}
              <div className="p-2.5">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon name={t.icon} className="text-muted-foreground" /> {t.label}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.text}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Campaign"
            value={form.campaign}
            onChange={(v) => {
              const c = options.campaigns.find((x) => x.value === v)
              set({ campaign: v, project: form.project || c?.project || "", name: form.name || (c ? c.label : "") })
            }}
            options={[{ value: "", label: "No campaign" }, ...options.campaigns]}
          />
          <Input label="Page name" required placeholder="e.g. Skyline launch" value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
          <Select label="Project" value={form.project} onChange={(v) => set({ project: v })} options={[{ value: "", label: "No project" }, ...options.projects]} />
          <Select label="Lead form" required value={form.form} onChange={(v) => set({ form: v })} options={[{ value: "new", label: "Create a new form for this page" }, ...options.forms]} error={errors.form} />
        </div>
      </div>
    </Dialog>
  )
}

export function PagesView({ pages, options, workspace, canCreate, canEdit, canDelete, startNew = false }) {
  const router = useRouter()
  const [creating, setCreating] = useState(startNew)
  const [q, setQ] = useState("")
  const [, startTransition] = useTransition()
  const term = q.trim().toLowerCase()
  const shown = pages.filter((p) => !term || [p.name, p.slug, p.campaign?.name, p.project?.name].some((v) => v?.toLowerCase().includes(term)))
  const run = (fn, loading, success, then) =>
    startTransition(async () => {
      const r = await toastAction(fn, { loading, success })
      if (!r?.error) then ? then(r) : router.refresh()
    })
  const unpublish = async (p) => {
    const ok = await confirm({
      title: `Unpublish “${p.name}”?`,
      description: "The page goes offline: visitors and ads linking to it see nothing until you publish it again.",
      confirmLabel: "Unpublish",
      icon: "eye-off-line",
    })
    if (ok) run(() => setPagePublished(p.code, false), "Taking it offline…", "The page is offline.")
  }
  const remove = async (p) => {
    const ok = await confirm({
      title: `Delete “${p.name}”?`,
      description: `${p.status === "published" ? "Visitors won't be able to open it. " : ""}This can't be undone.`,
      confirmLabel: "Delete page",
      destructive: true,
    })
    if (ok) run(() => deletePage(p.code), "Deleting…", "Page deleted.")
  }
  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied.")
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.")
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Landing pages"
        description="Project pages built from ready-made sections, published on your campaigns address"
        toolbar={
          <div className="w-full max-w-72">
            <Input type="search" aria-label="Search pages" placeholder="Page, address or campaign…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
        }
        actions={
          canCreate && (
            <Button leftIcon="add-line" onClick={() => setCreating(true)}>
              New page
            </Button>
          )
        }
      />

      {pages.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-background px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-2xl text-primary">
            <Icon name="pages-line" />
          </span>
          <p className="mt-3 font-medium">No landing pages yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Build a page for a launch or booking drive in minutes from ready-made sections; enquiries go straight to CRM.</p>
          {canCreate && (
            <Button className="mt-5" leftIcon="add-line" onClick={() => setCreating(true)}>
              New page
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <article key={p.code} className="group flex flex-col overflow-hidden rounded-xl border bg-background shadow-xs transition hover:shadow-md">
              <Link href={`/campaigns/pages/${urlCode(p.code)}`} className="block">
                <Thumb theme={p.theme} sections={p.preview} workspace={workspace} className="h-44 border-b" />
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                  <Link href={`/campaigns/pages/${urlCode(p.code)}`} className="min-w-0 flex-1 truncate font-semibold hover:text-primary">
                    {p.name}
                  </Link>
                  <Badge color={p.status === "published" ? "green" : "gray"}>{p.status === "published" ? "Published" : "Draft"}</Badge>
                  <DropdownMenu
                    align="end"
                    items={[
                      { label: "Edit", icon: "edit-line", onClick: () => router.push(`/campaigns/pages/${urlCode(p.code)}`) },
                      ...(p.status === "published"
                        ? [
                            { label: "Open live page", icon: "external-link-line", onClick: () => window.open(p.url, "_blank", "noopener") },
                            { label: "Copy link", icon: "link", onClick: () => copy(p.url) },
                          ]
                        : []),
                      ...(canCreate ? [{ label: "Duplicate", icon: "file-copy-line", onClick: () => run(() => duplicatePage(p.code), "Copying…", "Copy made.") }] : []),
                      ...(canEdit
                        ? [
                            p.status === "published"
                              ? { label: "Unpublish", icon: "eye-off-line", onClick: () => unpublish(p) }
                              : { label: "Publish", icon: "upload-cloud-2-line", onClick: () => run(() => setPagePublished(p.code, true), "Publishing…", "Published.") },
                          ]
                        : []),
                      ...(canDelete ? [{ type: "separator" }, { label: "Delete", icon: "delete-bin-line", variant: "destructive", onClick: () => remove(p) }] : []),
                    ]}
                    trigger={
                      <button
                        type="button"
                        aria-label="Page actions"
                        className="-mt-0.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Icon name="more-2-line" />
                      </button>
                    }
                  />
                </div>
                <p className="truncate text-xs text-muted-foreground" title={p.url}>
                  {p.url.replace(/^https?:\/\//, "")}
                </p>
                <p className="truncate text-xs text-muted-foreground">{[p.campaign?.name, p.form ? `Form: ${p.form.name}` : "No form yet", `${p.sectionCount} sections`].filter(Boolean).join(" · ")}</p>
                <dl className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-center">
                  {[
                    ["Views", p.views],
                    ["Entries", p.entries],
                    ["Conversion", percent(p.conversion)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[11px] text-muted-foreground">{k}</dt>
                      <dd className="text-sm font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[11px] text-muted-foreground">Edited {timeAgo(p.updatedAt)}</p>
              </div>
            </article>
          ))}
          {!shown.length && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No pages match.</p>}
        </div>
      )}

      {creating && <NewPageDialog options={options} workspace={workspace} onClose={() => setCreating(false)} />}
    </div>
  )
}
