"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Dialog } from "@/components/ui/dialog"
import { LEGAL, LEGAL_UPDATED } from "../legal"

// A legal document (privacy policy, terms): used by its own page and inside the modal
export function LegalDocument({ doc, className }) {
  return (
    <article className={cn("space-y-6 text-[15px] leading-relaxed", className)}>
      <p className="text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <p>{doc.intro}</p>
      {doc.sections.map((s, i) => (
        <section key={s.heading}>
          <h2 className="text-base font-semibold">
            {i + 1}. {s.heading}
          </h2>
          <ul className="mt-3 list-disc space-y-2.5 pl-5 text-muted-foreground marker:text-primary">
            {s.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  )
}

// A link to /privacy-policy or /terms-and-conditions that opens the document in a modal on this
// page (the address shows its URL, Back or closing returns). Opening the URL directly shows the
// full page instead.
//   <LegalLink doc="terms">Terms & Conditions</LegalLink>
export function LegalLink({ doc: key, className, children }) {
  const doc = LEGAL[key]
  const [open, setOpen] = useState(false)
  const href = `/${doc.slug}`

  // The browser's Back button closes it
  useEffect(() => {
    if (!open) return undefined
    const onPop = () => setOpen(false)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [open])

  const close = () => {
    setOpen(false)
    if (window.location.pathname === href) window.history.back()
  }
  return (
    <>
      <a
        href={href}
        className={cn("font-medium text-primary hover:underline", className)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return // new tab: the full page
          e.preventDefault()
          window.history.pushState({ legal: key }, "", href)
          setOpen(true)
        }}
      >
        {children ?? doc.title}
      </a>
      {open && (
        <Dialog open onOpenChange={(o) => !o && close()} scrollable className="max-h-[min(70svh,640px)] sm:max-w-4xl" bodyClassName="px-4 py-4 sm:px-8" title={doc.title} description="PropFlow">
          <LegalDocument doc={doc} className="space-y-8 pb-4" />
        </Dialog>
      )}
    </>
  )
}
