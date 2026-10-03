import { estatePage } from "@/modules/portfolio/server/context"
import { getPriceList } from "@/modules/portfolio/server/price-list-queries"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { PriceListView } from "@/modules/portfolio/components/price-list-view"
import { PriceListNotFound } from "@/modules/portfolio/components/price-list-document"

export async function generateMetadata({ params }) {
  const { code } = await params
  const list = await getPriceList(await estatePage(`/project-portfolio/price-lists/${code}`, "price-lists"), code)
  return { title: list?.name ?? "Price list" }
}

// /estate/price-lists/pl-0001: rates, premiums & charges, payment plans and a calculator
export default async function PriceListPage({ params }) {
  const { code } = await params
  const ctx = await estatePage(`/project-portfolio/price-lists/${code}`, "price-lists")
  const list = await getPriceList(ctx, code)
  if (!list) return <PriceListNotFound />
  return <PriceListView key={`${list.code}-${list.status}`} list={list} brand={await getWorkspaceBrand(ctx.tenant)} canEdit={ctx.can("edit")} canApprove={ctx.can("approve")} />
}
