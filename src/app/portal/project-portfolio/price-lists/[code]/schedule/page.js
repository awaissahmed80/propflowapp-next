import { estatePage } from "@/modules/portfolio/server/context"
import { getPriceList, scheduleInput } from "@/modules/portfolio/server/price-list-queries"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { PriceListNotFound, ScheduleDocument } from "@/modules/portfolio/components/price-list-document"

export const metadata = { title: "Payment schedule" }

// A payment schedule from the calculator, as it prints:
//   ?type=plot&category=residential&size=5-marla (or ?unit=ske-0001)&features=corner&floor=3&plan=p2&start=2026-10-01
export default async function SchedulePrintPage({ params, searchParams }) {
  const [{ code }, q] = await Promise.all([params, searchParams])
  const ctx = await estatePage(`/project-portfolio/price-lists/${code}/schedule`, "price-lists")
  const list = await getPriceList(ctx, code)
  if (!list) return <PriceListNotFound />
  const { unit, input, planKey, start } = scheduleInput(list, q)
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <ScheduleDocument list={list} unit={unit} input={input} planKey={planKey} start={start} brand={await getWorkspaceBrand(ctx.tenant)} preparedBy={ctx.user.name} />
      <PrintOnLoad />
    </div>
  )
}
