"use client"

import { useMemo, useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollView } from "@/components/ui/scroll-view"
import { Skeleton } from "@/components/ui/skeleton"
import { loadTagOptions, setLeadTag } from "../server/leads"

// People tagged on a lead (they see it too): their chips, and for whoever has the lead (or a
// manager) a "Tag" picker with search. Each tick saves straight away.
//   run(fn): the lead panel's runner (saves, then reloads the lead)
export function LeadTags({ lead, run }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState(null) // { people, note } once loaded
  const [error, setError] = useState("")
  const [q, setQ] = useState("")
  const [, startTransition] = useTransition()

  const show = (next) => {
    setOpen(next)
    if (!next) return setQ("")
    startTransition(async () => {
      setError("")
      const r = await loadTagOptions(lead.code)
      if (r.error) setError(r.error)
      else setOptions(r)
    })
  }
  const toggle = (person) => {
    const on = !person.tagged
    setOptions((o) => ({ ...o, people: o.people.map((p) => (p.id === person.id ? { ...p, tagged: on } : p)) }))
    run(() => setLeadTag(lead.code, person.id, on))
  }
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = options?.people ?? []
    return term ? list.filter((p) => p.name.toLowerCase().includes(term) || (p.team ?? "").toLowerCase().includes(term)) : list
  }, [options, q])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {lead.tags.map((p) => (
        <span key={p.id} className="flex h-7 items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1 pl-0.5 text-[13px]">
          <Avatar name={p.name} source={p.avatarUrl} size="sm" />
          <span className="max-w-36 truncate">{p.name}</span>
          {lead.canTag ? (
            <button
              type="button"
              aria-label={`Untag ${p.name}`}
              onClick={() => run(() => setLeadTag(lead.code, p.id, false))}
              className="flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon name="close-line" className="text-xs" />
            </button>
          ) : (
            <span className="w-1" />
          )}
        </span>
      ))}

      {lead.canTag && (
        <Popover open={open} onOpenChange={show}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary data-popup-open:border-primary/50 data-popup-open:text-primary"
              >
                <Icon name="user-add-line" />
                {lead.tags.length ? "Tag" : "Tag teammates"}
              </button>
            }
          />
          <PopoverContent align="start" sideOffset={6} className="w-80 gap-0 overflow-hidden p-0">
            <div className="border-b p-3">
              <p className="text-sm font-semibold">Tag people on this lead</p>
              <p className="mt-0.5 text-xs text-muted-foreground">They&apos;ll see it in their leads and can work it alongside {lead.agent ? lead.agent.name.split(" ")[0] : "the agent"}.</p>
              {(options?.people.length ?? 0) > 6 && (
                <Input autoFocus type="search" aria-label="Find someone" placeholder="Find someone…" className="mt-2.5" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
              )}
            </div>
            {error ? (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">{error}</p>
            ) : !options ? (
              <div className="space-y-2 p-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-3.5 w-40" />
                  </div>
                ))}
              </div>
            ) : options.note && !options.people.length ? (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">{options.note}</p>
            ) : (
              <ScrollView variant="subtle" className="max-h-72" viewportClassName="p-1.5">
                {shown.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={p.tagged}
                    onClick={() => toggle(p)}
                    className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent", p.tagged && "bg-primary/5")}
                  >
                    <Avatar name={p.name} source={p.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      {p.team && <span className="block truncate text-xs text-muted-foreground">{p.team}</span>}
                    </span>
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors", p.tagged ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                      {p.tagged && <Icon name="check-line" className="text-sm" />}
                    </span>
                  </button>
                ))}
                {!shown.length && <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nobody matches “{q}”</p>}
              </ScrollView>
            )}
          </PopoverContent>
        </Popover>
      )}

      {!lead.tags.length && !lead.canTag && <span className="text-muted-foreground">Nobody tagged</span>}
    </div>
  )
}
