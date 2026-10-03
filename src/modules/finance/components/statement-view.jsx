"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { DataTable } from "@/components/data-table"
import { PrintPreviewDialog } from "@/components/document/print-preview-dialog"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { ACCOUNT_TYPES, ACCOUNTS, PERIODS, figure } from "../constants"
import { StatementDocument } from "./finance-documents"
import { PeriodSelect, SourceLink, VoucherStatusBadge, VoucherTypeBadge, rupees } from "./finance-parts"
import { useVoucherViewer } from "./voucher-dialogs"

// One account's ledger: opening balance, each entry with a running balance, closing balance.
//   statement: accountStatement() · canVoid: finance.void (for the voucher dialog)
export function StatementView({ statement: s, brand, canVoid = false }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, startTransition] = useTransition()
  const [printing, setPrinting] = useState(false)
  const viewer = useVoucherViewer({ brand, canVoid })
  const a = s.account
  const money = Boolean(a.kind) || a.code === ACCOUNTS.clearing
  const periodLabel = PERIODS.find((p) => p.value === s.period)?.label ?? ""
  const setPeriod = (period) => startTransition(() => router.replace(`${pathname}?period=${period}`, { scroll: false }))
  const details = [ACCOUNT_TYPES[a.type]?.label, a.bankName && [a.bankName, a.branch, a.accountNumber].filter(Boolean).join(", "), !a.bankName && a.description, !a.isActive && "Switched off"].filter(Boolean).join(" · ")

  const columns = [
    { key: "date", header: "Date", className: "whitespace-nowrap", cell: (l) => formatDate(l.date) },
    {
      key: "voucher",
      header: "Voucher",
      cell: (l) =>
        l.opening ? (
          <span className="text-xs text-muted-foreground">Opening</span>
        ) : (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <VoucherTypeBadge type={l.type} />
            <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
          </span>
        ),
    },
    {
      key: "narration",
      header: "Narration",
      cell: (l) => (
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate">{l.narration}</span>
            <VoucherStatusBadge status={l.status} />
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {[l.party, l.memo, l.project?.name, l.chequeNo && `Cheque ${l.chequeNo}`, l.reference].filter(Boolean).join(" · ")}
            {!l.opening && <SourceLink voucher={l} />}
          </span>
        </div>
      ),
    },
    { key: "debit", header: "Debit", className: "text-right tabular-nums whitespace-nowrap", cell: (l) => figure(l.debit) },
    { key: "credit", header: "Credit", className: "text-right tabular-nums whitespace-nowrap", cell: (l) => figure(l.credit) },
    { key: "balance", header: "Balance", className: "text-right tabular-nums whitespace-nowrap font-medium", cell: (l) => figure(l.balance) || "0" },
  ]

  const printUrl = `/finance/accounts/${urlCode(a.code)}/print?period=${s.period}`
  const pdfUrl = `/api/finance/accounts/${urlCode(a.code)}/pdf?period=${s.period}`
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <Link href={money ? "/finance/banks" : "/finance/accounts"} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <Icon name="arrow-left-line" /> {money ? "Bank & cash" : "Chart of accounts"}
      </Link>
      <PageHeader
        title={`${a.code} · ${a.name}`}
        description={details}
        toolbar={<PeriodSelect value={s.period} onChange={setPeriod} className="w-52" />}
        actions={
          <Button variant="outline" leftIcon="printer-line" onClick={() => setPrinting(true)}>
            Print
          </Button>
        }
      />
      <div className={cn("grid grid-cols-2 gap-3 rounded-xl border bg-background p-4 text-sm shadow-xs sm:grid-cols-4", loading && "opacity-60")}>
        {[
          ["Opening balance", s.opening],
          ["Debits", s.debits],
          ["Credits", s.credits],
          ["Closing balance", s.closing],
        ].map(([k, v], i) => (
          <div key={k}>
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className={cn("tabular-nums", i === 3 && "text-lg font-semibold", v < 0 && "text-red-600 dark:text-red-400")}>{rupees(v)}</p>
          </div>
        ))}
      </div>
      <div className={cn("min-h-0 flex-1", loading && "opacity-60")}>
        <DataTable columns={columns} rows={s.lines} minWidth="56rem" onRowClick={(l) => !l.opening && viewer.open(l.code)} empty={`No entries in ${periodLabel.toLowerCase()}.`} />
      </div>
      <p className="text-xs text-muted-foreground">Balances are {ACCOUNT_TYPES[a.type]?.normal} balances; figures in brackets are the other way. Pending and sent-back vouchers aren&apos;t included.</p>
      {printing && (
        <PrintPreviewDialog title={`Statement ${a.code} · ${a.name}`} printUrl={printUrl} pdfUrl={pdfUrl} onClose={() => setPrinting(false)}>
          <StatementDocument s={s} brand={brand} />
        </PrintPreviewDialog>
      )}
      {viewer.dialog}
    </div>
  )
}
