import { hrPage } from "@/modules/hr/server/context"
import { employeeOptions, leaveBalances, listLeave } from "@/modules/hr/server/employee-queries"
import { LeaveView } from "@/modules/hr/components/leave-view"

export const metadata = { title: "Leave" }

export default async function LeavePage() {
  const ctx = await hrPage("/hrm/leave", "leave")
  const canPickOthers = ctx.can("create")
  const [leave, options] = await Promise.all([listLeave(ctx), employeeOptions(ctx)])
  // Who leave can be applied for here: anyone they see (create), else just themselves
  const pickable = canPickOthers ? options : options.filter((e) => e.isMe)
  const balances = await leaveBalances(ctx, pickable)
  return <LeaveView leave={leave} employees={pickable.map(({ id, gross, ...e }) => e)} balances={balances} can={{ pickOthers: canPickOthers, approve: Boolean(ctx.grant("hr.approve-leave")) }} />
}
