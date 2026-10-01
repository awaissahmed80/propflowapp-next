import { deskContext } from "@/modules/desk/server/context"
import { myTasks } from "@/modules/desk/server/tasks"
import { getPortal } from "@/modules/portal/server/context"
import { TodayView } from "@/modules/desk/components/today-view"

export const metadata = { title: "Today" }

// Greeting and date in Pakistan time
function pakistanNow() {
  const now = new Date()
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hourCycle: "h23" }).format(now))
  return {
    greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    today: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long" }).format(now),
  }
}

export default async function TodayPage() {
  const [ctx, portal] = await Promise.all([deskContext("/desk"), getPortal()])
  const tasks = await myTasks(ctx)
  const { greeting, today } = pakistanNow()
  return (
    <TodayView
      firstName={ctx.user.name.split(" ")[0]}
      greeting={greeting}
      today={today}
      me={ctx.me}
      teams={ctx.teams.map((t) => ({ name: t.name, color: t.color, people: t.members.length, lead: t.lead?.name ?? null }))}
      apps={portal.apps}
      tasks={tasks}
    />
  )
}
