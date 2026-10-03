import { NextResponse } from "next/server"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderStatementPdf } from "@/server/documents/finance-pdf"
import { financeContext } from "@/modules/finance/server/context"
import { accountStatement } from "@/modules/finance/server/queries"

// GET /api/finance/accounts/1110/pdf?period=this-fy → the account's statement as a PDF download
export async function GET(request, { params }) {
  const { code } = await params
  const ctx = await financeContext(`/finance/accounts/${code}`)
  if (!ctx.can("view")) return new NextResponse("Not allowed", { status: 403 })
  const s = await accountStatement(ctx, decodeURIComponent(code), request.nextUrl.searchParams.get("period") ?? "this-fy")
  if (!s) return new NextResponse("Account not found", { status: 404 })
  const pdf = await renderStatementPdf({ s, brand: await getWorkspaceBrand(ctx.tenant) })
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Statement ${s.account.code} ${s.period}.pdf"`, "Cache-Control": "private, no-store" },
  })
}
