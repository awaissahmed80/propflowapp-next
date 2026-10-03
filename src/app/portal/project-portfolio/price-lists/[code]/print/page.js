import { estatePage } from "@/modules/portfolio/server/context"
import { getPriceList } from "@/modules/portfolio/server/price-list-queries"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { PriceListDocument, PriceListNotFound } from "@/modules/portfolio/components/price-list-document"

export const metadata = { title: "Print price list" }

// The price list as it prints (A4, workspace letterhead); opens the print dialog on load
export default async function PriceListPrintPage({ params }) {
  const { code } = await params
  const ctx = await estatePage(`/project-portfolio/price-lists/${code}/print`, "price-lists")
  const list = await getPriceList(ctx, code)
  if (!list) return <PriceListNotFound />
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <PriceListDocument list={list} brand={await getWorkspaceBrand(ctx.tenant)} />
      <PrintOnLoad />
    </div>
  )
}
