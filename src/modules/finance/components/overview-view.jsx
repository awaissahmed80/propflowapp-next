"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { vizColor } from "@/lib/chart-colors"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { BarChart } from "@/components/ui/chart"
import { Icon } from "@/components/ui/icon"
import { figure } from "../constants"
import { NewVoucherDialog, useVoucherViewer } from "./voucher-dialogs"
import { NewVoucherMenu, SourceLink, VoucherStatusBadge, VoucherTypeBadge } from "./finance-parts"

const axisPkr = (n) => formatPkr(n).replace(/^Rs /, "")

function MoreLink({ href, children }) {
  return (
    <Link href={href} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {children} <Icon name="arrow-right-s-line" />
    </Link>
  )
}

// Finance home. data: financeOverview() · form: voucherFormData() (when the person can enter vouchers)
//   can: { create, post, void }
export function FinanceOverview({ data, form, brand, description, can }) {
  const router = useRouter()
  const [creating, setCreating] = useState(null)
  const viewer = useVoucherViewer({ brand, canVoid: can.void })
  const thisMonth = data.months.at(-1)
  const owedHint = [data.taxWithheld && `${formatPkr(data.taxWithheld)} tax withheld`, data.refunds && `${formatPkr(data.refunds)} refunds`, data.payable && `${formatPkr(data.payable)} vendors`]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Finance" description={description} actions={can.create && form && <NewVoucherMenu onPick={setCreating} />} />

      {data.pending.count > 0 && (
        <Link href="/finance/vouchers?status=pending&period=all" className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 hover:bg-amber-500/15 dark:text-amber-200">
          <Icon name="time-line" />
          <span className="flex-1">
            {data.pending.count} {data.pending.count === 1 ? "voucher is" : "vouchers are"} waiting for approval ({formatPkr(data.pending.amount)})
          </span>
          <Icon name="arrow-right-s-line" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="bank-line" tone="green" label="Cash & bank" value={formatPkr(data.cash)} hint={`${formatPkr(thisMonth.in)} in, ${formatPkr(thisMonth.out)} out this month`} />
        <StatTile icon="bank-card-2-line" tone="amber" label="Cheques in clearing" value={data.clearing ? formatPkr(data.clearing) : "None"} hint="Deposited, not yet cleared" />
        <StatTile icon="hand-coin-line" label="Receivable from buyers" value={formatPkr(data.receivable)} hint="Booked value not yet paid" />
        <StatTile icon="government-line" tone="violet" label="Owed" value={formatPkr(data.owed)} hint={owedHint || "Vendors, tax, refunds, EOBI"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Money in and out, last 6 months" className="lg:col-span-2">
          <BarChart
            data={data.months}
            xKey="month"
            valueFormatter={formatPkr}
            axisFormatter={axisPkr}
            series={[
              { key: "in", label: "Money in", color: vizColor("blue") },
              { key: "out", label: "Money out", color: vizColor("amber") },
            ]}
            style={{ height: 240 }}
          />
          <p className="mt-2 text-xs text-muted-foreground">Cash and bank only. Transfers between your own accounts are left out.</p>
        </SectionCard>
        <SectionCard title="Bank & cash" action={<MoreLink href="/finance/banks">All accounts</MoreLink>} bodyClassName="p-2">
          {data.cashAccounts.length ? (
            <ul>
              {data.cashAccounts.map((a) => (
                <li key={a.code}>
                  <Link href={`/finance/accounts/${urlCode(a.code)}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon name={a.kind === "bank" ? "bank-line" : "wallet-3-line"} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {a.name}
                      {a.isDefault && <span className="ml-1.5 text-xs text-muted-foreground">Default</span>}
                    </span>
                    <span className="text-sm font-medium tabular-nums">{formatPkr(a.balance)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-2 text-sm text-muted-foreground">No cash or bank accounts yet.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Latest vouchers" action={<MoreLink href="/finance/vouchers">All vouchers</MoreLink>} bodyClassName="p-2">
        {data.recent.length ? (
          <ul className="divide-y">
            {data.recent.map((v) => (
              <li key={v.code}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => viewer.open(v.code)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), viewer.open(v.code))}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60"
                >
                  <VoucherTypeBadge type={v.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{v.narration}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-mono">{v.code}</span>
                      {formatDate(v.date)}
                      {v.party ? ` · ${v.party}` : ""}
                      <SourceLink voucher={v} />
                    </span>
                  </span>
                  <VoucherStatusBadge status={v.status} />
                  <span className="text-sm font-medium tabular-nums">{figure(v.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-2 text-sm text-muted-foreground">No vouchers yet. Bookings, payments and fees post here on their own; enter your own with New voucher.</p>
        )}
      </SectionCard>

      {creating && form && (
        <NewVoucherDialog
          kind={creating}
          form={form}
          canPost={can.post}
          onClose={() => setCreating(null)}
          onDone={(r) => {
            setCreating(null)
            router.refresh()
            if (!r.pending) viewer.open(r.code)
          }}
        />
      )}
      {viewer.dialog}
    </div>
  )
}
