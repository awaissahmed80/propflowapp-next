import { NextResponse } from "next/server"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { renderRosterPdf } from "@/server/documents/roster-pdf"
import { hrContext } from "@/modules/hr/server/context"
import { rosterWeek } from "@/modules/hr/server/roster-queries"
import { isDayKey, todayKey, weekStart } from "@/modules/hr/roster"

// GET /api/hrm/roster/pdf?week=2026-10-05 → that week's duty roster as a landscape PDF download
export async function GET(request) {
  const ctx = await hrContext("/hrm/roster")
  if (!ctx.can("view") || !ctx.has("attendance")) return new NextResponse("Not allowed", { status: 403 })
  const asked = new URL(request.url).searchParams.get("week")
  const week = await rosterWeek(ctx, weekStart(isDayKey(asked) ? asked : todayKey()))
  const pdf = await renderRosterPdf({ week, brand: await getWorkspaceBrand(ctx.tenant) })
  return new NextResponse(pdf, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Duty roster ${week.start}.pdf"`, "Cache-Control": "private, no-store" },
  })
}
