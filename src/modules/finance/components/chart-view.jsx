"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { ScrollView } from "@/components/ui/scroll-view"
import { Switch } from "@/components/ui/switch"
import { ACCOUNT_TYPES, figure } from "../constants"
import { setAccountActive } from "../server/account-actions"
import { AccountDialog } from "./account-dialog"

const TOTAL_LABELS = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" }

// Finance › Chart of accounts: the tree with balances; headings total what's under them.
//   rows: chartOfAccounts().rows (display order, with depth) · totals: { asset, liability, … }
export function ChartView({ rows, totals, title, description, canEdit = false }) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [showOff, setShowOff] = useState(false)
  const [editing, setEditing] = useState(null) // { account } | { preset } | {}
  const headings = useMemo(() => rows.filter((a) => a.isHeader).map((a) => ({ code: a.code, name: a.name, type: a.type, parentCode: a.parentCode })), [rows])
  const off = rows.filter((a) => !a.isActive).length

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const visible = rows.filter((a) => showOff || a.isActive)
    if (!term) return visible
    // Matching accounts and the headings above them
    const byCode = new Map(rows.map((a) => [a.code, a]))
    const keep = new Set()
    for (const a of visible)
      if (`${a.code} ${a.name}`.toLowerCase().includes(term)) {
        keep.add(a.code)
        for (let p = byCode.get(a.parentCode); p; p = byCode.get(p.parentCode)) keep.add(p.code)
      }
    return visible.filter((a) => keep.has(a.code))
  }, [rows, q, showOff])

  const toggle = async (a) => {
    if (a.isActive && !(await confirm({ title: `Switch off ${a.code} · ${a.name}?`, description: "It's hidden from the voucher forms. You can switch it back on any time.", confirmLabel: "Switch off" }))) return
    const r = await toastAction(() => setAccountActive(a.code, !a.isActive), { loading: "Saving…", success: a.isActive ? "Account switched off." : "Account switched on." })
    if (r?.ok) router.refresh()
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <div className="min-w-32 flex-1 sm:max-w-72">
            <Input type="search" placeholder="Code or name…" aria-label="Search accounts" value={q} onChange={(e) => setQ(e.target.value)} startElement={<Icon name="search-line" />} />
          </div>
        }
        info={off > 0 && <Switch checked={showOff} onChange={setShowOff} label={`Show switched-off (${off})`} />}
        actions={
          canEdit && (
            <Button leftIcon="add-line" onClick={() => setEditing({})}>
              New account
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(ACCOUNT_TYPES).map(([key, t]) => (
          <div key={key} className="rounded-lg border bg-background px-3 py-2 shadow-xs">
            <p className="text-xs text-muted-foreground">{TOTAL_LABELS[key] ?? t.label}</p>
            <p className="text-sm font-semibold tabular-nums">{formatPkr(totals[key] ?? 0)}</p>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background shadow-xs">
        <ScrollView orientation="both" className="h-full">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Account</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((a) => (
                <tr key={a.code} className={cn(a.isHeader && (a.depth === 0 ? "bg-muted/70 font-semibold" : "bg-muted/40 font-medium"), !a.isActive && "text-muted-foreground")}>
                  <td className="px-4 py-2" style={{ paddingLeft: `${1 + a.depth * 1.25}rem` }}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                      {a.isHeader ? (
                        a.name
                      ) : (
                        <Link href={`/finance/accounts/${urlCode(a.code)}`} className="hover:text-primary hover:underline">
                          {a.name}
                        </Link>
                      )}
                      {a.kind === "bank" && <Icon name="bank-line" className="text-muted-foreground" aria-label="Bank account" />}
                      {a.kind === "cash" && <Icon name="wallet-3-line" className="text-muted-foreground" aria-label="Cash account" />}
                      {a.isDefault && <Badge color="blue">Default</Badge>}
                      {a.isSystem && (
                        <Badge color="gray" title="The apps post to this account">
                          System
                        </Badge>
                      )}
                      {!a.isActive && <Badge color="gray">Off</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{a.depth === 0 ? ACCOUNT_TYPES[a.type]?.label : ""}</td>
                  <td className={cn("px-4 py-2 text-right tabular-nums", a.balance < 0 && "text-red-600 dark:text-red-400")}>{figure(a.balance) || (a.isHeader ? "–" : "")}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {canEdit && (
                      <span className="inline-flex items-center gap-0.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ account: a })}>
                          Edit
                        </Button>
                        <DropdownMenu
                          align="end"
                          trigger={<IconButton icon="more-2-line" size="sm" aria-label={`More for ${a.code}`} />}
                          items={[
                            ...(a.isHeader ? [{ label: "Add an account here", icon: "add-line", onClick: () => setEditing({ preset: { parentCode: a.code } }) }] : []),
                            ...(!a.isHeader
                              ? [
                                  {
                                    label: a.isActive ? "Switch off" : "Switch on",
                                    icon: a.isActive ? "eye-off-line" : "eye-line",
                                    disabled: a.isActive && (a.isSystem || a.hasPostings || a.isDefault),
                                    onClick: () => toggle(a),
                                  },
                                ]
                              : []),
                            ...(!a.isHeader && a.isActive && (a.isSystem || a.hasPostings || a.isDefault)
                              ? [{ type: "label", label: a.isSystem ? "The apps post here, so it stays on" : a.isDefault ? "The default account stays on" : "Has postings, so it stays on" }]
                              : []),
                          ]}
                        />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No accounts match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollView>
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
