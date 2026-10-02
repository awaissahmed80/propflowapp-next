"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { contactSupport } from "../server/support"
import { SUPPORT_FILES, SUPPORT_TOPICS } from "../support-topics"

// "Contact support" on the sign-in pages: a short form in a modal. Only accepted when the email
// belongs to the workspace (checked on the server); it then reaches the console's Workspace Requests.
//   <ContactSupportLink className="…">Contact support</ContactSupportLink>
export function ContactSupportLink({ className, children = "Contact support" }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("cursor-pointer", className)}>
        {children}
      </button>
      {open && <SupportDialog onClose={() => setOpen(false)} />}
    </>
  )
}

const EMPTY = { name: "", email: "", workspace: "", topic: "signin", message: "", website: "" }

function SupportDialog({ onClose }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [sent, setSent] = useState(null)
  const [shots, setShots] = useState([]) // [{ file, url }]
  const [pending, startTransition] = useTransition()
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) }))
    setError("")
  }

  // Screenshots: picked, or pasted anywhere in the form (Ctrl/Cmd+V)
  const addFiles = (list) => {
    const images = [...list].filter((f) => SUPPORT_FILES.types.includes(f.type))
    if (list.length && !images.length) return setErrors((e) => ({ ...e, screenshots: "Attach PNG, JPG or WebP images." }))
    const next = [...shots, ...images.map((file) => ({ file, url: URL.createObjectURL(file) }))]
    if (next.length > SUPPORT_FILES.max) return setErrors((e) => ({ ...e, screenshots: `Attach up to ${SUPPORT_FILES.max} screenshots.` }))
    if (next.reduce((n, s) => n + s.file.size, 0) > SUPPORT_FILES.maxBytes) return setErrors((e) => ({ ...e, screenshots: "That's over 10 MB together. Attach smaller or fewer images." }))
    setErrors((e) => ({ ...e, screenshots: undefined }))
    setShots(next)
  }
  const removeShot = (i) => {
    URL.revokeObjectURL(shots[i].url)
    setShots(shots.filter((_, j) => j !== i))
    setErrors((e) => ({ ...e, screenshots: undefined }))
  }
  // Free the image previews when the dialog closes
  const close = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url))
    onClose()
  }

  const submit = (e) => {
    e.preventDefault()
    const data = new FormData()
    for (const [k, v] of Object.entries(form)) data.set(k, v)
    for (const s of shots) data.append("screenshots", s.file)
    startTransition(async () => {
      const r = await contactSupport(data)
      if (r.fieldErrors) setErrors(r.fieldErrors)
      else if (r.error) setError(r.error)
      else setSent(r)
    })
  }

  if (sent)
    return (
      <Dialog open onOpenChange={(o) => !o && close()} title="Request sent" footer={<Button onClick={close}>Done</Button>}>
        <div className="py-4 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-600">
            <Icon name="check-line" />
          </span>
          <p className="mt-3 font-medium">One of our representatives will email you at {form.email} or call you on your registered number.</p>
          <p className="mt-1 text-sm text-muted-foreground">{sent.code ? `Your reference is ${sent.code}. We've emailed you a copy.` : "We've emailed you a copy."}</p>
        </div>
      </Dialog>
    )

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      scrollable
      className="sm:max-w-4xl"
      bodyClassName="px-4 py-4 sm:px-8"
      title="Contact support"
      description="Can't get into your workspace, or need a hand? Tell us below."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="support-form" leftIcon="send-plane-line" loading={pending}>
            Send request
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
        <SupportPanel />
        <form id="support-form" onSubmit={submit} onPaste={(e) => e.clipboardData.files.length && (e.preventDefault(), addFiles(e.clipboardData.files))} noValidate className="grid gap-4 p-px sm:grid-cols-2">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 sm:col-span-2 dark:text-amber-300">
              <Icon name="information-line" className="mt-0.5" /> {error}
            </p>
          )}
          {/* Honeypot: invisible to people, so only bots fill it in */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] size-px opacity-0"
            value={form.website}
            onChange={(e) => set({ website: e.target.value })}
          />
          <Input label="Your name" required autoComplete="name" autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
          <Input label="Email you sign in with" required type="email" autoComplete="email" value={form.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
          <div className="sm:col-span-2">
            <Input label="Workspace" required placeholder="e.g. Skyline Developers" value={form.workspace} onChange={(e) => set({ workspace: e.target.value })} error={errors.workspace} />
            {!errors.workspace && <p className="mt-1 text-xs text-muted-foreground">Your company&apos;s name in PropFlow. Your email must belong to this workspace.</p>}
          </div>
          <div className="sm:col-span-2">
            <Select label="What do you need help with?" required value={form.topic} onChange={(topic) => set({ topic })} options={SUPPORT_TOPICS.map((t) => ({ value: t.value, label: t.label }))} />
            {errors.topic && <p className="mt-1 text-[13px] text-destructive">{errors.topic}</p>}
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Message" required rows={4} placeholder="What happened, and what you see on screen" value={form.message} onChange={(e) => set({ message: e.target.value })} error={errors.message} />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-base text-muted-foreground">Screenshots</p>
            <div className="flex flex-wrap gap-2">
              {shots.map((s, i) => (
                <div key={s.url} className="group relative size-20 overflow-hidden rounded-lg border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob URL) */}
                  <img src={s.url} alt={s.file.name} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeShot(i)}
                    aria-label={`Remove ${s.file.name}`}
                    className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-background/90 text-sm shadow-sm hover:bg-background"
                  >
                    <Icon name="close-line" />
                  </button>
                </div>
              ))}
              {shots.length < SUPPORT_FILES.max && (
                <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
                  <Icon name="image-add-line" className="text-xl" />
                  Add
                  <input
                    type="file"
                    accept={SUPPORT_FILES.types.join(",")}
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addFiles(e.target.files)
                      e.target.value = ""
                    }}
                  />
                </label>
              )}
            </div>
            {errors.screenshots ? (
              <p className="mt-1 text-[13px] text-destructive">{errors.screenshots}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Optional. Up to {SUPPORT_FILES.max} images, 10 MB in total. You can also paste a screenshot here.</p>
            )}
          </div>
        </form>
      </div>
    </Dialog>
  )
}

// Left column: who answers and how, plus what helps us find their workspace fast
function SupportPanel() {
  const tips = [
    ["mail-check-line", "Use the email you sign in with"],
    ["building-4-line", "Name your workspace as it appears in PropFlow"],
    ["screenshot-2-line", "Add a screenshot of what you see"],
  ]
  return (
    <aside className="relative overflow-hidden rounded-xl bg-primary/[0.07] p-5 ring-1 ring-primary/15 max-md:flex max-md:items-center max-md:gap-4 max-md:p-4">
      {/* Soft rings behind the icon */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full border-[18px] border-primary/[0.06] max-md:hidden" />
      <span className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-3xl text-primary-foreground shadow-lg shadow-primary/25 max-md:size-12 max-md:text-2xl">
        <Icon name="customer-service-2-line" />
      </span>
      <div className="relative md:mt-5">
        <p className="text-lg font-semibold tracking-tight max-md:text-base">We&apos;re here to help</p>
        <p className="mt-1.5 text-sm text-muted-foreground">One of our representatives will email you or call you on your registered number.</p>
      </div>
      <ul className="relative mt-6 space-y-3 border-t border-primary/15 pt-5 text-sm max-md:hidden">
        {tips.map(([icon, text]) => (
          <li key={text} className="flex items-start gap-2.5">
            <Icon name={icon} className="mt-0.5 shrink-0 text-base text-primary" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
