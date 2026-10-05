"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { deleteWorkspace, discardItem, purgeItem, purgeWorkspaceForGood, restoreItem, restoreWorkspace } from "../server/deletion-actions"

// Deleting in the console (platform owner only): delete a workspace (soft), discard an enquiry or
// workspace request, and the Deleted items page where they're restored or removed for good.

// Workspace ⋮ › Delete workspace…: hidden everywhere, its people signed out, data kept until removed
export function DeleteWorkspaceDialog({ t, onClose }) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const run = () =>
    startTransition(async () => {
      const r = await toastAction(() => deleteWorkspace(t.id, reason), { loading: "Deleting…", success: `${t.name} deleted. Restore it or remove it for good from Deleted items.` })
      if (r?.ok) router.push("/workspaces")
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={`Delete ${t.name}?`}
      description="It disappears from every list and nobody can sign in to it; everyone signed in is signed out. Its data stays until you remove it permanently from Deleted items, so it can be restored."
      footer={
        <>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={pending} disabled={reason.trim().length < 5} onClick={run}>
            Delete workspace
          </Button>
        </>
      }
    >
      <Textarea label="Why" required rows={3} maxLength={300} placeholder="e.g. Test workspace, or the customer asked to close their account" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Dialog>
  )
}

// "Discard" on an enquiry or a workspace request
export function DiscardButton({ kind, id, code, back }) {
  const router = useRouter()
  const { confirm } = useAlert()
  const [pending, startTransition] = useTransition()
  const discard = async () => {
    if (!(await confirm({ title: `Discard ${code}?`, description: "It leaves the list. You can restore it, or remove it for good, from Deleted items.", confirmLabel: "Discard", destructive: true }))) return
    startTransition(async () => {
      const r = await toastAction(() => discardItem(kind, id), { loading: "Discarding…", success: `${code} discarded.` })
      if (r?.ok) back ? router.push(back) : router.refresh()
    })
  }
  return (
    <Button size="sm" variant="outline" leftIcon="delete-bin-line" className="text-red-600 hover:text-red-600 dark:text-red-400" loading={pending} onClick={discard}>
      Discard
    </Button>
  )
}

// One deleted thing: what it is, and Restore / Delete permanently
function Row({ title, sub, onRestore, onPurge, k, busy }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="min-w-0 flex-1 basis-64">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <Button size="sm" variant="outline" leftIcon="arrow-go-back-line" disabled={Boolean(busy)} loading={busy === `r${k}`} onClick={onRestore}>
        Restore
      </Button>
      <Button size="sm" variant="outline" leftIcon="delete-bin-line" className="text-red-600 hover:text-red-600 dark:text-red-400" disabled={Boolean(busy)} loading={busy === k} onClick={onPurge}>
        Delete permanently
      </Button>
    </li>
  )
}
const Empty = ({ text }) => <p className="px-4 py-6 text-center text-sm text-muted-foreground">{text}</p>

// Console › Deleted items
//   workspaces: [{ id, code, name, plan, members, deletedAt, deletedBy, reason }]
//   enquiries / requests: [{ id, code, title, detail, deletedAt, deletedBy }]
export function DeletedItemsView({ workspaces, enquiries, requests }) {
  const router = useRouter()
  const { confirm } = useAlert()
  const [busy, setBusy] = useState(null)
  const act = async (key, fn, messages) => {
    setBusy(key)
    const r = await toastAction(fn, messages)
    setBusy(null)
    if (r?.ok) router.refresh()
  }

  const purgeWorkspace = async (w) => {
    const ok = await confirm({
      title: `Remove ${w.name} permanently?`,
      description: `Its database, every record and file, and the accounts of people who only use this workspace are deleted. This can't be undone. The console audit log keeps a note that it existed.`,
      confirmLabel: "Remove permanently",
      destructive: true,
      typeToConfirm: w.code,
    })
    if (ok) act(`w${w.id}`, () => purgeWorkspaceForGood(w.id, w.code), { loading: `Removing ${w.code}…`, success: (x) => `${w.name} removed: database, ${x.removed.files} files, ${x.removed.users} accounts.` })
  }
  const purge = async (kind, item) => {
    const ok = await confirm({
      title: `Remove ${item.code} permanently?`,
      description: kind === "request" ? "The request, its messages and screenshots are deleted. This can't be undone." : "This can't be undone.",
      confirmLabel: "Remove permanently",
      destructive: true,
    })
    if (ok) act(`${kind}${item.id}`, () => purgeItem(kind, item.id), { loading: "Removing…", success: `${item.code} removed.` })
  }

  const deleted = (x) => `Deleted ${timeAgo(x.deletedAt)}${x.deletedBy ? ` by ${x.deletedBy}` : ""}`

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Deleted items" description="Deleted workspaces, discarded enquiries and workspace requests. Restore them, or remove them permanently. Only the platform owner sees this page." />
      <SectionCard title={`Workspaces · ${workspaces.length}`} bodyClassName="p-0">
        {workspaces.length ? (
          <ul className="divide-y">
            {workspaces.map((w) => (
              <Row
                key={w.id}
                k={`w${w.id}`}
                busy={busy}
                title={
                  <>
                    {w.name} <span className="font-normal text-muted-foreground">· {w.code}</span>
                  </>
                }
                sub={[w.plan, `${w.members} ${w.members === 1 ? "member" : "members"}`, deleted(w), w.reason && `“${w.reason}”`].filter(Boolean).join(" · ")}
                onRestore={() => act(`rw${w.id}`, () => restoreWorkspace(w.id), { loading: "Restoring…", success: `${w.name} restored. Its people can sign in again.` })}
                onPurge={() => purgeWorkspace(w)}
              />
            ))}
          </ul>
        ) : (
          <Empty text="No deleted workspaces." />
        )}
      </SectionCard>
      <div className="grid gap-6 xl:grid-cols-2">
        {[
          ["enquiry", "Sales enquiries", enquiries],
          ["request", "Workspace requests", requests],
        ].map(([kind, label, list]) => (
          <SectionCard key={kind} title={`${label} · ${list.length}`} bodyClassName="p-0">
            {list.length ? (
              <ul className="divide-y">
                {list.map((x) => (
                  <Row
                    key={x.id}
                    k={`${kind}${x.id}`}
                    busy={busy}
                    title={
                      <>
                        {x.title} <Badge color="gray">{x.code}</Badge>
                      </>
                    }
                    sub={[x.detail, deleted(x)].filter(Boolean).join(" · ")}
                    onRestore={() => act(`r${kind}${x.id}`, () => restoreItem(kind, x.id), { loading: "Restoring…", success: `${x.code} restored.` })}
                    onPurge={() => purge(kind, x)}
                  />
                ))}
              </ul>
            ) : (
              <Empty text={`No discarded ${label.toLowerCase()}.`} />
            )}
          </SectionCard>
        ))}
      </div>
    </div>
  )
}
