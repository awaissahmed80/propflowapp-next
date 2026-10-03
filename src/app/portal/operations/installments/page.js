import { live } from "@/server/db/records"
import { salesPage } from "@/modules/operations/server/context"
import { listDueLines } from "@/modules/operations/server/queries"
import { InstallmentsView } from "@/modules/operations/components/collections-views"

export const metadata = { title: "Installments" }

export default async function SalesInstallmentsPage() {
  const ctx = await salesPage("/operations/installments", "installments")
  const [lines, projects] = await Promise.all([listDueLines(ctx), live(ctx.db, "projects").orderBy("name").select("code", "name")])
  return <InstallmentsView lines={lines} projects={projects} canReceive={ctx.can("edit")} receiveDirect={Boolean(ctx.grant("operations.receipts"))} />
}
