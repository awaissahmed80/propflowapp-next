"use client"

import Link from "next/link"
import { formatAmount, formatDate, formatPkr } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Icon } from "@/components/ui/icon"
import { EmptyState } from "./parts"
import { NewInvoiceButton } from "./invoice-dialog"
import { InvoicesTable } from "./invoices-table"
import { urlCode } from "@/lib/url"

const DAY = 86_400_000

// newInvoice: { workspaces, taxRate } when the viewer can create invoices
export function BillingView({ invoices, now, newInvoice }) {
  const awaiting = invoices.filter((i) => i.displayStatus === "awaiting")
  const paid30 = invoices.filter((i) => i.status === "paid" && i.paidAt && now - new Date(i.paidAt).getTime() < 30 * DAY)
  const sum = (list) => list.reduce((s, i) => s + i.total, 0)
  const byWallet = invoices.filter((i) => i.payment && i.payment.method !== "bank").length

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Billing"
        description="Subscription invoices and payments across every workspace"
        actions={newInvoice && <NewInvoiceButton workspaces={newInvoice.workspaces} taxRate={newInvoice.taxRate} />}
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile icon="money-rupee-circle-line" tone="green" label="Collected · 30 days" value={formatPkr(sum(paid30))} hint={`${paid30.length} payments`} />
        <StatTile icon="time-line" tone="amber" label="Transfers to verify" value={awaiting.length} hint={formatPkr(sum(awaiting))} />
        <StatTile icon="file-list-3-line" label="Invoices" value={invoices.length} hint="All time" />
        <StatTile icon="bank-card-line" tone="sky" label="Paid by card or wallet" value={`${Math.round((byWallet / Math.max(1, invoices.length)) * 100)}%`} hint="The rest by bank transfer" />
      </div>

      <SectionCard title={`Bank transfers to verify · ${awaiting.length}`} bodyClassName="p-0">
        {awaiting.length ? (
          <ul className="divide-y">
            {awaiting.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  <Icon name="bank-line" />
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={`/workspaces/${urlCode(i.tenantCode)}`} className="block truncate font-medium hover:text-primary">
                    {i.tenantName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {i.code} · reference <span className="font-mono">{i.payment?.reference ?? "—"}</span> · {formatDate(i.issuedAt)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatAmount(i.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Icon name="checkbox-circle-line" className="text-emerald-600" /> Every transfer is matched.
          </p>
        )}
      </SectionCard>

      {invoices.length ? (
        <div className="h-[min(36rem,70svh)]">
          <InvoicesTable rows={invoices} canManage={Boolean(newInvoice)} taxRate={newInvoice?.taxRate ?? 0} />
        </div>
      ) : (
        <div className="rounded-xl border bg-background">
          <EmptyState icon="file-list-3-line" title="No invoices yet">
            Create one with New invoice, or from a workspace&apos;s page.
          </EmptyState>
        </div>
      )}
    </div>
  )
}
