"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cancelLeave } from "../server/actions"
import { ApplyLeaveDialog } from "./leave-dialogs"
import { LeaveBalance, LeaveStatusBadge, LeaveTypeBadge, dateRange, daysLabel } from "./people-parts"

// My Desk › My leave: what's left this year, my requests and their status, apply and withdraw.
//   data: myLeave() · waiting: leave requests waiting for me to approve (Approvals link) · hr: may open HR's Leave page
export function MyLeaveView({ data, waiting = 0, hr = false }) {
  const router = useRouter()
  const [applying, setApplying] = useState(false)
  const [pending, startTransition] = useTransition()

  const cancel = async (l) => {
    const ok = await confirm({
      title: l.status === "pending" ? "Withdraw this request?" : "Cancel this leave?",
      description: `${dateRange(l.startOn, l.endOn)} · ${daysLabel(l.days)}`,
      confirmLabel: l.status === "pending" ? "Withdraw" : "Cancel leave",
      cancelLabel: "Keep it",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => cancelLeave(l.code), { loading: "Canceling…", success: l.status === "pending" ? "Request withdrawn." : "Leave canceled." })
      if (r?.ok) router.refresh()
    })
  }

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="My leave"
        description={`Your ${data.year} allowances and requests. Requests go to someone who approves leave.`}
        actions={
          <>
            {hr && (
              <Button variant="outline" leftIcon="calendar-check-line" nativeButton={false} render={<Link href="/hrm/leave" />}>
                Team leave
              </Button>
            )}
            <Button leftIcon="plane-line" onClick={() => setApplying(true)}>
              Apply for leave
            </Button>
          </>
        }
      />
      {waiting > 0 && (
        <Link href="/approvals" className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 hover:bg-amber-500/15 dark:text-amber-200">
          <Icon name="shield-check-line" /> {waiting} leave {waiting === 1 ? "request is" : "requests are"} waiting for your approval
          <Icon name="arrow-right-s-line" className="ml-auto" />
        </Link>
      )}
      <SectionCard title="Left this year">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data.balances.map((b) => (
            <LeaveBalance key={b.type} balance={b} />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="My requests" bodyClassName="px-4 py-1">
        {data.leaves.length ? (
          <ul className="divide-y">
            {data.leaves.map((l) => (
              <li key={l.code} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 text-sm">
                <LeaveTypeBadge type={l.type} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {dateRange(l.startOn, l.endOn)} · {daysLabel(l.days)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{[l.code, `applied ${formatDate(l.appliedAt)}`, l.reason, l.note && `Reply: ${l.note}`].filter(Boolean).join(" · ")}</span>
                </span>
                <LeaveStatusBadge status={l.status} />
                {l.canCancel && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => cancel(l)}>
                    {l.status === "pending" ? "Withdraw" : "Cancel"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No leave yet. Apply above; you&apos;ll see the decision here.</p>
        )}
      </SectionCard>
      {applying && (
        <ApplyLeaveDialog
          employees={[data.employee]}
          balances={{ [data.employee.code]: data.balances }}
          canPickOthers={false}
          onClose={() => setApplying(false)}
          onDone={() => {
            setApplying(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
