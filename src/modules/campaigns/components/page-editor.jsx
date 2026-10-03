"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip } from "@/components/ui/tooltip"
import { ACCENTS, accentHex } from "../constants"
import { BUTTONS, FONTS, RADII, SECTIONS, copySection, fillPlaceholders, newSection } from "../landing/library"
import { LandingView } from "../landing/landing-view"
import { Field, ImageField, pageImages } from "../landing/field-editor"
import { SectionLibrary, StyleEditor } from "../landing/section-panels"
import { PublicLeadForm } from "./public-form"
import { listPageImages, pricesFromInventory, savePage, setPagePublished, uploadPageImages } from "../server/page-actions"

// Campaigns › Landing pages › one page: the builder. Sections on the left (add from the library,
// reorder, hide, duplicate, delete), the live page in the middle (desktop / tablet / phone; click a
// section to edit it), and the chosen section's content and style on the right. Design (colors,
// font, corners, buttons, logo, contact numbers) and Settings (address, campaign, form, SEO) are
// tabs on the left. Undo / redo, ⌘S to save, Publish when ready.

const DEVICES = [
  { key: "desktop", icon: "computer-line", label: "Desktop", width: "100%" },
  { key: "tablet", icon: "tablet-line", label: "Tablet", width: "820px" },
  { key: "phone", icon: "smartphone-line", label: "Phone", width: "390px" },
]
const snap = (p) => JSON.stringify(p)

function Tabs({ value, onChange, tabs }) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn("flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md text-xs font-medium", value === t.value ? "bg-background shadow-sm" : "text-foreground/60 hover:text-foreground")}
        >
          {t.icon && <Icon name={t.icon} />}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// The chosen section's editor: layout, content, style and actions
function SectionEditor({ section, page, setSection, onDuplicate, onDelete, onClose, images, project }) {
  const def = SECTIONS[section.type]
  const [tab, setTab] = useState("content")
  const set = (patch) => setSection({ ...section, ...patch })
  const fields = def.fields.filter((f) => !f.when || f.when(section))
  const fillPrices = async () => {
    const r = await toastAction(() => pricesFromInventory(project), { loading: "Getting prices…", success: "Prices filled from inventory." })
    if (r?.rows) set({ rows: r.rows })
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base text-primary">
          <Icon name={def.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{def.label}</p>
          <p className="truncate text-xs text-muted-foreground">{def.variants.find((v) => v.key === section.variant)?.label}</p>
        </div>
        <Tooltip content={section.hidden ? "Show on the page" : "Hide from the page"}>
          <button
            type="button"
            onClick={() => set({ hidden: !section.hidden })}
            aria-label={section.hidden ? "Show" : "Hide"}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon name={section.hidden ? "eye-off-line" : "eye-line"} />
          </button>
        </Tooltip>
        <DropdownMenu
          align="end"
          items={[
            { label: "Duplicate", icon: "file-copy-line", disabled: def.single, onClick: onDuplicate },
            { type: "separator" },
            { label: "Delete section", icon: "delete-bin-line", variant: "destructive", onClick: onDelete },
          ]}
          trigger={
            <button type="button" aria-label="Section actions" className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <Icon name="more-2-line" />
            </button>
          }
        />
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <Icon name="close-line" />
          </button>
        )}
      </div>
      <div className="shrink-0 space-y-3 border-b px-3 py-3">
        {def.variants.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Layout</p>
            <div className="grid grid-cols-2 gap-1.5">
              {def.variants.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => set({ variant: v.key })}
                  className={cn("cursor-pointer rounded-md border px-2 py-1.5 text-left text-xs font-medium", section.variant === v.key ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted")}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "content", label: "Content", icon: "edit-line" },
            { value: "style", label: "Style", icon: "palette-line" },
          ]}
        />
      </div>
      <ScrollView variant="subtle" className="min-h-0 flex-1" viewportClassName="space-y-4 p-3">
        {tab === "content" ? (
          <>
            {def.inventory && (
              <button
                type="button"
                onClick={fillPrices}
                disabled={!project}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Icon name="refresh-line" className="text-primary" />
                {project ? "Fill prices from the project's available units" : "Pick the page's project (Settings) to fill prices from inventory"}
              </button>
            )}
            {section.type === "form" && !page.form && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Choose the lead form in Settings; its questions show here.</p>}
            {fields.map((f) => (
              <Field key={f.key} field={f} value={section[f.key]} onChange={(v) => set({ [f.key]: v })} images={images} />
            ))}
            {!fields.length && <p className="text-sm text-muted-foreground">Nothing to fill in. Change its look under Style.</p>}
          </>
        ) : (
          <StyleEditor section={section} accent={accentHex(page.theme.accent)} onChange={(style) => set({ style })} images={images} />
        )}
      </ScrollView>
    </div>
  )
}

export function PageEditor({ data, canEdit }) {
  const router = useRouter()
  const initial = data.page
  // The page and its undo history: { past, present, future }
  const [hist, setHist] = useState(() => ({
    past: [],
    present: { name: initial.name, slug: initial.slug, campaign: initial.campaign, project: initial.project, form: initial.form, theme: initial.theme, seo: initial.seo, sections: initial.sections },
    future: [],
  }))
  const page = hist.present
  const [saved, setSaved] = useState(() => snap(page))
  const [status, setStatus] = useState(initial.status)
  const [selected, setSelected] = useState(null)
  const [left, setLeft] = useState("sections")
  const [device, setDevice] = useState("desktop")
  const [library, setLibrary] = useState(null) // { at: index to insert at }
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const canvas = useRef(null)
  const dirty = snap(page) !== saved

  // Every change can be undone (up to 60 steps)
  const setPage = useCallback((update) => {
    setHist((h) => {
      const next = typeof update === "function" ? update(h.present) : update
      if (snap(next) === snap(h.present)) return h
      return { past: [...h.past.slice(-59), h.present], present: next, future: [] }
    })
  }, [])
  const undo = useCallback(() => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)), [])
  const redo = useCallback(() => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)), [])
  const past = hist.past
  const future = hist.future

  const images = useMemo(() => pageImages({ list: listPageImages, upload: uploadPageImages }, initial.code), [initial.code])
  const vars = useMemo(() => ({ ...data.vars }), [data.vars])
  const section = page.sections.find((s) => s.id === selected) ?? null
  const formOn = page.sections.some((s) => s.type === "form" || (s.type === "hero" && s.variant === "form"))

  const setSections = (fn) => setPage((p) => ({ ...p, sections: fn(p.sections) }))
  const setSection = (next) => setSections((list) => list.map((s) => (s.id === next.id ? next : s)))
  const move = (id, d) =>
    setSections((list) => {
      const i = list.findIndex((s) => s.id === id)
      const j = i + d
      if (j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const remove = (id) => {
    setSections((list) => list.filter((s) => s.id !== id))
    if (selected === id) setSelected(null)
  }
  const duplicate = (id) => {
    const original = page.sections.find((s) => s.id === id)
    if (!original) return
    const copy = copySection(original)
    setSections((list) => {
      const i = list.findIndex((s) => s.id === id)
      return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]
    })
    setSelected(copy.id)
  }
  const add = (type, variant) => {
    if (SECTIONS[type].single && page.sections.some((s) => s.type === type)) return toast.error(`The page already has a ${SECTIONS[type].label.toLowerCase()}.`)
    const s = fillPlaceholders(newSection(type, variant), vars)
    const at = library?.at ?? page.sections.length
    setSections((list) => [...list.slice(0, at), s, ...list.slice(at)])
    setLibrary(null)
    setSelected(s.id)
    setTimeout(() => canvas.current?.querySelector(`[data-section="${s.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80)
  }
  const select = (id, scroll = true) => {
    setSelected(id)
    if (scroll) canvas.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  // Drag to reorder in the list
  const [drag, setDrag] = useState(null)
  const onDrop = (overId) => {
    if (!drag || drag === overId) return setDrag(null)
    setSections((list) => {
      const from = list.findIndex((s) => s.id === drag)
      const to = list.findIndex((s) => s.id === overId)
      const next = [...list]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
    setDrag(null)
  }

  const save = useCallback(
    (then) =>
      startTransition(async () => {
        setErrors({})
        const r = await toastAction(() => savePage(initial.code, page), { loading: "Saving page…", success: then ? undefined : "Page saved." })
        if (r?.fieldErrors) {
          setErrors(r.fieldErrors)
          setLeft("settings")
          toast.error(Object.values(r.fieldErrors)[0])
          return
        }
        if (r?.error) return
        setSaved(snap(page))
        if (then) await then()
        router.refresh()
      }),
    [initial.code, page, router],
  )
  const publish = async (on) => {
    if (!on) {
      const ok = await confirm({
        title: `Unpublish “${page.name}”?`,
        description: "The page goes offline: visitors and ads linking to it see nothing until you publish it again.",
        confirmLabel: "Unpublish",
        icon: "eye-off-line",
      })
      if (!ok) return
    }
    save(async () => {
      const r = await toastAction(() => setPagePublished(initial.code, on), { loading: on ? "Publishing…" : "Taking it offline…", success: on ? "Published. The page is live." : "The page is offline." })
      if (!r?.error) setStatus(on ? "published" : "draft")
    })
  }

  // ⌘S saves, ⌘Z / ⇧⌘Z undo and redo (not while typing in a field, for undo)
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (canEdit && dirty) save()
      }
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
      if (e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canEdit, dirty, save, undo, redo])
  // Leaving with unsaved changes (back link, other links, Back button, closing the tab) asks first
  useUnsavedGuard(dirty)

  const theme = page.theme
  const setTheme = (patch) => setPage((p) => ({ ...p, theme: { ...p.theme, ...patch } }))
  const setSeo = (patch) => setPage((p) => ({ ...p, seo: { ...p.seo, ...patch } }))
  const form =
    data.form && page.form === data.form.code ? (
      <PublicLeadForm workspace={data.workspace.slug} workspaceName={data.workspace.name} form={data.form} accent={theme.accent} cities={data.cities} onTest={async () => ({ ok: true, duplicate: false })} />
    ) : null
  const formChanged = page.form && page.form !== data.form?.code

  const sectionEditor = section && (
    <SectionEditor
      key={section.id}
      section={section}
      page={page}
      setSection={setSection}
      onDuplicate={() => duplicate(section.id)}
      onDelete={() => remove(section.id)}
      onClose={() => setSelected(null)}
      images={images}
      project={page.project}
    />
  )

  const formShown = page.sections.some((s) => !s.hidden && (s.type === "form" || (s.type === "hero" && s.variant === "form")))
  const sectionList = (
    <div className="space-y-2">
      {!formShown && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <Icon name="error-warning-line" className="mt-px shrink-0 text-sm" />
          <span className="min-w-0 flex-1">
            The page needs an enquiry form to publish.{" "}
            {canEdit && (
              <button type="button" onClick={() => add("form", "split")} className="cursor-pointer font-semibold underline underline-offset-2">
                Add the form section
              </button>
            )}
          </span>
        </div>
      )}
      <ul className="space-y-1">
        {page.sections.map((s, i) => {
          const def = SECTIONS[s.type]
          return (
            <li
              key={s.id}
              draggable={canEdit}
              onDragStart={() => setDrag(s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(s.id)}
              onDragEnd={() => setDrag(null)}
              className={cn(
                "group flex items-center gap-1 rounded-lg border pr-1 transition-colors",
                selected === s.id ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted/60",
                drag === s.id && "opacity-40",
              )}
            >
              <span className="flex h-9 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 group-hover:text-muted-foreground" aria-hidden>
                <Icon name="draggable" />
              </span>
              <button type="button" onClick={() => select(s.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 text-left">
                <Icon name={def.icon} className={cn("shrink-0 text-base", s.hidden ? "text-muted-foreground/50" : "text-muted-foreground")} />
                <span className={cn("min-w-0 flex-1 truncate text-[13px]", s.hidden && "text-muted-foreground line-through")}>
                  {def.label}
                  <span className="text-muted-foreground"> · {def.variants.find((v) => v.key === s.variant)?.label}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSection({ ...s, hidden: !s.hidden })}
                aria-label={s.hidden ? "Show" : "Hide"}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
              >
                <Icon name={s.hidden ? "eye-off-line" : "eye-line"} />
              </button>
              <DropdownMenu
                align="end"
                items={[
                  { label: "Move up", icon: "arrow-up-line", disabled: i === 0, onClick: () => move(s.id, -1) },
                  { label: "Move down", icon: "arrow-down-line", disabled: i === page.sections.length - 1, onClick: () => move(s.id, 1) },
                  { label: "Add section below", icon: "add-line", onClick: () => setLibrary({ at: i + 1 }) },
                  { label: "Duplicate", icon: "file-copy-line", disabled: SECTIONS[s.type].single, onClick: () => duplicate(s.id) },
                  { type: "separator" },
                  { label: "Delete", icon: "delete-bin-line", variant: "destructive", onClick: () => remove(s.id) },
                ]}
                trigger={
                  <button type="button" aria-label="Section actions" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Icon name="more-2-line" />
                  </button>
                }
              />
            </li>
          )
        })}
      </ul>
      {canEdit && (
        <Button variant="outline" className="w-full border-dashed" leftIcon="add-line" onClick={() => setLibrary({ at: page.sections.length })}>
          Add section
        </Button>
      )}
    </div>
  )

  const design = (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Brand color</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(ACCENTS).map(([k, hex]) => (
            <button
              key={k}
              type="button"
              title={k}
              aria-label={k}
              onClick={() => setTheme({ accent: k })}
              className={cn("size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-background", theme.accent === k && "ring-2 ring-foreground/70")}
              style={{ background: hex }}
            />
          ))}
          <ColorPicker swatchOnly size="sm" aria-label="Custom color" value={accentHex(theme.accent)} onChange={(hex) => setTheme({ accent: hex })} className="w-auto" />
        </div>
      </div>
      <Select label="Font" size="sm" value={theme.font} onChange={(font) => setTheme({ font })} options={FONTS} />
      <Select label="Corners" size="sm" value={theme.radius} onChange={(radius) => setTheme({ radius })} options={RADII} />
      <Select label="Buttons" size="sm" value={theme.buttons} onChange={(buttons) => setTheme({ buttons })} options={BUTTONS} />
      <ImageField label="Logo" value={theme.logo} onChange={(logo) => setTheme({ logo })} images={images} hint="Shown in the top bar instead of your name" />
      <Input label="Phone number" size="sm" placeholder="0300 1234567" value={theme.phone} onChange={(e) => setTheme({ phone: e.target.value })} />
      <Input label="WhatsApp number" size="sm" placeholder="0300 1234567" value={theme.whatsapp} onChange={(e) => setTheme({ whatsapp: e.target.value })} />
      <p className="text-[11px] text-muted-foreground">Call and WhatsApp buttons, the top bar and the footer use these numbers.</p>
    </div>
  )

  const settings = (
    <div className="space-y-5">
      <Input label="Page name" size="sm" value={page.name} onChange={(e) => setPage((p) => ({ ...p, name: e.target.value }))} error={errors.name} />
      <div className="space-y-1">
        <Input label="Address" size="sm" value={page.slug} onChange={(e) => setPage((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") }))} error={errors.slug} />
        <p className="truncate text-[11px] text-muted-foreground" title={`${data.base}${page.slug}`}>
          {data.base}
          <span className="font-medium text-foreground">{page.slug}</span>
        </p>
      </div>
      <Select
        label="Campaign"
        size="sm"
        value={page.campaign ?? ""}
        onChange={(v) => setPage((p) => ({ ...p, campaign: v || null, project: p.project ?? data.options.campaigns.find((c) => c.value === v)?.project ?? null }))}
        options={[{ value: "", label: "No campaign" }, ...data.options.campaigns]}
      />
      <Select label="Project" size="sm" value={page.project ?? ""} onChange={(v) => setPage((p) => ({ ...p, project: v || null }))} options={[{ value: "", label: "No project" }, ...data.options.projects]} />
      <div className="space-y-1">
        <Select
          label="Lead form"
          required
          size="sm"
          value={page.form ?? ""}
          onChange={(v) => setPage((p) => ({ ...p, form: v || null }))}
          options={data.options.forms.map((f) => ({ ...f, label: f.status === "paused" ? `${f.label} (paused)` : f.label }))}
          placeholder="Choose the lead form"
          error={errors.form}
        />
        {formChanged && <p className="text-[11px] text-amber-700 dark:text-amber-400">Save to see the new form in the preview.</p>}
        <Link href="/campaigns/forms" className="text-[11px] font-medium text-primary hover:underline">
          Manage lead forms
        </Link>
      </div>
      <div className="space-y-3 border-t pt-4">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Search & sharing</p>
        <div className="space-y-1">
          <Input label="Page title" size="sm" placeholder={page.sections.find((s) => s.type === "hero")?.headline ?? page.name} value={page.seo.title} onChange={(e) => setSeo({ title: e.target.value })} />
          <p className="text-right text-[11px] text-muted-foreground tabular-nums">{page.seo.title.length}/60</p>
        </div>
        <div className="space-y-1">
          <Textarea label="Description" rows={3} placeholder="What shows under the title in Google and when the link is shared" value={page.seo.description} onChange={(e) => setSeo({ description: e.target.value })} />
          <p className="text-right text-[11px] text-muted-foreground tabular-nums">{page.seo.description.length}/160</p>
        </div>
        <ImageField label="Share image" value={page.seo.image} onChange={(image) => setSeo({ image })} images={images} hint="Shown on WhatsApp and Facebook; 1200×630 works best" />
      </div>
    </div>
  )

  const width = DEVICES.find((d) => d.key === device).width
  return (
    <div className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-col">
      {/* Toolbar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 sm:px-4">
        <Link href="/campaigns/pages" aria-label="Landing pages" className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <Icon name="arrow-left-line" />
        </Link>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-semibold">
            <span className="truncate">{page.name}</span>
            <Badge color={status === "published" ? "green" : "gray"}>{status === "published" ? "Published" : "Draft"}</Badge>
            {dirty && <span className="text-xs font-normal text-amber-700 dark:text-amber-400">Unsaved changes</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{initial.code}</p>
        </div>
        <div className="mx-auto hidden items-center gap-0.5 rounded-lg bg-muted p-[3px] md:flex">
          {DEVICES.map((d) => (
            <Tooltip key={d.key} content={d.label}>
              <button
                type="button"
                aria-label={d.label}
                aria-pressed={device === d.key}
                onClick={() => setDevice(d.key)}
                className={cn("flex h-7 w-9 cursor-pointer items-center justify-center rounded-md text-base", device === d.key ? "bg-background shadow-sm" : "text-foreground/60 hover:text-foreground")}
              >
                <Icon name={d.icon} />
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <Tooltip content="Undo (⌘Z)">
            <button
              type="button"
              aria-label="Undo"
              disabled={!past.length}
              onClick={undo}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
            >
              <Icon name="arrow-go-back-line" />
            </button>
          </Tooltip>
          <Tooltip content="Redo (⇧⌘Z)">
            <button
              type="button"
              aria-label="Redo"
              disabled={!future.length}
              onClick={redo}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40"
            >
              <Icon name="arrow-go-forward-line" />
            </button>
          </Tooltip>
          {status === "published" && (
            <Tooltip content="Open the live page">
              <a
                href={initial.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open the live page"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon name="external-link-line" />
              </a>
            </Tooltip>
          )}
          {canEdit && (
            <>
              <Button size="sm" variant="outline" disabled={!dirty} loading={pending && dirty} onClick={() => save()}>
                Save
              </Button>
              {status === "published" ? (
                <Button size="sm" variant="ghost" onClick={() => publish(false)} disabled={pending}>
                  Unpublish
                </Button>
              ) : (
                <Button size="sm" leftIcon="upload-cloud-2-line" onClick={() => publish(true)} disabled={pending}>
                  Publish
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_21rem]">
        {/* Left: sections / design / settings (and the section editor on smaller screens) */}
        <aside className="flex min-h-0 flex-col border-b bg-background lg:border-r lg:border-b-0">
          {section && <div className="flex min-h-0 flex-1 flex-col xl:hidden">{sectionEditor}</div>}
          <div className={cn("flex min-h-0 flex-1 flex-col", section && "max-xl:hidden")}>
            <div className="shrink-0 border-b p-3">
              <Tabs
                value={left}
                onChange={setLeft}
                tabs={[
                  { value: "sections", label: "Sections", icon: "layout-masonry-line" },
                  { value: "design", label: "Design", icon: "palette-line" },
                  { value: "settings", label: "Settings", icon: "settings-3-line" },
                ]}
              />
            </div>
            <ScrollView variant="subtle" className="min-h-0 flex-1" viewportClassName="p-3">
              {left === "sections" ? sectionList : left === "design" ? design : settings}
            </ScrollView>
          </div>
        </aside>

        {/* Middle: the page */}
        <ScrollView variant="subtle" className="min-h-[60svh] bg-muted/60 lg:min-h-0" viewportRef={canvas} viewportClassName="p-3 sm:p-5">
          <div
            className={cn("mx-auto overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/10 transition-[width] duration-300", device === "phone" && "rounded-[1.75rem] ring-[6px] ring-slate-800")}
            style={{ width, maxWidth: "100%" }}
          >
            <LandingView page={{ theme, sections: page.sections }} workspace={data.workspace} form={form} editor={canEdit ? { selected, onSelect: (id) => select(id, false) } : null} />
          </div>
        </ScrollView>

        {/* Right: the chosen section */}
        <aside className="hidden min-h-0 flex-col border-l bg-background xl:flex">
          {sectionEditor ?? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <Icon name="cursor-line" className="text-3xl" />
              <p>Click a section on the page, or in the list, to change its text, images and style.</p>
            </div>
          )}
        </aside>
      </div>

      <SectionLibrary open={Boolean(library)} theme={theme} vars={vars} hasForm={formOn} onAdd={add} onClose={() => setLibrary(null)} />
    </div>
  )
}
