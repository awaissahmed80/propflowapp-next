"use client"

import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { useUnitText } from "@/modules/operations/components/sales-parts"
import { ServicePaper } from "./service-documents"

// A request's paper alone on the page, printing itself on load (the print preview's Print button)
export function ServicesPrint({ request, paper, brand }) {
  const unitText = useUnitText()
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      <ServicePaper r={request} paper={paper} brand={brand} unitText={unitText} />
      <PrintOnLoad />
    </div>
  )
}
