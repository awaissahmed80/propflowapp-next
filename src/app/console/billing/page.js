import { connection } from "next/server"
import { requireArea } from "@/modules/console/server/access"
import { getSetting, listInvoices } from "@/modules/console/server/queries"
import { platformDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { can } from "@/modules/console/roles"
import { BillingView } from "@/modules/console/components/billing-view"

export const metadata = { title: "Billing" }

export default async function BillingPage() {
  const staff = await requireArea("billing", "/billing")
  await connection()
  const manage = can(staff.role, "billing")
  const [invoices, workspaces, taxRate] = await Promise.all([
    listInvoices(),
    manage ? live(platformDb(), "tenants").whereNot({ status: "provisioning" }).orderBy("name").select("id", "code", "name") : [],
    getSetting("sales_tax_rate", 0),
  ])
  return (
    <BillingView
      invoices={invoices}
      // eslint-disable-next-line react-hooks/purity -- request-time page, "now" is fixed per request
      now={Date.now()}
      newInvoice={manage ? { workspaces, taxRate: Number(taxRate) } : null}
    />
  )
}
