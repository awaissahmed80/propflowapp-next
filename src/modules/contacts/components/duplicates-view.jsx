"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate, timeAgo } from "@/lib/format"
import { formatPkPhone } from "@/lib/phone"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { REASON_LABELS, matchesSearch } from "../review"
import { mergeContacts, previewMerge } from "../server/actions"
import { Banner, ContactTypeBadges, Empty } from "./contact-parts"

// Contacts › Possible duplicates: contacts that share a CNIC, a mobile or a name (titles aside),
// grouped. Merge folds one into the other after showing what moves. Data: contactDuplicates().
//   groups: [{ key, reasons, contacts }] · can: { edit }

const REASON_COLORS = { cnic: "red", phone: "amber", name: "gray" }

export function DuplicatesView({ groups, page, can }) {
  const [search, setSearch] = useState("")
  const [pair, setPair] = useState(null) // [contact, contact]
  const shown = useMemo(() => (search.trim() ? groups.filter((g) => g.contacts.some((c) => matchesSearch(c, search))) : groups), [groups, search])
  const strong = groups.filter((g) => g.reasons.some((r) => r !== "name")).length

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={page.title}
        description={groups.length ? `${groups.length} groups, ${strong} sharing a CNIC or mobile` : page.description}
        toolbar={
          groups.length > 0 && (
            <div className="min-w-32 flex-1 sm:max-w-80">
              <Input type="search" placeholder="Name, mobile or CNIC…" aria-label="Search duplicates" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
          )
        }
      />
      <Banner>
        A shared CNIC or mobile is almost always one person entered twice. A shared name often isn&apos;t: check the mobile and city before merging. Merging moves their leads, bookings and other records onto the contact
        you keep.
      </Banner>
      {!shown.length ? (
        <Empty icon="git-merge-line" text={groups.length ? "No group matches." : "No possible duplicates. Every contact looks like one person."} />
      ) : (
        <ul className="space-y-3">
          {shown.map((g) => (
            <li key={g.key} className="overflow-hidden rounded-xl border bg-background shadow-xs">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2">
                {g.reasons.map((r) => (
                  <Badge key={r} color={REASON_COLORS[r]}>
                    {REASON_LABELS[r]}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">{g.contacts.length} contacts</span>
                {can.edit && g.contacts.length === 2 && (
                  <Button size="sm" variant="outline" className="ml-auto" leftIcon="git-merge-line" onClick={() => setPair(g.contacts)}>
                    Merge
                  </Button>
                )}
              </div>
              <ul className="divide-y">
                {g.contacts.map((c, i) => (
                  <li key={c.code} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <Avatar name={c.name} size="sm" />
                    <Link href={`/contacts/${urlCode(c.code)}`} className="group min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground tabular-nums">
                        {[c.code, c.phone && formatPkPhone(c.phone), c.cnic, c.city, `added ${timeAgo(c.createdAt)}`].filter(Boolean).join(" · ")}
                      </span>
                    </Link>
                    <span className="hidden md:flex">
                      <ContactTypeBadges types={c.types} max={2} />
                    </span>
                    <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
                      {[c.leads.total > 0 && `${c.leads.total} ${c.leads.total === 1 ? "lead" : "leads"}`, c.bookings > 0 && `${c.bookings} ${c.bookings === 1 ? "booking" : "bookings"}`].filter(Boolean).join(" · ") ||
                        "No records"}
                    </span>
                    {can.edit && g.contacts.length > 2 && i > 0 && (
                      <Button size="sm" variant="ghost" leftIcon="git-merge-line" onClick={() => setPair([g.contacts[0], c])}>
                        Merge
                      </Button>
                    )}
                    {can.edit && g.contacts.length > 2 && i === 0 && <span className="w-[5.5rem]" />}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {pair && <MergeDialog pair={pair} onClose={() => setPair(null)} />}
    </div>
  )
}

// Pick which contact to keep, see what moves, then merge
export function MergeDialog({ pair, onClose, onMerged }) {
  const router = useRouter()
  // Keep the one with more on it (records, then the older one) unless told otherwise
  const [keepCode, setKeepCode] = useState(() => {
    const weight = (c) => c.leads.total + c.bookings * 3 + (c.cnic ? 2 : 0)
    const [a, b] = pair
    return weight(b) > weight(a) ? b.code : a.code
  })
  const keep = pair.find((c) => c.code === keepCode)
  const merge = pair.find((c) => c.code !== keepCode)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState("")
  const [loading, startLoading] = useTransition()
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let live = true
    startLoading(async () => {
      const r = await previewMerge(keep.code, merge.code)
      if (!live) return
      setError(r.error ?? "")
      setPreview(r.preview ?? null)
    })
    return () => {
      live = false
    }
  }, [keep.code, merge.code])

  const run = async () => {
    const ok = await confirm({
      title: `Merge ${merge.name} into ${keep.name}?`,
      description: `${merge.code} is deleted and everything on it moves to ${keep.code}. This can't be undone.`,
      confirmLabel: "Merge",
      destructive: true,
      icon: "git-merge-line",
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => mergeContacts(keep.code, merge.code), { loading: "Merging…", success: `Merged into ${keep.name} (${keep.code}).` })
      if (!r?.ok) return
      onClose()
      if (onMerged) onMerged(r.code)
      else router.refresh()
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      className="sm:max-w-2xl"
      title="Merge contacts"
      description="Pick the contact to keep. The other one's records move onto it, and it takes any details it was missing."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="git-merge-line" loading={pending} disabled={!preview || loading} onClick={run}>
            Merge into {keep.code}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Contact to keep">
          {pair.map((c) => {
            const on = c.code === keepCode
            return (
              <button
                key={c.code}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKeepCode(c.code)}
                className={cn("cursor-pointer rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
              >
                <span className="flex items-center justify-between gap-2 text-xs font-medium">
                  <span className={on ? "text-primary" : "text-muted-foreground"}>{on ? "Keep" : "Merge and delete"}</span>
                  <Icon name={on ? "radio-button-fill" : "checkbox-blank-circle-line"} className={cn("text-base", on ? "text-primary" : "text-muted-foreground")} />
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <Avatar name={c.name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.code}</span>
                  </span>
                </span>
                <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div className="tabular-nums">{c.phone ? formatPkPhone(c.phone) : "No mobile"}</div>
                  <div className="font-mono">{c.cnic ?? "No CNIC"}</div>
                  <div>{[c.city, `added ${formatDate(c.createdAt)}`].filter(Boolean).join(" · ")}</div>
                </dl>
              </button>
            )
          })}
        </div>

        <div className="rounded-xl border p-3 text-sm" aria-live="polite">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : !preview || loading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              <p className="font-medium">Moves to {keep.name}</p>
              {preview.moves.length ? (
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {preview.moves.map((m) => (
                    <li key={m.label} className="flex items-center gap-1">
                      <Icon name="arrow-right-line" className="text-xs" /> {m.count} {m.label.toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">Nothing: {merge.name} has no leads, bookings or other records.</p>
              )}
              {preview.fills.length > 0 && (
                <p className="mt-2 text-muted-foreground">
                  Fills in from {merge.code}: {preview.fills.join(", ")}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
