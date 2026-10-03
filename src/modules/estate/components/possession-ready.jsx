"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { urlCode } from "@/lib/url"
import { toastAction } from "@/lib/toast-action"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"
import { startPossession } from "../server/actions"

// Possession page banner: fully paid owners in phases open for possession who haven't asked yet.
// Review opens the list; Start logs a possession request for that file and opens it.
//   owners: possessionReady() → [{ code, buyer, phone, unit, project, phase }] · canCreate
export function PossessionReady({ owners, canCreate = false }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [, startTransition] = useTransition()
  if (!owners.length) return null

  const start = (code) =>
    startTransition(async () => {
      setBusy(code)
      const r = await toastAction(() => startPossession(code), { loading: "Starting possession…", success: (x) => `Possession request ${x.code} started.` })
      setBusy(null)
      // Its file or channel didn't pass (e.g. the Letter channel was switched off): say why
      if (r?.fieldErrors) toast.error(Object.values(r.fieldErrors)[0])
      if (r?.ok) {
        setOpen(false)
        router.push(`/estate-management/requests/${urlCode(r.code)}`)
      }
    })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-left text-sm text-sky-900 hover:bg-sky-500/15 dark:text-sky-200">
        <Icon name="key-2-line" />
        <span className="flex-1">
          {owners.length} fully paid {owners.length === 1 ? "owner hasn't" : "owners haven't"} asked for possession yet.
        </span>
        <span className="font-medium">Review</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} className="sm:max-w-xl" title="Ready for possession" description="Fully paid files in phases open for possession, with no possession request yet.">
        <ScrollView className="-mx-2 max-h-[60svh]" viewportClassName="px-2">
          <ul className="divide-y">
            {owners.map((b) => (
              <li key={b.code} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.buyer}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[b.code, b.project, b.phase, b.unit].filter(Boolean).join(" · ")}</span>
                </span>
                {canCreate && (
                  <Button size="sm" variant="outline" loading={busy === b.code} disabled={Boolean(busy) && busy !== b.code} onClick={() => start(b.code)}>
                    Start
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </ScrollView>
      </Dialog>
    </>
  )
}
