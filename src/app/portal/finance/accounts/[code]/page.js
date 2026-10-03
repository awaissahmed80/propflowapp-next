import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { financePage } from "@/modules/finance/server/context"
import { accountStatement } from "@/modules/finance/server/queries"
import { StatementView } from "@/modules/finance/components/statement-view"

export async function generateMetadata({ params }) {
  return { title: `Account ${decodeURIComponent((await params).code)}` }
}

// /finance/accounts/1110?period=this-fy · one account's ledger with a running balance
export default async function AccountStatementPage({ params, searchParams }) {
  const [{ code }, sp] = await Promise.all([params, searchParams])
  const ctx = await financePage(`/finance/accounts/${code}`)
  const statement = await accountStatement(ctx, decodeURIComponent(code), sp?.period ?? "this-fy")
  if (!statement) notFound()
  const brand = await getWorkspaceBrand(ctx.tenant)
  return <StatementView statement={statement} brand={brand} canVoid={ctx.can("edit") && Boolean(ctx.grant("finance.void"))} />
}
