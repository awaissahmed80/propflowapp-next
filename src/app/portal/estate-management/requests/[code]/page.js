import { notFound } from "next/navigation"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { live } from "@/server/db/records"
import { can } from "@/modules/users/permissions"
import { servicesPage } from "@/modules/estate/server/context"
import { getRequest, serviceStaff } from "@/modules/estate/server/queries"
import { requestPaper } from "@/modules/estate/server/papers"
import { RequestDetail } from "@/modules/estate/components/request-detail"

export async function generateMetadata({ params }) {
  return { title: String((await params).code).toUpperCase() }
}

// /services/requests/sr-2026-00001
export default async function ServiceRequestPage({ params }) {
  const { code } = await params
  const ctx = await servicesPage(`/estate-management/requests/${code}`)
  const request = await getRequest(ctx, code)
  if (!request) notFound()
  const assign = Boolean(ctx.grant("estate.assign"))
  const feeOpen = request.fee?.amount > 0 && !request.fee.paidAt && !request.fee.waived && ctx.can("edit")
  const [staff, brand, paper, approval, accounts] = await Promise.all([
    assign ? serviceStaff(ctx) : [],
    getWorkspaceBrand(ctx.tenant),
    requestPaper(ctx, request),
    // A transfer waiting in the approvals inbox
    request.type === "transfer" && !request.closed
      ? ctx
          .db("approvals as a")
          .join("serviceRequests as r", "r.id", "a.subjectId")
          .where({ "a.subjectType": "service-request", "a.status": "pending", "r.code": request.code })
          .whereNull("a.deletedAt")
          .first("a.code", "a.createdAt")
      : null,
    // Cash and bank accounts the fee can go into (the default preselected)
    feeOpen ? live(ctx.db, "accounts").whereIn("kind", ["cash", "bank"]).where({ isActive: true }).orderBy("sortOrder").orderBy("code").select("id", "name", "kind", "bankName", "isDefault") : [],
  ])
  const edit = ctx.can("edit")
  const allowed = {
    edit,
    create: ctx.can("create"),
    assign: edit && assign,
    ndc: edit && Boolean(ctx.grant("estate.ndc")),
    transfer: edit && Boolean(ctx.grant("estate.transfer")),
    possession: edit && Boolean(ctx.grant("estate.possession")),
    waive: edit && Boolean(ctx.grant("estate.waive")),
    operations: can(ctx.permissions, "operations", "view"),
  }
  return <RequestDetail request={request} staff={staff} can={allowed} brand={brand} paper={paper} approval={approval ?? null} accounts={accounts} />
}
