import { NextResponse } from "next/server"
import { fromUrlCode } from "@/lib/url"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { hrContext } from "@/modules/hr/server/context"
import { payslipsToPrint } from "@/modules/hr/server/payroll-queries"
import { renderPayslipsPdf } from "@/server/documents/payslip-pdf"

// GET /api/hr/payroll/pr-2026-10/pdf → every payslip in the run as one PDF (people who see pay)
//     ?employee=emp-00001 → one payslip (also someone's own, from a paid run, in My Pay)
export async function GET(request, { params }) {
  const { code } = await params
  const employee = request.nextUrl.searchParams.get("employee")
  const ctx = await hrContext(`/hrm/payroll/${code}`)
  const out = await payslipsToPrint(ctx, fromUrlCode(code), employee)
  if (!out) return new NextResponse("Payslip not found", { status: 404 })
  const pdf = await renderPayslipsPdf({ slips: out.slips, run: out.run, brand: await getWorkspaceBrand(ctx.tenant) })
  const name = out.slips.length === 1 ? `Payslip ${out.slips[0].employee.name} ${out.run.month}` : `Payslips ${out.run.month}`
  return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name.replace(/[\\/:*?"<>|]+/g, "-")}.pdf"`, "Cache-Control": "private, no-store" } })
}
