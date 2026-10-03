import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { servicesPage } from "@/modules/estate/server/context"
import { getRequest } from "@/modules/estate/server/queries"
import { requestPaper } from "@/modules/estate/server/papers"
import { ServicesPrint } from "@/modules/estate/components/services-print"

export const metadata = { title: "Print" }

// /services/requests/sr-2026-00001/print/ndc | transfer | possession (opens the print dialog on load)
export default async function ServiceRequestPrintPage({ params }) {
  const { code, doc } = await params
  const ctx = await servicesPage(`/estate-management/requests/${code}`)
  const request = await getRequest(ctx, code)
  const paper = request ? await requestPaper(ctx, request, doc) : null
  if (!paper) notFound()
  return <ServicesPrint request={request} paper={paper} brand={await getWorkspaceBrand(ctx.tenant)} />
}
