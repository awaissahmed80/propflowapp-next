import { financePage } from "@/modules/finance/server/context"
import { financeNavItem, listAccounts, moneyAccounts } from "@/modules/finance/server/queries"
import { BanksView } from "@/modules/finance/components/banks-view"

export const metadata = { title: "Bank & cash" }

// Every cash and bank account with its balance, and cheques waiting to clear
export default async function BanksPage() {
  const ctx = await financePage("/finance/banks")
  const [money, all] = await Promise.all([moneyAccounts(ctx, { includeInactive: true }), listAccounts(ctx)])
  const headings = all.filter((a) => a.isHeader).map((a) => ({ code: a.code, name: a.name, type: a.type, parentCode: a.parentCode }))
  const nav = financeNavItem("/finance/banks")
  return <BanksView accounts={money.accounts} clearing={money.clearing} headings={headings} title={nav.label} description={nav.description} canEdit={ctx.can("edit")} />
}
