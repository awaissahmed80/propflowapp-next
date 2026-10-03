"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatPkr } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { urlCode } from "@/lib/url"
import { confirm } from "@/components/alert-context"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { setAccountActive, setDefaultAccount } from "../server/account-actions"
import { AccountDialog } from "./account-dialog"

// Account number with only the last four digits showing
const masked = (no) => (no ? `•••• ${String(no).replace(/\s/g, "").slice(-4)}` : "")

function AccountCard({ a, canEdit, onEdit, onChanged }) {
  const href = `/finance/accounts/${urlCode(a.code)}`
  const makeDefault = async () => {
    const r = await toastAction(() => setDefaultAccount(a.code), { loading: "Saving…", success: `${a.name} is now the default account.` })
    if (r?.ok) onChanged()
  }
  const toggle = async () => {
    if (a.isActive && !(await confirm({ title: `Switch off ${a.name}?`, description: "It's hidden from the voucher and payment forms. You can switch it back on any time.", confirmLabel: "Switch off" }))) return
    const r = await toastAction(() => setAccountActive(a.code, !a.isActive), { loading: "Saving…", success: a.isActive ? "Account switched off." : "Account switched on." })
    if (r?.ok) onChanged()
  }
  const icon = a.kind === "bank" ? "bank-line" : a.kind === "cash" ? "wallet-3-line" : "bank-card-2-line"
  const sub = a.kind === "bank" ? [a.branch || a.bankName, masked(a.accountNumber)].filter(Boolean).join(" · ") : a.kind === "cash" ? a.description || "Cash" : "Cheques and pay orders deposited, not yet cleared"
  return (
    <div className={cn("group relative rounded-xl border bg-background p-5 shadow-xs transition-colors hover:border-primary/40", !a.isActive && "opacity-60")}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
          <Icon name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <Link href={href} className="block truncate font-medium after:absolute after:inset-0 group-hover:text-primary">
            {a.name}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        {a.isDefault && <Badge color="blue">Default</Badge>}
        {!a.isActive && <Badge color="gray">Off</Badge>}
        {canEdit && a.kind && (
          <DropdownMenu
            align="end"
            trigger={<IconButton icon="more-2-line" aria-label={`Actions for ${a.name}`} size="sm" className="relative z-10 -mt-1 -mr-2" />}
            items={[
              { label: "Edit", icon: "edit-line", onClick: () => onEdit(a) },
              ...(a.isActive && !a.isDefault ? [{ label: "Make default", icon: "star-line", onClick: makeDefault }] : []),
              ...(!a.isSystem && !a.isDefault && (!a.hasPostings || !a.isActive)
                ? [{ type: "separator" }, { label: a.isActive ? "Switch off" : "Switch on", icon: a.isActive ? "eye-off-line" : "eye-line", onClick: toggle }]
                : []),
            ]}
          />
        )}
      </div>
      <p className={cn("mt-5 text-2xl font-semibold tracking-tight tabular-nums", a.balance < 0 && "text-red-600 dark:text-red-400")}>{formatPkr(a.balance)}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <span className="font-mono">{a.code}</span> · Statement <Icon name="arrow-right-s-line" />
      </p>
    </div>
  )
}

// Finance › Bank & cash. accounts: cash and bank accounts with balances (moneyAccounts());
// clearing: Cheques in clearing · headings: for the account dialog
export function BanksView({ accounts, clearing, headings, title, description, canEdit = false }) {
  const router = useRouter()
  const [editing, setEditing] = useState(null) // { account } | { preset }
  const active = accounts.filter((a) => a.isActive)
  const total = active.reduce((s, a) => s + a.balance, 0)
  const banks = accounts.filter((a) => a.kind === "bank").length

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        info={`${formatPkr(total)} across ${active.length} ${active.length === 1 ? "account" : "accounts"}`}
        actions={
          canEdit && (
            <DropdownMenu
              align="end"
              items={[
                { label: "Bank account", icon: "bank-line", onClick: () => setEditing({ preset: { kind: "bank" } }) },
                { label: "Cash account", icon: "wallet-3-line", onClick: () => setEditing({ preset: { kind: "cash" } }) },
              ]}
              trigger={<Button leftIcon="add-line">Add account</Button>}
            />
          )
        }
      />
      {!banks && (
        <p className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
          <Icon name="information-line" /> No bank account yet. Add the ones buyers pay into, so receipts and payment requests show the right details.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <AccountCard key={a.code} a={a} canEdit={canEdit} onEdit={(account) => setEditing({ account })} onChanged={() => router.refresh()} />
        ))}
        {clearing && <AccountCard a={clearing} canEdit={false} />}
      </div>
      {editing && (
        <AccountDialog
          account={editing.account ?? null}
          preset={editing.preset ?? null}
          headings={headings}
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
