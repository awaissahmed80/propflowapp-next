"use client"

import { useState } from "react"
import { toast } from "sonner"
import { toastAction } from "@/lib/toast-action"
import { useAlert } from "@/components/alert-context"
import { deleteRecords } from "../server/actions"

// Delete → recycle bin, with a confirm first. Administrators restore or remove it for good in
// Settings › Recycle bin.
//   const { remove, deleting } = useDelete("lead")
//   remove(["LD-00012"], { name: "Ali Raza", onDone: () => … })
export function useDelete(kind) {
  const { confirm } = useAlert()
  const [deleting, setDeleting] = useState(false)
  const remove = async (codes, { name, what = "record", onDone } = {}) => {
    const list = [codes].flat().filter(Boolean)
    if (!list.length) return
    const label = list.length === 1 ? (name ?? `this ${what}`) : `${list.length} ${what}s`
    const ok = await confirm({
      title: `Delete ${label}?`,
      description: `${list.length === 1 ? "It goes" : "They go"} to the recycle bin, where an administrator can restore ${list.length === 1 ? "it" : "them"} or delete ${list.length === 1 ? "it" : "them"} permanently.`,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!ok) return
    setDeleting(true)
    const r = await toastAction(() => deleteRecords(kind, list), {
      loading: "Deleting…",
      success: (x) => (list.length === 1 ? `${name ?? "Deleted"}${name ? " moved to the recycle bin." : "."}` : `${x.count} ${what}s moved to the recycle bin.`),
    })
    setDeleting(false)
    if (r?.skipped?.length && r.ok) toast.warning(`${r.skipped.length} not deleted`, { description: r.skipped.slice(0, 4).join(" · "), duration: 10000 })
    if (r?.ok) onDone?.(r)
    return r
  }
  return { remove, deleting }
}
