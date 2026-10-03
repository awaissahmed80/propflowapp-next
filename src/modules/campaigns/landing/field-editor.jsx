"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { FolderFilesDialog } from "@/components/assets/folder-files-dialog"
import { DateTimePicker } from "@/components/ui/datetimepicker"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconPicker } from "@/components/ui/icon-picker"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

// The builder's inputs for a section's content, driven by the section library's field list
// (see library.js). images: the page's image folder (pageImages), for image fields.

// An image: thumbnail, Choose (the page's image folder: pick one or upload), remove.
//   images: { folder: { name, label }, list() → files, upload(form) → { ok, codes, urls } }
export function ImageField({ label, value, onChange, images, hint }) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    const r = await images.list()
    setLoading(false)
    if (r?.error) return toast.error(r.error)
    setFiles(r.files)
  }
  const choose = async () => {
    await load()
    setOpen(true)
  }
  const current = files?.find((f) => f.url === value)?.code
  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={choose}
          className="relative flex size-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-muted/50 text-muted-foreground transition-colors hover:border-primary/40"
          aria-label={value ? "Change image" : "Choose image"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- page images */}
          {value ? <img src={value} alt="" className="size-full object-cover" /> : <Icon name={loading ? "loader-4-line" : "image-add-line"} className={cn("text-xl", loading && "animate-spin")} />}
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex gap-1.5">
            <button type="button" disabled={loading} onClick={choose} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-60">
              <Icon name="folder-image-line" /> {value ? "Change" : "Choose"}
            </button>
            {value && (
              <button type="button" onClick={() => onChange("")} className="h-8 cursor-pointer rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                Remove
              </button>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{hint ?? "From this page's images, or upload JPG, PNG or WebP"}</p>
        </div>
      </div>
      {open && files && (
        <FolderFilesDialog
          title={label ? `Choose — ${label}` : "Choose an image"}
          description="Pick one of this page's images, or upload new ones. Images here belong to this page only."
          folder={images.folder}
          files={files}
          initial={current ? [current] : []}
          accept="image/jpeg,image/png,image/webp"
          max={1}
          applyLabel="Use image"
          upload={async (form) => {
            const r = await images.upload(form)
            if (!r?.error) await load()
            return r
          }}
          apply={async (codes) => {
            if (!codes.length) return { error: "Pick an image, or close to keep the current one." }
            const latest = (await images.list())?.files ?? files
            const url = latest.find((f) => f.code === codes[0])?.url
            if (url) onChange(url)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// Rows of sub-fields (points, prices, questions…): collapsed rows with the first text as title
function ListField({ field, value = [], onChange, images }) {
  const [open, setOpen] = useState(null)
  const rows = Array.isArray(value) ? value : []
  const blank = () => Object.fromEntries(field.fields.map((f) => [f.key, f.type === "toggle" ? false : ""]))
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const move = (i, d) => {
    const next = [...rows]
    const [r] = next.splice(i, 1)
    next.splice(i + d, 0, r)
    onChange(next)
    setOpen(i + d)
  }
  const title = (r) => {
    const f = field.fields.find((x) => ["text", "textarea"].includes(x.type))
    return (f && r[f.key]) || "Untitled"
  }
  return (
    <div className="space-y-1.5">
      <p className="flex items-center justify-between text-sm font-medium">
        {field.label}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          {rows.length}
          {field.max ? ` / ${field.max}` : ""}
        </span>
      </p>
      <ul className="divide-y overflow-hidden rounded-lg border">
        {rows.map((r, i) => (
          <li key={i}>
            <div className="flex items-center gap-1 pr-1">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-muted/50">
                <Icon name="arrow-right-s-line" className={cn("shrink-0 text-muted-foreground transition-transform", open === i && "rotate-90")} />
                {r.icon && <Icon name={r.icon} className="shrink-0 text-muted-foreground" />}
                {r.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- page images
                  <img src={r.image} alt="" className="size-5 shrink-0 rounded object-cover" />
                )}
                <span className="truncate">{title(r)}</span>
              </button>
              <DropdownMenu
                align="end"
                items={[
                  { label: "Move up", icon: "arrow-up-line", disabled: i === 0, onClick: () => move(i, -1) },
                  { label: "Move down", icon: "arrow-down-line", disabled: i === rows.length - 1, onClick: () => move(i, 1) },
                  { label: "Duplicate", icon: "file-copy-line", disabled: field.max && rows.length >= field.max, onClick: () => onChange([...rows.slice(0, i + 1), { ...r }, ...rows.slice(i + 1)]) },
                  { type: "separator" },
                  { label: "Remove", icon: "delete-bin-line", variant: "destructive", onClick: () => (onChange(rows.filter((_, k) => k !== i)), setOpen(null)) },
                ]}
                trigger={
                  <button type="button" aria-label="Row actions" className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Icon name="more-2-line" />
                  </button>
                }
              />
            </div>
            {open === i && (
              <div className="space-y-3 border-t bg-muted/30 p-3">
                {field.fields.map((f) => (
                  <Field key={f.key} field={f} value={r[f.key]} onChange={(v) => set(i, { [f.key]: v })} images={images} />
                ))}
              </div>
            )}
          </li>
        ))}
        {!rows.length && <li className="px-3 py-3 text-center text-xs text-muted-foreground">Nothing yet</li>}
      </ul>
      {(!field.max || rows.length < field.max) && (
        <button
          type="button"
          onClick={() => {
            onChange([...rows, blank()])
            setOpen(rows.length)
          }}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Icon name="add-line" /> Add {field.fields.length === 1 ? field.fields[0].label.toLowerCase() : "row"}
        </button>
      )}
    </div>
  )
}

// One input for one field
export function Field({ field: f, value, onChange, images }) {
  if (f.type === "list") return <ListField field={f} value={value} onChange={onChange} images={images} />
  if (f.type === "image") return <ImageField label={f.label} value={value ?? ""} onChange={onChange} images={images} hint={f.hint} />
  if (f.type === "icon") return <IconPicker label={f.label} size="sm" value={value ?? ""} onChange={(v) => onChange(v ?? "")} />
  if (f.type === "select") return <Select label={f.label} size="sm" value={value ?? f.options[0].value} onChange={onChange} options={f.options} />
  if (f.type === "toggle") return <Switch label={f.label} checked={Boolean(value)} onChange={onChange} />
  if (f.type === "number") return <NumberInput label={f.label} size="sm" value={value ?? null} onChange={(n) => onChange(n ?? 0)} />
  if (f.type === "datetime") return <DateTimePicker label={f.label} value={value ?? ""} onChange={(v) => onChange(v ?? "")} />
  if (f.type === "textarea" || f.type === "rich")
    return (
      <div className="space-y-1">
        <Textarea label={f.label} rows={f.type === "rich" ? 7 : 3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
        {f.type === "rich" && <p className="text-[11px] text-muted-foreground">**bold**, *italic*, [link](https://…), lines starting with “- ” become a list, a blank line starts a new paragraph.</p>}
      </div>
    )
  return (
    <div className="space-y-1">
      <Input label={f.label} size="sm" type={f.type === "url" ? "url" : "text"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
      {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
    </div>
  )
}

// The page's image folder for the image fields: list and upload through the page's actions
export const pageImages = ({ list, upload }, code) => ({
  folder: { name: code, label: "Page images" },
  list: () => list(code),
  upload: (form) => upload(code, form),
})
