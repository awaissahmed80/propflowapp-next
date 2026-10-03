"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Select } from "@/components/ui/select"
import { saveFinanceSettings } from "../server/actions"

// Finance › Customize › Books & defaults: the cash or bank account money goes to unless someone
// picks another, and the date the books are closed up to (nothing can be posted on or before it).
//   settings: { lockDate, defaultAccountId } · accounts: [{ id, code, name, kind }] · canEdit
export function FinanceSettingsView({ settings, accounts, canEdit = false }) {
  const router = useRouter()
  const [s, setS] = useState(settings)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(s) !== JSON.stringify(settings)
  useUnsavedGuard(dirty)

  const save = () =>
    startTransition(async () => {
      if (s.lockDate && s.lockDate !== settings.lockDate) {
        const ok = await confirm({
          title: `Close the books up to ${s.lockDate}?`,
          description: "Nothing can be posted on or before that date afterwards. Entries from the other apps for those days land on today instead.",
          confirmLabel: "Close the books",
        })
        if (!ok) return
      }
      const r = await toastAction(() => saveFinanceSettings(s), { loading: "Saving…", success: "Finance settings saved." })
      if (r?.ok) router.refresh()
    })

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Books & defaults"
        description="The account money goes to unless someone picks another, and the period the books are closed for."
        actions={
          canEdit &&
          dirty && (
            <>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={async () => (await confirm({ title: "Discard unsaved changes?", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true })) && setS(settings)}
              >
                Discard
              </Button>
              <Button leftIcon="check-line" loading={pending} onClick={save}>
                Save changes
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Default account">
          <div className="space-y-2">
            <Select
              label="Payments go into and out of"
              value={s.defaultAccountId}
              onChange={(v) => setS((x) => ({ ...x, defaultAccountId: v }))}
              disabled={!canEdit}
              options={accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, description: a.kind === "bank" ? "Bank" : "Cash" }))}
            />
            <p className="text-xs text-muted-foreground">Pre-selected wherever money is received or paid; people can still pick another account. With no bank added yet, it&apos;s Cash in hand.</p>
          </div>
        </SectionCard>
        <SectionCard title="Closed period">
          <div className="space-y-2">
            <DatePicker label="Books closed up to" value={s.lockDate ?? ""} onChange={(v) => setS((x) => ({ ...x, lockDate: v || null }))} disabled={!canEdit} placeholder="Not closed" />
            <p className="text-xs text-muted-foreground">Close a month once it&apos;s reconciled and reported. Vouchers can&apos;t be entered on or before this date.</p>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
