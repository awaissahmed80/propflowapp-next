"use client"

import { useState, useTransition } from "react"
import { toastAction } from "@/lib/toast-action"
import { useUnsavedGuard } from "@/lib/use-unsaved-guard"
import { confirm } from "@/components/alert-context"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { ACCOUNT_TYPES } from "../constants"
import { saveAccount } from "../server/account-actions"

const CASH_BANK = "1100"
const BALANCE_SHEET = ["asset", "liability", "equity"]
const pkDay = (d) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(d)) : "")

function initialForm(account, preset, headings) {
  return {
    parentCode: account?.parentCode ?? preset?.parentCode ?? (preset?.kind ? CASH_BANK : (headings.find((h) => h.code !== CASH_BANK && h.parentCode)?.code ?? headings[0]?.code ?? "")),
    kind: account ? (account.kind ?? "") : (preset?.kind ?? (preset?.parentCode === CASH_BANK ? "bank" : "")),
    name: account?.name ?? "",
    description: account?.description ?? "",
    bankName: account?.bankName ?? "",
    accountTitle: account?.accountTitle ?? "",
    accountNumber: account?.accountNumber ?? "",
    iban: account?.iban ?? "",
    branch: account?.branch ?? "",
    openingBalance: account?.openingBalance ?? 0,
    openingDate: pkDay(account?.openingDate),
    isDefault: Boolean(account?.isDefault),
  }
}

// Add or change an account (finance.edit). New ones go under a heading and take its type; cash
// and bank accounts go under Cash & bank. System accounts can only be renamed.
//   account: a listAccounts() row, or null for a new one
//   headings: [{ code, name, type, parentCode }] · preset: { parentCode?, kind?: cash | bank }
//   onSaved({ code })
export function AccountDialog({ account = null, headings, preset = null, onClose, onSaved }) {
  const [initial] = useState(() => initialForm(account, preset, headings))
  const [f, setF] = useState(initial)
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(f) !== JSON.stringify(initial)
  useUnsavedGuard(dirty)

  const set = (patch) => {
    setF((x) => ({ ...x, ...patch }))
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      return next
    })
  }
  const heading = headings.find((h) => h.code === f.parentCode)
  const type = account?.type ?? heading?.type
  const underCashBank = f.parentCode === CASH_BANK
  const kind = account ? account.kind : underCashBank ? f.kind || "bank" : ""
  const isHeader = Boolean(account?.isHeader)
  const showOpening = !isHeader && BALANCE_SHEET.includes(type)

  const close = async () => {
    if (pending) return
    if (dirty && !(await confirm({ title: "Discard your changes?", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }))) return
    onClose()
  }
  const submit = () =>
    startTransition(async () => {
      const input = { ...f, kind: account ? "" : kind, openingBalance: Number(f.openingBalance) || 0, openingDate: f.openingDate || null }
      const r = await toastAction(() => saveAccount(account?.code ?? null, input), { loading: "Saving…", success: (x) => (account ? "Account saved." : `Account ${x.code} added.`) })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onSaved?.(r)
    })

  const title = account ? `Edit ${account.code} · ${account.name}` : kind === "bank" ? "New bank account" : kind === "cash" ? "New cash account" : "New account"
  const description = account?.isSystem
    ? "The apps post to this account. You can rename it; its code and heading stay."
    : account
      ? `${ACCOUNT_TYPES[account.type]?.label} account under ${headings.find((h) => h.code === account.parentCode)?.name ?? "the chart"}.`
      : "It takes the next free code under its heading, and the heading's type."

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      scrollable
      className="sm:max-w-lg"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button leftIcon="check-line" loading={pending} onClick={submit}>
            {account ? "Save" : "Add account"}
          </Button>
        </>
      }
    >
      {!account && !preset?.kind && (
        <Select
          label="Under"
          required
          value={f.parentCode}
          onChange={(v) => set({ parentCode: v, kind: v === CASH_BANK ? f.kind || "bank" : "" })}
          options={headings.map((h) => ({ value: h.code, label: `${h.code} · ${h.name}` }))}
          error={errors.parentCode}
        />
      )}
      {!account && underCashBank && !preset?.kind && (
        <ToggleGroup
          aria-label="Kind of account"
          value={kind}
          onChange={(v) => v && set({ kind: v })}
          options={[
            { value: "bank", label: "Bank account" },
            { value: "cash", label: "Cash account" },
          ]}
        />
      )}
      {kind === "bank" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Bank" required placeholder="e.g. Meezan Bank" value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} error={errors.bankName} />
          <Input label="Branch" placeholder="e.g. DHA Phase 5, Lahore" value={f.branch} onChange={(e) => set({ branch: e.target.value })} error={errors.branch} />
          <div className="sm:col-span-2">
            <Input label="Account title" required value={f.accountTitle} onChange={(e) => set({ accountTitle: e.target.value })} error={errors.accountTitle} />
          </div>
          <Input label="Account no." required value={f.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} error={errors.accountNumber} />
          <Input label="IBAN" placeholder="PK36MEZN0001234567890123" value={f.iban} onChange={(e) => set({ iban: e.target.value })} error={errors.iban} />
        </div>
      )}
      <Input
        label={kind === "bank" ? "Name in the books" : "Name"}
        required={kind !== "bank"}
        placeholder={kind === "bank" ? `${f.bankName || "Bank"} · Collections` : kind === "cash" ? "e.g. Site office cash" : undefined}
        value={f.name}
        onChange={(e) => set({ name: e.target.value })}
        error={errors.name}
      />
      <Input label="Description" value={f.description} onChange={(e) => set({ description: e.target.value })} error={errors.description} />
      {showOpening && (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberInput label="Opening balance" prefix="Rs" step={1000} format={{ maximumFractionDigits: 2 }} value={f.openingBalance} onChange={(v) => set({ openingBalance: v ?? 0 })} error={errors.openingBalance} />
          <DatePicker label="As of" value={f.openingDate} onChange={(v) => set({ openingDate: v || "" })} error={errors.openingDate} placeholder="When you started" />
          <p className="text-xs text-muted-foreground sm:col-span-2">
            What it stood at when you started using PropFlow, as a {ACCOUNT_TYPES[type]?.normal} balance{kind === "bank" ? " (the bank statement's balance that day)" : ""}.
          </p>
        </div>
      )}
      {kind && <Switch checked={f.isDefault} onChange={(v) => set({ isDefault: v })} label="Default account" description="Pre-selected wherever money is received or paid. People can still pick another." />}
    </Dialog>
  )
}
