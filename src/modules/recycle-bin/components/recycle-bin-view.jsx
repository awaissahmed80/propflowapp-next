"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDateTime, timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { purgeRecords, restoreRecords } from "../server/actions"

// Settings › Recycle bin (administrators): everything deleted in the workspace's apps. Restore
// brings a record back with what went with it; Delete permanently removes it, its history and its
// files for good. Records that others still point at (a lead with a booking…) stay in the bin.
//   items: listBin().items

const idOf = (i) => `${i.kind}:${i.key}`

export function RecycleBinView({ items }) {
  const router = useRouter()
  const { confirm } = useAlert()
  const [group, setGroup] = useState("all")
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState(new Set())
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => {
    const m = new Map()
    for (const i of items) m.set(i.group, (m.get(i.group) ?? 0) + 1)
    return [...m.entries()]
  }, [items])
  const q = search.trim().toLowerCase()
  const visible = items.filter((i) => (group === "all" || i.group === group) && (!q || [i.title, i.code, i.sub, i.label, i.deletedBy].some((v) => v?.toLowerCase().includes(q))))
  const chosen = items.filter((i) => picked.has(idOf(i)))

  const run = async (list, action) => {
    if (!list.length) return
    const n = list.length
    const word = n === 1 ? `${list[0].label.toLowerCase()} ${list[0].title}` : `${n} records`
    const purging = action === "purge"
    const ok = await confirm(
      purging
        ? {
            title: `Delete ${word} permanently?`,
            description: "It's removed for good, with its history and files. This can't be undone.",
            confirmLabel: "Delete permanently",
            destructive: true,
            ...(n > 5 ? { typeToConfirm: "DELETE" } : {}),
          }
        : { title: `Restore ${word}?`, description: "It comes back where it was, with everything that was deleted along with it.", confirmLabel: "Restore", icon: "arrow-go-back-line" },
    )
    if (!ok) return
    setBusy(true)
    const keys = list.map(({ kind, key }) => ({ kind, key }))
    const r = await toastAction(() => (purging ? purgeRecords(keys) : restoreRecords(keys)), {
      loading: purging ? "Deleting…" : "Restoring…",
      success: (x) => `${x.count === 1 ? "1 record" : `${x.count} records`} ${purging ? "deleted permanently" : "restored"}.`,
    })
    setBusy(false)
    if (r?.skipped?.length) toast.warning(`${r.skipped.length} left in the bin`, { description: r.skipped.slice(0, 4).join(" · "), duration: 10000 })
    if (r?.ok) {
      setPicked(new Set())
      router.refresh()
    }
  }

  const columns = [
    {
      key: "title",
      header: "Record",
      sortValue: (i) => i.title?.toLowerCase() ?? "",
      cell: (i) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon name={i.icon} className="shrink-0 text-lg text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate font-medium">{i.title}</span>
            {(i.code || i.sub) && <span className="block truncate text-xs text-muted-foreground">{[i.code, i.sub].filter(Boolean).join(" · ")}</span>}
          </span>
        </span>
      ),
    },
    { key: "type", header: "Type", sortValue: (i) => i.label, cell: (i) => <Badge color="gray">{i.label}</Badge> },
    { key: "app", header: "App", sortValue: (i) => i.group, cell: (i) => <span className="text-muted-foreground">{i.group}</span> },
    {
      key: "deletedAt",
      header: "Deleted",
      sortValue: (i) => i.deletedAt,
      cell: (i) => (
        <span title={formatDateTime(i.deletedAt)}>
          {timeAgo(i.deletedAt)}
          {i.deletedBy && <span className="block text-xs text-muted-foreground">by {i.deletedBy}</span>}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (i) => (
        <span className="inline-flex gap-1">
          <IconButton icon="arrow-go-back-line" size="sm" variant="ghost" tooltip="Restore" disabled={busy} onClick={() => run([i], "restore")} />
          <IconButton icon="delete-bin-line" size="sm" variant="ghost" tooltip="Delete permanently" className="text-red-600 dark:text-red-400" disabled={busy} onClick={() => run([i], "purge")} />
        </span>
      ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Recycle Bin"
        description="Records deleted in any app. Restore them, or delete them permanently. Only administrators see this page."
        toolbar={
          <div className="min-w-32 flex-1 sm:max-w-80">
            <Input type="search" placeholder="Name, code or who deleted it…" aria-label="Search the recycle bin" value={search} onChange={(e) => setSearch(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
        }
        actions={
          chosen.length > 0 && (
            <>
              <Button variant="outline" leftIcon="arrow-go-back-line" disabled={busy} onClick={() => run(chosen, "restore")}>
                Restore {chosen.length}
              </Button>
              <Button variant="outline" leftIcon="delete-bin-line" className="text-red-600 hover:text-red-600 dark:text-red-400" disabled={busy} onClick={() => run(chosen, "purge")}>
                Delete {chosen.length} permanently
              </Button>
            </>
          )
        }
      />
      {groups.length > 1 && (
        <div role="radiogroup" aria-label="App" className="flex flex-wrap gap-1.5">
          {[["all", items.length], ...groups].map(([g, n]) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={group === g}
              onClick={() => setGroup(g)}
              className={cn("h-8 rounded-full border px-3 text-sm", group === g ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}
            >
              {g === "all" ? "All" : g} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={idOf}
          minWidth="52rem"
          defaultSort={{ key: "deletedAt", dir: "desc" }}
          selectedIds={picked}
          onSelectionChange={setPicked}
          empty={<p className="text-sm text-muted-foreground">{items.length ? "Nothing matches." : "The recycle bin is empty. Records deleted in any app show up here, to restore or delete permanently."}</p>}
        />
      </div>
    </div>
  )
}
