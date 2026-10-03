import { getWorkspaceBrand } from "@/server/tenants/brand"
import { live } from "@/server/db/records"
import { financePage } from "@/modules/finance/server/context"
import { financeNavItem, getVoucher, listVouchers, voucherFormData } from "@/modules/finance/server/queries"
import { VouchersView } from "@/modules/finance/components/vouchers-view"

export const metadata = { title: "Vouchers" }

// /finance/vouchers?period=this-fy&type=bpv&source=manual&status=pending&project=ske&q=…&open=bpv-2627-00001
export default async function VouchersPage({ searchParams }) {
  const sp = (await searchParams) ?? {}
  const ctx = await financePage("/finance/vouchers")
  const canCreate = ctx.can("create")
  const filters = { period: sp.period, type: sp.type, source: sp.source, status: sp.status, project: sp.project, q: sp.q }
  const [list, projects, form, brand, opened] = await Promise.all([
    listVouchers(ctx, filters),
    live(ctx.db, "projects").orderBy("name").select("code", "name"),
    canCreate ? voucherFormData(ctx) : null,
    getWorkspaceBrand(ctx.tenant),
    sp.open ? getVoucher(ctx, String(sp.open)) : null,
  ])
  const nav = financeNavItem("/finance/vouchers")
  return (
    <VouchersView
      vouchers={list.vouchers}
      truncated={list.truncated}
      filters={{ period: list.period, type: sp.type ?? "", source: sp.source ?? "", status: sp.status ?? "", project: sp.project ?? "", q: sp.q ?? "" }}
      projects={projects}
      form={form}
      brand={brand}
      opened={opened}
      title={nav.label}
      description={nav.description}
      can={{ create: canCreate, post: ctx.can("approve"), void: ctx.can("edit") && Boolean(ctx.grant("finance.void")) }}
    />
  )
}
