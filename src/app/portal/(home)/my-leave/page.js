import { notFound } from "next/navigation"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { LookupsProvider } from "@/modules/lookups/context"
import { hrContext } from "@/modules/hr/server/context"
import { myLeave } from "@/modules/hr/server/self-queries"
import { MyLeaveView } from "@/modules/hr/components/my-leave-view"
import { DeskPage } from "@/modules/desk/components/desk-page"

export const metadata = { title: "My leave" }

// My Desk › My leave, for people on the payroll (an employee record linked to their login)
export default async function MyLeavePage() {
  const ctx = await hrContext("/my-leave")
  if (!ctx.me || !ctx.has("leave")) notFound()
  const [data, lists, waiting] = await Promise.all([
    myLeave(ctx),
    getLookups(ctx.db, ["leave-type"]),
    ctx.grant("hr.approve-leave") ? live(ctx.db, "approvals").where({ type: "leave", status: "pending" }).whereNot({ requestedBy: ctx.user.id }).count({ n: "id" }).first() : null,
  ])
  return (
    <DeskPage>
      <LookupsProvider lists={lists} app="hr">
        <MyLeaveView data={data} waiting={Number(waiting?.n ?? 0)} hr={ctx.can("view")} />
      </LookupsProvider>
    </DeskPage>
  )
}
