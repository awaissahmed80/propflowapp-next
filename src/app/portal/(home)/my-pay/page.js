import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { hrContext } from "@/modules/hr/server/context"
import { myPay } from "@/modules/hr/server/self-queries"
import { MyPayView } from "@/modules/hr/components/my-pay-view"
import { DeskPage } from "@/modules/desk/components/desk-page"

export const metadata = { title: "My pay" }

// My Desk › My pay, for people on the payroll: salary, advances and loans, payslips
export default async function MyPayPage() {
  const ctx = await hrContext("/my-pay")
  if (!ctx.me || !ctx.has("payroll")) notFound()
  const [data, brand] = await Promise.all([myPay(ctx), getWorkspaceBrand(ctx.tenant)])
  return (
    <DeskPage>
      <MyPayView data={data} brand={brand} />
    </DeskPage>
  )
}
