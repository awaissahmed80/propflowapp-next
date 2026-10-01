import { NextResponse } from "next/server"
import { getSession, getStaffRole } from "@/server/auth/dal"
import { platformDb } from "@/server/db/connections"
import { readFile } from "@/server/storage"
import { canView } from "@/modules/console/roles"
import { fromUrlCode } from "@/lib/url"

// GET /api/console/invoices/INV-2026-00001/payments/PAY-2026-00001/proof → the payment's proof file, shown in
// the browser, for console staff who can see billing. ?download=1 saves it instead.
export async function GET(request, { params }) {
  const session = await getSession()
  const role = session?.kind === "console" ? await getStaffRole(session.user.id) : null
  if (!role || !canView(role, "billing")) return new NextResponse("Not allowed", { status: 403 })

  const p = await params
  const code = fromUrlCode(p.code)
  const paymentCode = fromUrlCode(p.paymentCode)
  const payment = await platformDb()("invoicePayments as p")
    .join("invoices as i", "i.id", "p.invoiceId")
    .where({ "i.code": code, "p.code": paymentCode })
    .whereNull("p.deletedAt")
    .first("p.proofKey", "p.proofName", "p.proofType")
  if (!payment?.proofKey) return new NextResponse("No proof on file", { status: 404 })

  let file
  try {
    file = await readFile(payment.proofKey)
  } catch {
    return new NextResponse("The proof file is missing from storage", { status: 404 })
  }
  const name = (payment.proofName || "proof").replace(/[^\w.\- ]+/g, "_")
  const download = request.nextUrl.searchParams.get("download") === "1"
  return new NextResponse(file, {
    headers: {
      "Content-Type": payment.proofType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  })
}
