"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDate, formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { DataTable } from "@/components/data-table"
import { ActiveFilters, FilterMenu } from "@/components/filter-menu"
import { PageHeader } from "@/components/page-header"
import { StatTile } from "@/components/stat-tile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveVendor, setVendorActive } from "../server/vendor-actions"
import { financeNav, rs } from "./money-parts"

// Finance › Vendors: contractors, suppliers and utilities, what each was paid this financial
// year and the income tax withheld from them.
//   vendors / fy: vendorRegister() · accounts: chargeAccounts() · can: { create, edit }

export function VendorsView({ vendors, fy, accounts, can }) {
  const router = useRouter()
  const categories = useList("vendor-category")
  const { title, description } = financeNav("/finance/vendors")
  const [q, setQ] = useState("")
  const [filters, setFilters] = useState({ category: [], state: ["active"] })
  const [editing, setEditing] = useState(null) // "new" | vendor
  const [, startTransition] = useTransition()
  const groups = [
    { key: "category", label: "Category", icon: "price-tag-3-line", options: categories.options },
    {
      key: "state",
      label: "Status",
      icon: "toggle-line",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Deactivated" },
      ],
    },
  ]
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return vendors.filter((v) => {
      if (filters.category.length && !filters.category.includes(v.category)) return false
      if (filters.state.length && !filters.state.includes(v.isActive ? "active" : "inactive")) return false
      return !term || [v.name, v.code, v.ntn, v.phone, v.cnic].some((x) => x?.toLowerCase().includes(term))
    })
  }, [vendors, q, filters])
  const paid = vendors.reduce((s, v) => s + v.paid, 0)
  const withheld = vendors.reduce((s, v) => s + v.withheld, 0)

  const toggle = async (v) => {
    if (v.isActive) {
      const ok = await confirm({
        title: `Deactivate ${v.name}?`,
        description: "They stop showing when entering payments. Their past payments stay in the books, and you can reactivate them any time.",
        confirmLabel: "Deactivate",
        destructive: true,
        icon: "forbid-line",
      })
      if (!ok) return
    }
    startTransition(async () => {
      const r = await toastAction(() => setVendorActive(v.code, !v.isActive), { loading: "Saving…", success: v.isActive ? `${v.name} deactivated.` : `${v.name} reactivated.` })
      if (r?.ok) router.refresh()
    })
  }

  const columns = [
    {
      key: "name",
      header: "Vendor",
      sortValue: (v) => v.name.toLowerCase(),
      cell: (v) => (
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{v.name}</span>
            {!v.isActive && <Badge color="gray">Deactivated</Badge>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{[v.code, v.phone].filter(Boolean).join(" · ")}</span>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortValue: (v) => categories.label(v.category) ?? "",
      cell: (v) =>
        v.category ? (
          <span className="inline-flex items-center gap-1.5">
            <Icon name={categories.map[v.category]?.icon ?? "price-tag-3-line"} className="text-muted-foreground" />
            {categories.label(v.category)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "account",
      header: "Charged to",
      sortValue: (v) => v.account?.code ?? "",
      cell: (v) => <span className="block max-w-48 truncate text-muted-foreground">{v.account ? `${v.account.code} · ${v.account.name}` : "—"}</span>,
    },
    { key: "wht", header: "WHT", className: "text-right tabular-nums", sortValue: (v) => v.whtPct, cell: (v) => (v.whtPct ? `${v.whtPct}%` : "—") },
    { key: "ntn", header: "NTN", sortValue: (v) => v.ntn, cell: (v) => <span className="tabular-nums">{v.ntn || <span className="text-muted-foreground">—</span>}</span> },
    {
      key: "paid",
      header: `Paid in ${fy}`,
      className: "text-right whitespace-nowrap tabular-nums",
      sortValue: (v) => v.paid,
      cell: (v) =>
        v.paid ? (
          <span>
            {rs(v.paid)}
            <span className="block text-xs text-muted-foreground">
              {v.payments} {v.payments === 1 ? "payment" : "payments"}
              {v.lastPaid && ` · last ${formatDate(v.lastPaid)}`}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "withheld",
      header: "Tax withheld",
      className: "text-right whitespace-nowrap tabular-nums",
      sortValue: (v) => v.withheld,
      cell: (v) => (v.withheld ? rs(v.withheld) : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      cell: (v) =>
        can.edit && (
          <span className="flex justify-end">
            <DropdownMenu
              align="end"
              items={[
                { label: "Edit", icon: "edit-line", onClick: () => setEditing(v) },
                { type: "separator" },
                v.isActive ? { label: "Deactivate", icon: "forbid-line", variant: "destructive", onClick: () => toggle(v) } : { label: "Reactivate", icon: "play-circle-line", onClick: () => toggle(v) },
              ]}
              trigger={<IconButton icon="more-2-line" aria-label="Actions" tooltip={false} />}
            />
          </span>
        ),
    },
  ]

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <>
            <div className="min-w-32 flex-1 sm:max-w-72">
              <Input type="search" aria-label="Search vendors" placeholder="Name, NTN or phone…" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
            </div>
            <FilterMenu groups={groups} value={filters} onChange={setFilters} />
          </>
        }
        actions={
          can.create && (
            <Button leftIcon="add-line" onClick={() => setEditing("new")}>
              New vendor
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile icon="store-2-line" label="Active vendors" value={vendors.filter((v) => v.isActive).length} hint={`${vendors.length} in all`} />
        <StatTile icon="hand-coin-line" tone="sky" label={`Paid in ${fy}`} value={formatPkr(paid)} hint="Gross, before tax withheld" />
        <StatTile icon="government-line" tone="amber" label="Income tax withheld" value={formatPkr(withheld)} hint={`${fy}, owed to FBR`} className="max-lg:col-span-2" />
      </div>
      <ActiveFilters groups={groups} value={filters} onChange={setFilters} />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(v) => v.code}
          minWidth="62rem"
          onRowClick={can.edit ? (v) => setEditing(v) : undefined}
          defaultSort={{ key: "paid", dir: "desc" }}
          empty={<p className="text-sm text-muted-foreground">{vendors.length ? "No vendor matches." : "No vendors yet."}</p>}
        />
      </div>
      {editing && (
        <VendorDialog
          vendor={editing === "new" ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

const blank = { name: "", category: "", accountId: null, whtPct: 0, ntn: "", cnic: "", phone: "", email: "", address: "", bankName: "", accountTitle: "", accountNumber: "", notes: "" }
const formatCnic = (v) => {
  const d = String(v).replace(/\D/g, "").slice(0, 13)
  return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join("-")
}

function VendorDialog({ vendor, accounts, onClose, onSaved }) {
  const categories = useList("vendor-category")
  const initial = useMemo(() => (vendor ? Object.fromEntries(Object.keys(blank).map((k) => [k, vendor[k] ?? blank[k]])) : { ...blank, category: categories.defaultValue ?? "" }), [vendor, categories.defaultValue])
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)
  const save = () =>
    startTransition(async () => {
      setErrors({})
      const r = await toastAction(() => saveVendor(vendor?.code ?? null, f), { loading: "Saving…", success: (x) => (vendor ? `${f.name} saved.` : `${f.name} added (${x.code}).`) })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onSaved()
    })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      scrollable
      className="sm:max-w-xl"
      title={vendor ? `Edit ${vendor.name}` : "New vendor"}
      description="Contractors, suppliers and anyone else you pay. The account and tax rate fill in on each payment to them."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} disabled={!f.name.trim() || (vendor && !dirty)} onClick={save}>
            {vendor ? "Save changes" : "Add vendor"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Name" required value={f.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} />
          </div>
          <Select label="Category" placeholder="Pick" value={f.category} onChange={(v) => set({ category: v ?? "" })} options={categories.options} error={errors.category} />
          <Combobox
            label="Usually charged to"
            placeholder="Expense account…"
            options={accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, description: a.type === "asset" ? "Asset" : undefined }))}
            value={f.accountId}
            onChange={(v) => set({ accountId: v ?? null })}
            error={errors.accountId}
          />
          <div className="sm:col-span-2">
            <NumberInput label="Income tax to withhold" suffix="%" min={0} max={50} step={0.5} value={f.whtPct} onChange={(v) => set({ whtPct: v ?? 0 })} error={errors.whtPct} />
            <p className="mt-1 text-xs text-muted-foreground">Filled in on each payment to this vendor. Confirm the rate for this kind of payment with your tax adviser.</p>
          </div>
          <Input label="NTN" value={f.ntn} onChange={(e) => set({ ntn: e.target.value })} error={errors.ntn} />
          <Input label="CNIC" inputMode="numeric" placeholder="35202-1234567-1" value={f.cnic} onChange={(e) => set({ cnic: formatCnic(e.target.value) })} error={errors.cnic} />
          <Input label="Phone" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} />
          <Input label="Email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} error={errors.email} />
          <div className="sm:col-span-2">
            <Input label="Address" value={f.address} onChange={(e) => set({ address: e.target.value })} error={errors.address} />
          </div>
        </div>
        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-semibold">Bank details (optional)</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Bank" placeholder="e.g. Meezan Bank" value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} error={errors.bankName} />
            <Input label="Account title" value={f.accountTitle} onChange={(e) => set({ accountTitle: e.target.value })} error={errors.accountTitle} />
            <Input label="Account no. / IBAN" value={f.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} error={errors.accountNumber} />
          </div>
        </fieldset>
        <Textarea label="Notes" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} error={errors.notes} />
      </div>
    </Dialog>
  )
}
