import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { waitingCount } from "@/modules/approvals/server/queries"
import { myTasks } from "./tasks"

// My Desk at a glance, for the top of the launcher: a few numbers, the latest to-dos and what
// this person did recently across the apps. ctx: deskContext()

// activity_log.type → the app it belongs to
const APP_OF = { crm: "crm", estate: "estate", settings: "settings", lists: "settings", role: "users", invite: "users", team: "users", member: "users", dealer: "users", users: "users", profile: "desk" }
const HIDDEN = ["sign-in", "security"]

export async function deskSummary(ctx) {
  const [tasks, approvals, holds, recent, lists] = await Promise.all([
    myTasks(ctx),
    waitingCount(ctx),
    live(ctx.db, "units").where({ holdBy: ctx.user.id, status: "on-hold" }).count("id as n").first(),
    ctx.db("activityLog").where({ actorUserId: ctx.user.id }).whereNotIn("type", HIDDEN).orderBy("createdAt", "desc").limit(6).select("type", "summary", "subjectType", "subjectId", "createdAt"),
    getLookups(ctx.db, ["designation"]),
  ])
  // Links for recent items about projects
  const projectIds = recent.filter((r) => r.subjectType === "project").map((r) => r.subjectId)
  const projects = projectIds.length ? await ctx.db("projects").whereIn("id", projectIds).whereNull("deletedAt").select("id", "code") : []
  const team = ctx.teams[0]
  return {
    me: { role: ctx.me?.role ?? null, designation: lists.designation.find((d) => d.value === ctx.me?.designation)?.label ?? null, team: team ? { name: team.name, color: team.color } : null },
    counts: { tasks: tasks.length, approvals, holds: Number(holds?.n ?? 0) },
    tasks: tasks.slice(0, 5),
    recent: recent.map((r) => {
      const p = r.subjectType === "project" ? projects.find((x) => x.id === r.subjectId) : null
      return { summary: r.summary, at: r.createdAt, app: APP_OF[r.type] ?? null, href: p ? `/estate/projects/${p.code.toLowerCase()}` : null }
    }),
  }
}
