"use client"

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Autocomplete } from "@base-ui/react/autocomplete"
import { Dialog } from "@base-ui/react/dialog"
import { cn } from "cn"
import { Icon } from "./icon"
import { ScrollView } from "./scroll-view"

// Spotlight search (ported from the school-system portal): ⌘K / Ctrl+K anywhere.
// `search(query)` returns groups: [{ value: "Group name", items: [{ value, label, href, icon, meta }] }]

const SpotlightContext = createContext(null)

export function useSpotlightSearch() {
  const context = useContext(SpotlightContext)
  if (!context) throw new Error("useSpotlightSearch must be used within SpotlightSearchProvider")
  return context
}

// search(query) → [{ value: "Group", items: [{ value, label, meta, icon, href }] }], synchronous
export function SpotlightSearchProvider({ search, placeholder = "Search…", hint, children }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const value = useMemo(() => ({ open, setOpen, openSpotlight: () => setOpen(true) }), [open])

  return (
    <SpotlightContext.Provider value={value}>
      {children}
      {open && <SpotlightSearch onClose={() => setOpen(false)} search={search} placeholder={placeholder} hint={hint} />}
    </SpotlightContext.Provider>
  )
}

function SpotlightSearch({ onClose, search, placeholder, hint }) {
  const router = useRouter()
  const hintId = useId()
  const [query, setQuery] = useState("")
  const highlightedRef = useRef(null)
  const groups = useMemo(() => search(query), [search, query])

  const select = useCallback(
    (item) => {
      if (!item?.href) return
      onClose()
      router.push(item.href)
    },
    [router, onClose],
  )

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs dark:bg-black/70" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden px-4 pt-[12vh] pb-6">
          <Dialog.Popup
            aria-label="Spotlight search"
            className="relative flex max-h-[min(36rem,calc(100dvh-6rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl outline-none transition-[translate,scale,opacity] duration-150 data-ending-style:-translate-y-3 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:-translate-y-3 data-starting-style:scale-95 data-starting-style:opacity-0"
          >
            <Dialog.Title className="sr-only">Spotlight search</Dialog.Title>
            <Dialog.Description className="sr-only">Search apps, pages and records across PropFlow.</Dialog.Description>

            <Autocomplete.Root
              open
              inline
              items={groups}
              value={query}
              onValueChange={setQuery}
              filter={null}
              autoHighlight="always"
              keepHighlight
              onItemHighlighted={(item) => {
                highlightedRef.current = item ?? null
              }}
            >
              <Autocomplete.InputGroup className="flex items-center gap-3 border-b px-4">
                <Icon name="search-line" className="text-xl text-muted-foreground" aria-hidden />
                <Autocomplete.Input
                  autoFocus
                  placeholder={placeholder}
                  aria-label="Search PropFlow"
                  aria-describedby={hintId}
                  className="h-14 w-full border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && highlightedRef.current) {
                      e.preventDefault()
                      select(highlightedRef.current)
                    }
                  }}
                />
                <Dialog.Close className="inline-flex h-7 cursor-pointer items-center rounded-md border bg-muted px-2 text-[11px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  Esc
                </Dialog.Close>
              </Autocomplete.InputGroup>

              <ScrollView className="min-h-0 flex-1" viewportClassName="px-2 pb-2">
                <Autocomplete.Empty className="text-sm text-muted-foreground">
                  <div className="px-3 py-10 text-center">No results for “{query}”.</div>
                </Autocomplete.Empty>
                <Autocomplete.List className="outline-none">
                  {(group) => (
                    <Autocomplete.Group key={group.value} items={group.items} className="pt-1 not-last:mb-1">
                      <Autocomplete.GroupLabel className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.value}</Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(item) => (
                          <Autocomplete.Item
                            key={item.value}
                            value={item}
                            onClick={() => select(item)}
                            className="group/item flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none select-none data-highlighted:bg-primary/10"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted group-data-highlighted/item:bg-primary/15 group-data-highlighted/item:text-primary">
                              <Icon name={item.icon} className="text-lg" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium group-data-highlighted/item:text-primary">{item.label}</span>
                              <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
                            </span>
                            <Icon name="corner-down-left-line" className="text-base text-muted-foreground opacity-0 group-data-highlighted/item:opacity-100" />
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </ScrollView>

              <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                <span id={hintId} className="sr-only">
                  Use arrow keys to move, Enter to open a result, and Escape to close.
                </span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>Navigate
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>Open
                  </span>
                </div>
                {hint && <span className="hidden sm:inline">{hint}</span>}
              </div>
            </Autocomplete.Root>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Header trigger that looks like a search box
export function SpotlightTrigger({ className }) {
  const { openSpotlight } = useSpotlightSearch()
  // Known only in the browser; the server renders the Windows hint
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  )
  return (
    <button
      type="button"
      onClick={openSpotlight}
      aria-label="Spotlight search"
      className={cn(
        "hidden h-control w-56 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground shadow-xs outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring md:inline-flex lg:w-72 dark:bg-input/20",
        className,
      )}
    >
      <Icon name="search-line" className="text-base" />
      <span className="min-w-0 flex-1 truncate">Spotlight search…</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">{isMac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  )
}
