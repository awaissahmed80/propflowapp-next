"use client"

import { useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { VOUCHER_SOURCES, VOUCHER_STATUS, VOUCHER_TYPES, figure } from "../constants"
import { NewVoucherDialog, VoucherDialog } from "./voucher-dialogs"
import { NewVoucherMenu, PeriodSelect, SourceLink, VoucherStatusBadge, VoucherTypeBadge, rupees } from "./finance-parts"

const list = (v) =>
  String(v ?? "")
    .split(",")
    .filter(Boolean)

// Finance › Vouchers: every voucher in a period, filtered in the URL (so links and Back work);
// ?open=<code> shows one in the view dialog.
//   vouchers: listVouchers() · filters: the URL's · opened: getVoucher() for ?open · form: voucherFormData()
//   can: { create, post, void }
export function VouchersView({ vouchers, truncated, filters, projects, form, brand, opened, title, description, can }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, startTransition] = useTransition()
  const [creating, setCreating] = useState(null)
  const [q, setQ] = useState(filters.q)
  const timer = useRef(null)

  const go = (patch, { open = null } = {}) => {
    const next = { ...filters, ...patch }
    const params = new URLSearchParams()
    for (const k of ["period", "type", "source", "status", "project", "q"]) if (next[k] && !(k === "period" && next[k] === "this-fy")) params.set(k, next[k])
    if (open) params.set("open", urlCode(open))
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }
  const search = (value) => {
    setQ(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => go({ q: value.trim() }), 350)
  }

  const groups = [
    { key: "type", label: "Type", icon: "file-list-3-line", options: Object.entries(VOUCHER_TYPES).map(([value, t]) => ({ value, label: `${t.short} · ${t.label}` })) },
    { key: "status", label: "Status", icon: "checkbox-circle-line", options: Object.entries(VOUCHER_STATUS).map(([value, s]) => ({ value, label: s.label })) },
    { key: "source", label: "From", icon: "apps-2-line", options: Object.entries(VOUCHER_SOURCES).map(([value, s]) => ({ value, label: s.label })) },
    { key: "project", label: "Project", icon: "community-line", options: [{ value: "head-office", label: "Head office" }, ...projects.map((p) => ({ value: p.code.toLowerCase(), label: p.name }))] },
  ]
  const filterValue = { type: list(filters.type), status: list(filters.status), source: list(filters.source), project: list(filters.project) }
  const setFilters = (v) => go(Object.fromEntries(Object.entries(v).map(([k, vals]) => [k, vals.join(",")])))
  const total = vouchers.filter((v) => v.status === "posted").reduce((s, v) => s + v.amount, 0)

  const columns = [
    { key: "date", header: "Date", className: "whitespace-nowrap", sortValue: (v) => new Date(v.date).getTime(), cell: (v) => formatDate(v.date) },
    {
      key: "voucher",
      header: "Voucher",
      sortValue: (v) => v.code,
      cell: (v) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <VoucherTypeBadge type={v.type} />
          <span className="font-mono text-xs text-muted-foreground">{v.code}</span>
        </span>
      ),
    },
    {
      key: "narration",
      header: "Narration",
      sortValue: (v) => v.narration.toLowerCase(),
      cell: (v) => (
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate">{v.narration}</span>
            <VoucherStatusBadge status={v.status} />
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {[v.party, v.project?.name, v.chequeNo && `Cheque ${v.chequeNo}`, v.reference].filter(Boolean).join(" · ")}
            <SourceLink voucher={v} />
          </span>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "text-right tabular-nums whitespace-nowrap font-medium",
      sortValue: (v) => v.amount,
      cell: (v) => <span className={cn(v.status === "void" && "line-through opacity-60")}>{figure(v.amount)}</span>,
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <>
            <PeriodSelect value={filters.period} onChange={(period) => go({ period })} className="w-48" />
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input
                type="search"
                placeholder="Voucher no., narration, party, cheque…"
                aria-label="Search vouchers"
                value={q}
                onChange={(e) => search(e.target.value)}
                startElement={<Icon name={loading ? "loader-3-fill" : "search-line"} className={cn(loading && "animate-spin")} />}
              />
            </div>
            <FilterMenu groups={groups} value={filterValue} onChange={setFilters} />
          </>
        }
        info={`${vouchers.length}${truncated ? "+" : ""} vouchers · ${rupees(total)} posted`}
        actions={can.create && form && <NewVoucherMenu onPick={setCreating} />}
      />
      <ActiveFilters groups={groups} value={filterValue} onChange={setFilters} />
      {truncated && <p className="text-xs text-muted-foreground">Showing the latest {vouchers.length.toLocaleString("en-PK")}. Pick a shorter period or filter to see the rest.</p>}
      <div className={cn("min-h-0 flex-1", loading && "opacity-70")}>
        <DataTable
          columns={columns}
          rows={vouchers}
          rowKey={(v) => v.code}
          minWidth="52rem"
          activeKey={opened?.code}
          onRowClick={(v) => go({}, { open: v.code })}
          empty="No vouchers match. Try another period or fewer filters."
        />
      </div>
      {creating && form && (
        <NewVoucherDialog
          kind={creating}
          form={form}
          canPost={can.post}
          onClose={() => setCreating(null)}
          onDone={(r) => {
            setCreating(null)
            if (r.pending) router.refresh()
            else go({}, { open: r.code })
          }}
        />
      )}
      {opened && <VoucherDialog key={`${opened.code}-${opened.status}`} voucher={opened} brand={brand} canVoid={can.void} onClose={() => go({})} onChanged={() => go({})} />}
    </div>
  )
}
