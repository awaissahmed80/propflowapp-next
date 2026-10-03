import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { financePage } from "@/modules/finance/server/context"
import { getPaymentRequest } from "@/modules/finance/server/money-queries"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { PaymentRequestDocument } from "@/modules/finance/components/payment-request-document"

export const metadata = { title: "Print" }

// /finance/payment-requests/inv-2627-00001/print (opens the print dialog on load)
export default async function PaymentRequestPrintPage({ params }) {
  const { code } = await params
  const ctx = await financePage("/finance/payment-requests", "collections")
  const request = await getPaymentRequest(ctx, code)
  if (!request) notFound()
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <PaymentRequestDocument request={request} brand={await getWorkspaceBrand(ctx.tenant)} />
      <PrintOnLoad />
    </div>
  )
}
