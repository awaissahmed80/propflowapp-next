import { crmPage } from "@/modules/crm/server/context"
import { leaderboard } from "@/modules/crm/server/reports"
import { LeaderboardView } from "@/modules/crm/components/leaderboard-view"

export const metadata = { title: "Leaderboard" }

const PERIODS = ["this-week", "this-month", "last-month", "this-quarter"]

// /crm/leaderboard?period=this-month: agents and teams ranked (counts only, the same for everyone)
export default async function CrmLeaderboardPage({ searchParams }) {
  const ctx = await crmPage("/crm/leaderboard")
  const asked = (await searchParams).period
  const period = PERIODS.includes(asked) ? asked : "this-month"
  return <LeaderboardView data={await leaderboard(ctx, period)} period={period} me={ctx.user.id} />
}
