import { notFound } from "next/navigation"
import { getLookups } from "@/modules/lookups/server"
import { LookupsProvider } from "@/modules/lookups/context"
import { hrContext } from "@/modules/hr/server/context"
import { myDuties } from "@/modules/hr/server/roster-queries"
import { todayKey, weekStart } from "@/modules/hr/roster"
import { MyRosterView } from "@/modules/hr/components/my-roster-view"
import { DeskPage } from "@/modules/desk/components/desk-page"

export const metadata = { title: "My roster" }

// My Desk › My roster, for people on the payroll: my shifts this week and next
export default async function MyRosterPage() {
  const ctx = await hrContext("/my-roster")
  if (!ctx.me || !ctx.has("attendance")) notFound()
  const today = todayKey()
  const start = weekStart(today)
  const [duties, lists] = await Promise.all([myDuties(ctx, ctx.me.id, { from: start, days: 14 }), getLookups(ctx.db, ["post-kind"])])
  return (
    <DeskPage>
      <LookupsProvider lists={lists} app="hr">
        <MyRosterView duties={duties} start={start} today={today} roster={ctx.can("view") && Boolean(ctx.grant("hr.roster"))} />
      </LookupsProvider>
    </DeskPage>
  )
}
