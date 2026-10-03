"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { useAlert } from "@/components/alert-context"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"
import { LOOKUP_APPS } from "../catalog"
import { ListCard } from "./list-card"

// Lists & labels: plain pick-lists, the lists down the side and the chosen one as a compact card.
// Pages pass plain lists only; lists with their own fields (unit types, activity points, booking
// documents…) are App Settings sections (src/modules/settings/sections.js).
//   lists: getLookupLists(db, apps) from the page
//   initialKey: open on this list (e.g. ?list=project-document-type); lists are A–Z within each app
export function LookupEditor({ lists: all, initialKey, canEdit = true }) {
  const lists = useMemo(() => [...all].sort((a, b) => a.name.localeCompare(b.name)), [all])
  const start = lists.find((l) => l.key === initialKey) ?? lists[0]
  const [selectedKey, setSelectedKey] = useState(start?.key)
  const [search, setSearch] = useState("")
  const { confirm } = useAlert()
  const [dirty, setDirty] = useState(false)

  const selected = lists.find((l) => l.key === selectedKey) ?? lists[0]
  const q = search.trim().toLowerCase()
  const matches = (l) => !q || [l.name, l.description, ...l.values.map((v) => v.label)].some((t) => t?.toLowerCase().includes(q))
  const apps = [...new Set(lists.map((l) => l.app))]
  const groups = apps.map((app) => ({ app, lists: lists.filter((l) => l.app === app && matches(l)) })).filter((g) => g.lists.length)
  // Collapsed sections: all but the one holding the first list start folded
  const [collapsed, setCollapsed] = useState(() => new Set(apps.filter((a) => a !== start?.app)))
  const toggleGroup = (app) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(app)) next.delete(app)
      else next.add(app)
      return next
    })

  const choose = async (key) => {
    if (dirty && key !== selected.key) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        description: `Your changes to ${selected.name.toLowerCase()} haven't been saved.`,
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      })
      if (!ok) return
      setDirty(false)
    }
    setSelectedKey(key)
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-1">
      <nav aria-label="Lists" className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="border-b p-2">
          <label className="flex h-control-sm items-center gap-1.5 rounded-md bg-muted/60 px-2 text-sm focus-within:ring-[1px] focus-within:ring-ring/50">
            <Icon name="search-line" className="text-muted-foreground" />
            <input
              type="search"
              placeholder="Find a list or value…"
              aria-label="Find a list"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <ScrollView variant="subtle" className="max-h-56 min-h-0 flex-1 md:max-h-none" viewportClassName="p-1.5">
          {groups.map((g) => {
            // Sections fold away; searching opens every section with a match
            const open = apps.length === 1 || q || !collapsed.has(g.app)
            return (
              <div key={g.app} className="mb-1">
                {apps.length > 1 && (
                  <button
                    type="button"
                    aria-expanded={Boolean(open)}
                    onClick={() => toggleGroup(g.app)}
                    className="flex w-full cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name="arrow-right-s-line" className={cn("text-sm transition-transform", open && "rotate-90")} />
                    <span className="flex-1">{LOOKUP_APPS[g.app] ?? g.app}</span>
                    <span className="font-normal tabular-nums">{g.lists.length}</span>
                  </button>
                )}
                {open &&
                  g.lists.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => choose(l.key)}
                      aria-current={l.key === selected?.key}
                      className={cn(
                        "flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        apps.length > 1 && "pl-6",
                        l.key === selected?.key && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      {l.customized && <span className="size-1.5 rounded-full bg-amber-500" aria-label="Customized" />}
                      {l.kind === "system" && <Icon name="lock-line" className="text-xs text-muted-foreground" />}
                      <span className="text-xs text-muted-foreground tabular-nums">{l.values.filter((v) => v.active).length}</span>
                    </button>
                  ))}
              </div>
            )
          })}
          {!groups.length && <p className="px-2 py-6 text-center text-sm text-muted-foreground">No lists match.</p>}
        </ScrollView>
      </nav>

      <div className="min-h-0">
        {selected ? (
          // Remount when the list or its saved values change, so edits start from what's stored
          <ListCard key={`${selected.key}:${JSON.stringify(selected.values)}`} list={selected} canEdit={canEdit} fill onDirtyChange={setDirty} />
        ) : (
          <p className="rounded-xl border p-10 text-center text-sm text-muted-foreground">No lists.</p>
        )}
      </div>
    </div>
  )
}
