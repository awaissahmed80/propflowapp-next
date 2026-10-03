import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { financePage } from "@/modules/finance/server/context"
import { getVoucher } from "@/modules/finance/server/queries"
import { VoucherPrint } from "@/modules/finance/components/finance-documents"

export const metadata = { title: "Print" }

// /finance/vouchers/bpv-2627-00001/print (opens the print dialog on load)
export default async function VoucherPrintPage({ params }) {
  const { code } = await params
  const ctx = await financePage(`/finance/vouchers/${code}/print`)
  const voucher = await getVoucher(ctx, decodeURIComponent(code))
  if (!voucher) notFound()
  return <VoucherPrint voucher={voucher} brand={await getWorkspaceBrand(ctx.tenant)} />
}
