import { live } from "@/server/db/records"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { hrPage } from "@/modules/hr/server/context"
import { attendanceDay, listDuties, listPosts, rosterStaff, rosterWeek } from "@/modules/hr/server/roster-queries"
import { isDayKey, todayKey, weekStart } from "@/modules/hr/roster"
import { RosterView } from "@/modules/hr/components/roster-view"

export const metadata = { title: "Duty roster" }

const TABS = ["week", "attendance", "duties", "posts"]

// ?tab=attendance|duties|posts · ?week=2026-10-05 (any day of that week) · ?day=2026-10-04 (attendance)
export default async function RosterPage({ searchParams }) {
  const ctx = await hrPage("/hrm/roster", "attendance")
  const sp = await searchParams
  const manage = Boolean(ctx.grant("hr.roster"))
  const today = todayKey()
  const start = weekStart(isDayKey(sp.week) ? sp.week : today)
  const date = isDayKey(sp.day) ? sp.day : today
  let tab = TABS.includes(sp.tab) ? sp.tab : "week"
  if (!manage && (tab === "duties" || tab === "posts")) tab = "week"
  const [week, day, posts, duties, staff, projects, brand] = await Promise.all([
    rosterWeek(ctx, start),
    attendanceDay(ctx, date),
    manage ? listPosts(ctx) : [],
    manage ? listDuties(ctx) : [],
    manage ? rosterStaff(ctx) : [],
    manage ? live(ctx.db, "projects").orderBy("id").select("code", "name") : [],
    getWorkspaceBrand(ctx.tenant),
  ])
  return <RosterView tab={tab} week={week} day={day} posts={posts} duties={duties} staff={staff} projects={projects} brand={brand} />
}
