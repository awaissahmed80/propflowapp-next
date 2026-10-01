import "server-only"
import { can, isFullAccess } from "@/modules/users/permissions"
import { listInvitations } from "@/modules/users/server/queries"
import { canSetUp, getSetup } from "@/modules/portal/server/setup"
import { listApprovals } from "@/modules/approvals/server/queries"

// "Your tasks" on Today: things that need this person, gathered from every app they use.
// Each: { id, app, title, detail?, href }. Apps add theirs here as they're ported.
export async function myTasks(ctx) {
  const tasks = []
  const { me, permissions } = ctx

  // Me
  if (me && !me.phone) tasks.push({ id: "phone", app: "desk", title: "Add your mobile number", detail: "So your team and customers can reach you", href: "/desk/profile" })

  // Workspace setup (owners and admins)
  if (canSetUp(permissions)) {
    const setup = await getSetup(ctx.tenant)
    if (!setup.steps.logo) tasks.push({ id: "setup-logo", app: "settings", title: "Upload your company logo", detail: "It goes on receipts, letters and invoices", href: "/setup?step=logo" })
    if (!setup.steps.accounts) tasks.push({ id: "setup-accounts", app: "settings", title: "Add your bank accounts", detail: "Where installments and receipts are received", href: "/setup?step=accounts" })
  }

  // Users & Teams
  if (isFullAccess(permissions) || can(permissions, "users", "create")) {
    const expired = (await listInvitations(ctx)).filter((i) => i.expired)
    for (const i of expired.slice(0, 5))
      tasks.push({ id: `invite-${i.id}`, app: "users", title: `Resend the invitation to ${i.name}`, detail: `It expired before ${i.email} joined`, href: "/users/invitations" })
  }
  if (isFullAccess(permissions) || can(permissions, "users", "edit")) {
    const teamless = ctx.members.filter((m) => m.status === "active" && !m.isOwner && !m.teamId && !m.dealerId)
    if (teamless.length && ctx.teamsCount)
      tasks.push({ id: "teamless", app: "users", title: `Put ${teamless.length} ${teamless.length === 1 ? "person" : "people"} in a team`, detail: teamless.slice(0, 3).map((m) => m.name).join(", ") + (teamless.length > 3 ? "…" : ""), href: "/users/teams" })
  }
  // Estate Management: units I'm holding that run out within a day
  if (isFullAccess(permissions) || can(permissions, "estate", "edit")) {
    const soon = await ctx.db("units").where({ holdBy: ctx.user.id, status: "on-hold" }).whereNull("deletedAt").where("holdExpiresAt", "<=", new Date(Date.now() + 86_400_000)).orderBy("holdExpiresAt").limit(5).select("code", "number", "type", "holdExpiresAt")
    for (const u of soon) {
      const hours = Math.max(0, Math.round((new Date(u.holdExpiresAt).getTime() - Date.now()) / 3_600_000))
      tasks.push({ id: `hold-${u.code}`, app: "estate", title: `Your hold on ${u.number} ends ${hours < 1 ? "within the hour" : `in ${hours}h`}`, detail: "Extend it, book it or let it go back on sale", href: `/estate/inventory?unit=${u.code.toLowerCase()}` })
    }
  }

  // CRM: my follow-ups due today or overdue (the three most urgent by name, then a count)
  if (isFullAccess(permissions) || can(permissions, "crm", "view")) {
    const endOfToday = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())}T23:59:59+05:00`)
    const due = await ctx.db("leadActivities as a")
      .join("leads as l", "l.id", "a.leadId")
      .whereNull("a.deletedAt")
      .whereNull("l.deletedAt")
      .where({ "a.status": "planned", "a.by": ctx.user.id })
      .whereNotIn("l.status", ["booked", "lost"])
      .where("a.at", "<=", endOfToday)
      .orderBy("a.at")
      .select("a.type", "a.at", "l.code", "l.name")
    for (const f of due.slice(0, 3)) {
      const overdue = new Date(f.at) < new Date()
      tasks.push({ id: `follow-up-${f.code}-${new Date(f.at).getTime()}`, app: "crm", title: `${f.type === "whatsapp" ? "WhatsApp" : f.type === "site-visit" ? "Site visit with" : f.type === "meeting" ? "Meet" : "Call"} ${f.name}`, detail: overdue ? "Follow-up overdue" : `Due today ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(f.at))}`, href: `/crm/leads?lead=${f.code.toLowerCase()}` })
    }
    if (due.length > 3) tasks.push({ id: "follow-ups-more", app: "crm", title: `${due.length - 3} more follow-ups due today`, href: "/crm/leads?tab=due" })
  }

  // Approvals: requests waiting for me, and mine sent back in the last week
  const waiting = await listApprovals(ctx)
  for (const a of waiting.waiting.slice(0, 5)) tasks.push({ id: `approval-${a.code}`, app: "desk", title: `Approve: ${a.title}`, detail: [a.requester?.name, a.details].filter(Boolean).join(" · "), href: "/desk/approvals" })
  for (const a of waiting.mine.filter((x) => x.status === "rejected" && new Date(x.decidedAt) > new Date(Date.now() - 7 * 86_400_000)).slice(0, 3))
    tasks.push({ id: `approval-back-${a.code}`, app: "desk", title: `Sent back: ${a.title}`, detail: a.note ? `${a.decider?.name ?? "Approver"}: ${a.note}` : undefined, href: a.link ?? "/desk/approvals" })

  // Estate Management: project events in the next 7 days
  if (isFullAccess(permissions) || can(permissions, "estate", "view")) {
    const now = new Date()
    const soon = await ctx.db("projectEvents as e")
      .join("projects as p", "p.id", "e.projectId")
      .whereNull("e.deletedAt")
      .whereNull("p.deletedAt")
      .where("e.status", "scheduled")
      .whereBetween("e.startsAt", [now, new Date(now.getTime() + 7 * 86_400_000)])
      .orderBy("e.startsAt")
      .limit(5)
      .select("e.code", "e.title", "e.startsAt", "e.venue", "p.name as projectName", "p.code as projectCode")
    for (const e of soon) {
      const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(e.startsAt)
      tasks.push({ id: `event-${e.code}`, app: "estate", title: e.title, detail: [when, e.projectName, e.venue].filter(Boolean).join(" · "), href: `/estate/projects/${e.projectCode.toLowerCase()}` })
    }
  }
  return tasks
}
