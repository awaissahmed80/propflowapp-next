import { getWorkspaceBrand } from "@/server/tenants/brand"
import { hrPage } from "@/modules/hr/server/context"
import { rosterWeek } from "@/modules/hr/server/roster-queries"
import { isDayKey, todayKey, weekStart } from "@/modules/hr/roster"
import { RosterPrint } from "@/modules/hr/components/roster-document"

export const metadata = { title: "Print duty roster" }

// ?week=2026-10-05 (any day of the week; opens the print dialog on load, landscape)
export default async function RosterPrintPage({ searchParams }) {
  const ctx = await hrPage("/hrm/roster", "attendance")
  const asked = (await searchParams).week
  const week = await rosterWeek(ctx, weekStart(isDayKey(asked) ? asked : todayKey()))
  return <RosterPrint week={week} brand={await getWorkspaceBrand(ctx.tenant)} />
}
