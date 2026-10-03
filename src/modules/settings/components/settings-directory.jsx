"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"
import { AppIcon } from "@/components/app-icon"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { ListCard } from "@/modules/lookups/components/list-card"

// Settings › Lists & Labels and Settings › App Settings: one collapsible group per app down the
// side (its lists, or its settings), the chosen one on the right. Links carry the choice in the
// address (?list=lead-status, ?section=crm.pipeline).
//   groups: [{ app, name, icon, color, sections: [{ id, label, icon }], lists: [{ key, name, description, count, customized, system, values }] }]
//   current: { section } | { list } · label: the side's name · placeholder: the search box's hint
export function SettingsDirectory({ groups, current, label = "Settings", placeholder = "Find…", children }) {
  const [search, setSearch] = useState("")
  const openApp = groups.find((g) => g.sections.some((s) => s.id === current.section) || g.lists.some((l) => l.key === current.list))?.app
  const [collapsed, setCollapsed] = useState(() => new Set(groups.map((g) => g.app).filter((a) => a !== openApp)))
  const toggle = (app) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(app)) next.delete(app)
      else next.add(app)
      return next
    })

  const q = search.trim().toLowerCase()
  const hit = (...texts) => !q || texts.some((t) => t?.toLowerCase().includes(q))
  const shown = groups
    .map((g) => ({ ...g, sections: g.sections.filter((s) => hit(s.label, g.name)), lists: g.lists.filter((l) => hit(l.name, l.description, g.name, ...l.values)) }))
    .filter((g) => g.sections.length || g.lists.length)

  const row = (on) =>
    cn(
      "flex h-8 w-full items-center gap-2 rounded-md pr-2 pl-7 text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
      on && "bg-primary/10 font-medium text-primary hover:bg-primary/10",
    )

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:grid-rows-1">
      <nav aria-label={label} className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="border-b p-2">
          <label className="flex h-control-sm items-center gap-1.5 rounded-md bg-muted/60 px-2 text-sm focus-within:ring-[1px] focus-within:ring-ring/50">
            <Icon name="search-line" className="text-muted-foreground" />
            <input
              type="search"
              placeholder={placeholder}
              aria-label={placeholder.replace("…", "")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <ScrollView variant="subtle" className="max-h-64 min-h-0 flex-1 lg:max-h-none" viewportClassName="p-1.5">
          {shown.map((g) => {
            const open = q || !collapsed.has(g.app)
            return (
              <div key={g.app} className="mb-1">
                <button
                  type="button"
                  aria-expanded={Boolean(open)}
                  onClick={() => toggle(g.app)}
                  className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon name="arrow-right-s-line" className={cn("text-base text-muted-foreground transition-transform", open && "rotate-90")} />
                  {g.icon ? <AppIcon icon={g.icon} color={g.color} size="sm" className="size-6 rounded-md text-xs" /> : <Icon name="list-settings-line" className="text-base text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">{g.sections.length + g.lists.length}</span>
                </button>
                {open && (
                  <div className="mt-0.5">
                    {g.sections.map((s) => (
                      <Link key={s.id} href={`?section=${s.id}`} scroll={false} aria-current={s.id === current.section ? "page" : undefined} className={row(s.id === current.section)}>
                        <Icon name={s.icon} className="text-sm opacity-70" />
                        <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      </Link>
                    ))}
                    {g.sections.length > 0 && g.lists.length > 0 && <p className="mt-1 pt-1 pb-0.5 pl-7 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Lists & labels</p>}
                    {g.lists.map((l) => (
                      <Link key={l.key} href={`?list=${l.key}`} scroll={false} aria-current={l.key === current.list ? "page" : undefined} className={row(l.key === current.list)}>
                        <span className="min-w-0 flex-1 truncate">{l.name}</span>
                        {l.customized && <span className="size-1.5 rounded-full bg-amber-500" aria-label="Customized" />}
                        {l.system && <Icon name="lock-line" className="text-xs text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground tabular-nums">{l.count}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {!shown.length && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches.</p>}
        </ScrollView>
      </nav>

      <ScrollView variant="subtle" className="min-h-0" viewportClassName="[&>*]:!px-1 [&>*]:!pt-0 lg:[&>*]:!px-2">
        {children}
      </ScrollView>
    </div>
  )
}

// A list on the right: the shared list card, asking before leaving with unsaved edits
export function SettingsListCard({ list, canEdit = true }) {
  const [dirty, setDirty] = useState(false)
  useUnsavedGuard(dirty)
  return (
    <div>
      <ListCard list={list} canEdit={canEdit} onDirtyChange={setDirty} />
    </div>
  )
}
