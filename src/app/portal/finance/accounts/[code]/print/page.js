import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { financePage } from "@/modules/finance/server/context"
import { accountStatement } from "@/modules/finance/server/queries"
import { StatementPrint } from "@/modules/finance/components/finance-documents"

export const metadata = { title: "Print" }

// /finance/accounts/1110/print?period=this-fy (opens the print dialog on load)
export default async function AccountStatementPrintPage({ params, searchParams }) {
  const [{ code }, sp] = await Promise.all([params, searchParams])
  const ctx = await financePage(`/finance/accounts/${code}`)
  const statement = await accountStatement(ctx, decodeURIComponent(code), sp?.period ?? "this-fy")
  if (!statement) notFound()
  return <StatementPrint statement={statement} brand={await getWorkspaceBrand(ctx.tenant)} />
}
