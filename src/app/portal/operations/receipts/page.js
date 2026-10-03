import { live } from "@/server/db/records"
import { salesPage } from "@/modules/operations/server/context"
import { listReceipts } from "@/modules/operations/server/queries"
import { ReceiptsView } from "@/modules/operations/components/collections-views"

export const metadata = { title: "Receipts" }

export default async function SalesReceiptsPage() {
  const ctx = await salesPage("/operations/receipts")
  const [receipts, projects] = await Promise.all([listReceipts(ctx), live(ctx.db, "projects").orderBy("name").select("code", "name")])
  return <ReceiptsView receipts={receipts} projects={projects} can={{ cheques: ctx.can("edit"), chequesDirect: Boolean(ctx.grant("operations.cheques") || ctx.grant("finance.cheques")) }} />
}
