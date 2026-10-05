import "server-only"
import { can, isFullAccess, roleAccess } from "@/modules/users/permissions"
import { listInvitations } from "@/modules/users/server/queries"
import { canSetUp, getSetup } from "@/modules/portal/server/setup"
import { listApprovals } from "@/modules/approvals/server/queries"
import { servicesContext } from "@/modules/estate/server/context"
import { OPEN_STATUSES } from "@/modules/estate/constants"
import { financeContext } from "@/modules/finance/server/context"
import { hrContext } from "@/modules/hr/server/context"
import { attendanceDay } from "@/modules/hr/server/roster-queries"
import { todayKey } from "@/modules/hr/roster"
import { documentsContext } from "@/modules/documents/server/context"
import { remindExpiring } from "@/modules/documents/server/reminders"
import { SOON_DAYS, addDays, todayKey as pkToday } from "@/modules/documents/expiry"

// My Desk's to-dos (on the launcher): things that need this person, gathered from every app.
// Each: { id, app, icon?, title, detail?, href, critical? }. critical ones (overdue, waiting on
// them, about to expire) go in the launcher's Critical column. Apps add theirs as they're ported.
export async function myTasks(ctx) {
  const tasks = []
  const { me, permissions } = ctx

  // Me
  if (me && !me.phone) tasks.push({ id: "phone", app: null, icon: "smartphone-line", title: "Add your mobile number", detail: "So your team and customers can reach you", href: "/profile" })

  // Workspace setup (owners and admins)
  if (canSetUp(permissions)) {
    const setup = await getSetup(ctx.tenant)
    if (!setup.steps.logo) tasks.push({ id: "setup-logo", app: "settings", title: "Upload your company logo", detail: "It goes on receipts, letters and invoices", href: "/setup?step=logo" })
    if (!setup.steps.accounts) tasks.push({ id: "setup-accounts", app: "settings", title: "Add your bank accounts", detail: "Where installments and receipts are received", href: "/setup?step=accounts" })
  }

  // Users & Teams
  if (isFullAccess(permissions) || can(permissions, "users", "create")) {
    const expired = (await listInvitations(ctx)).filter((i) => i.expired)
    for (const i of expired.slice(0, 5)) tasks.push({ id: `invite-${i.id}`, app: "users", title: `Resend the invitation to ${i.name}`, detail: `It expired before ${i.email} joined`, href: "/users/invitations" })
  }
  if (isFullAccess(permissions) || can(permissions, "users", "edit")) {
    const teamless = ctx.members.filter((m) => m.status === "active" && !m.isOwner && !m.teamId && !m.dealerId)
    if (teamless.length && ctx.teamsCount)
      tasks.push({
        id: "teamless",
        app: "users",
        title: `Put ${teamless.length} ${teamless.length === 1 ? "person" : "people"} in a team`,
        detail:
          teamless
            .slice(0, 3)
            .map((m) => m.name)
            .join(", ") + (teamless.length > 3 ? "…" : ""),
        href: "/users/teams",
      })
  }
  // Project Portfolio: units I'm holding that run out within a day
  if (isFullAccess(permissions) || can(permissions, "portfolio", "edit")) {
    const soon = await ctx
      .db("units")
      .where({ holdBy: ctx.user.id, status: "on-hold" })
      .whereNull("deletedAt")
      .where("holdExpiresAt", "<=", new Date(Date.now() + 86_400_000))
      .orderBy("holdExpiresAt")
      .limit(5)
      .select("code", "number", "type", "holdExpiresAt")
    for (const u of soon) {
      const hours = Math.max(0, Math.round((new Date(u.holdExpiresAt).getTime() - Date.now()) / 3_600_000))
      tasks.push({
        id: `hold-${u.code}`,
        app: "portfolio",
        title: `Your hold on ${u.number} ends ${hours < 1 ? "within the hour" : `in ${hours}h`}`,
        detail: "Extend it, book it or let it go back on sale",
        href: `/project-portfolio/inventory?unit=${u.code.toLowerCase()}`,
        critical: true,
      })
    }
  }

  // CRM: my follow-ups due today or overdue (the three most urgent by name, then a count)
  if (isFullAccess(permissions) || can(permissions, "crm", "view")) {
    const endOfToday = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())}T23:59:59+05:00`)
    const due = await ctx
      .db("leadActivities as a")
      .join("leads as l", "l.id", "a.leadId")
      .whereNull("a.deletedAt")
      .whereNull("l.deletedAt")
      .whereNull("l.archivedAt")
      .where({ "a.status": "planned", "a.by": ctx.user.id })
      .whereNotIn("l.status", ["booked", "lost"])
      .where("a.at", "<=", endOfToday)
      .orderBy("a.at")
      .select("a.type", "a.at", "l.code", "l.name")
    for (const f of due.slice(0, 3)) {
      const overdue = new Date(f.at) < new Date()
      tasks.push({
        id: `follow-up-${f.code}-${new Date(f.at).getTime()}`,
        app: "crm",
        title: `${f.type === "whatsapp" ? "WhatsApp" : f.type === "site-visit" ? "Site visit with" : f.type === "meeting" ? "Meet" : "Call"} ${f.name}`,
        detail: overdue ? "Follow-up overdue" : `Due today ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(f.at))}`,
        href: `/crm/leads?lead=${f.code.toLowerCase()}`,
        critical: overdue,
      })
    }
    if (due.length > 3) tasks.push({ id: "follow-ups-more", app: "crm", title: `${due.length - 3} more follow-ups due today`, href: "/crm/leads?tab=due" })
  }

  // Approvals: requests waiting for me, and mine sent back in the last week
  const waiting = await listApprovals(ctx)
  for (const a of waiting.waiting.slice(0, 5))
    tasks.push({ id: `approval-${a.code}`, app: null, icon: "shield-check-line", title: `Approve: ${a.title}`, detail: [a.requester?.name, a.details].filter(Boolean).join(" · "), href: "/approvals", critical: true })
  for (const a of waiting.mine.filter((x) => x.status === "rejected" && new Date(x.decidedAt) > new Date(Date.now() - 7 * 86_400_000)).slice(0, 3))
    tasks.push({
      id: `approval-back-${a.code}`,
      app: null,
      icon: "arrow-go-back-line",
      title: `Sent back: ${a.title}`,
      detail: a.note ? `${a.decider?.name ?? "Approver"}: ${a.note}` : undefined,
      href: a.link ?? "/approvals",
    })

  // Finance: cheques stuck in clearing (for people who clear or bounce them, in Finance or Sales),
  // and refunds still owed to canceled bookings' buyers (finance.refunds). Vouchers and receipts
  // waiting for approval already show through Approvals above.
  const money = await financeContext("/")
  const salesCheques = Boolean(money.grant("operations.cheques")) && (isFullAccess(permissions) || can(permissions, "operations", "edit"))
  const financeCheques = money.can("view") && Boolean(money.grant("finance.cheques"))
  let agedCheques = false
  if (financeCheques || salesCheques) {
    const stuck = await ctx
      .db("receipts")
      .where({ status: "clearing" })
      .whereNull("deletedAt")
      .where("receivedOn", "<", new Date(Date.now() - 3 * 86_400_000))
      .count({ n: "id" })
      .sum({ s: "amount" })
      .min({ oldest: "receivedOn" })
      .first()
    const n = Number(stuck?.n ?? 0)
    if (n) {
      agedCheques = true
      const days = Math.floor((Date.now() - new Date(stuck.oldest).getTime()) / 86_400_000)
      tasks.push({
        id: "finance-clearing",
        app: financeCheques ? "finance" : "operations",
        title: `Clear or bounce ${n} ${n === 1 ? "cheque" : "cheques"}`,
        detail: `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(Number(stuck.s)))} in clearing for over 3 days; the oldest ${days} days`,
        href: financeCheques && money.has("banking") ? "/finance/cheques" : "/operations/receipts",
        critical: days > 10,
      })
    }
  }
  if (money.can("view") && money.grant("finance.refunds")) {
    const owed = await ctx.db("bookings").where({ status: "cancelled" }).whereNull("deletedAt").where("refundAmount", ">", 0).orderBy("cancelledAt").select("id", "code", "customerName", "refundAmount")
    const paid = owed.length
      ? await ctx
          .db("vouchers")
          .where({ sourceType: "booking", event: "refund", status: "posted" })
          .whereIn(
            "sourceId",
            owed.map((b) => b.id),
          )
          .whereNull("deletedAt")
          .groupBy("sourceId")
          .select("sourceId")
          .sum({ s: "amount" })
      : []
    const due = owed.map((b) => ({ ...b, left: Number(b.refundAmount) - Number(paid.find((p) => p.sourceId === b.id)?.s ?? 0) })).filter((b) => b.left >= 1)
    for (const b of due.slice(0, 3))
      tasks.push({
        id: `finance-refund-${b.code}`,
        app: "finance",
        title: `Refund owed to ${b.customerName}`,
        detail: `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(b.left))} still owed on canceled booking ${b.code}`,
        href: "/finance/refunds",
      })
    if (due.length > 3) tasks.push({ id: "finance-refunds-more", app: "finance", title: `${due.length - 3} more refunds owed`, href: "/finance/refunds" })
  }

  // Sales: cheques waiting to clear (for people who clear them, unless Finance's reminder above
  // already covers them), and my buyers who are overdue
  if (isFullAccess(permissions) || can(permissions, "operations", "view")) {
    const { grants } = roleAccess({ permissions, scope: ctx.roleScope, grants: ctx.roleGrants })
    if (!agedCheques && grants["operations.cheques"] && (isFullAccess(permissions) || can(permissions, "operations", "edit"))) {
      const waiting = await ctx.db("receipts").where({ status: "clearing" }).whereNull("deletedAt").count({ n: "id" }).sum({ s: "amount" }).first()
      const n = Number(waiting?.n ?? 0)
      if (n)
        tasks.push({
          id: "sales-clearing",
          app: "operations",
          title: `${n} ${n === 1 ? "cheque is" : "cheques are"} waiting to clear`,
          detail: `Rs ${new Intl.NumberFormat("en-PK").format(Math.round(Number(waiting.s)))} in clearing: mark them cleared or bounced`,
          href: "/operations/receipts",
        })
    }
    const overdue = await ctx.db("bookings").where({ agentId: ctx.user.id }).whereIn("status", ["overdue", "defaulter"]).whereNull("deletedAt").orderBy("status", "asc").limit(5).select("code", "customerName", "status")
    for (const b of overdue)
      tasks.push({
        id: `sales-overdue-${b.code}`,
        app: "operations",
        title: `${b.customerName} is ${b.status === "defaulter" ? "a defaulter" : "behind on payments"}`,
        detail: `Booking ${b.code}: follow up on the overdue installments`,
        href: `/operations/bookings/${b.code.toLowerCase()}`,
        critical: true,
      })
  }

  // Estate Management: my open requests due within a day or already late (the five most urgent)
  const care = await servicesContext("/")
  if (care.can("view")) {
    const FEATURE = { transfer: "transfers", ndc: "ndc-possession", possession: "ndc-possession", complaint: "complaints" }
    const due = await ctx
      .db("serviceRequests")
      .whereNull("deletedAt")
      .where({ assignedTo: ctx.user.id })
      .whereIn("status", OPEN_STATUSES)
      .whereNotNull("dueAt")
      .where("dueAt", "<=", new Date(Date.now() + 86_400_000))
      .orderBy("dueAt")
      .limit(20)
      .select("code", "type", "subject", "dueAt")
    for (const r of due.filter((x) => !FEATURE[x.type] || care.has(FEATURE[x.type])).slice(0, 5)) {
      const late = new Date(r.dueAt) < new Date()
      const hours = Math.round(Math.abs(new Date(r.dueAt).getTime() - Date.now()) / 3_600_000)
      const span = hours < 1 ? "under an hour" : hours < 48 ? `${hours}h` : `${Math.round(hours / 24)} days`
      tasks.push({
        id: `service-${r.code}`,
        app: "estate",
        title: r.subject,
        detail: `${r.code} · ${late ? `${span} late` : `due in ${span}`}`,
        href: `/estate-management/requests/${r.code.toLowerCase()}`,
        critical: late,
      })
    }
  }

  // HR & Payroll: today's attendance still to mark (hr.roster), and this month's payroll to approve
  // after the 25th (hr.payroll). Leave and advance requests already show through Approvals above.
  const hr = await hrContext("/")
  if (hr.can("view")) {
    const today = todayKey()
    if (hr.has("attendance") && hr.grant("hr.roster")) {
      const n = (await attendanceDay(hr, today)).counts.unmarked
      if (n)
        tasks.push({
          id: `hr-attendance-${today}`,
          app: "hr",
          title: `Mark attendance for ${n} ${n === 1 ? "person" : "people"} on duty today`,
          detail: "Absences are unpaid days in payroll",
          href: `/hrm/roster?tab=attendance&day=${today}`,
        })
    }
    if (hr.has("payroll") && hr.can("edit") && hr.grant("hr.payroll") && Number(today.slice(8)) > 25) {
      const run = await ctx
        .db("payrollRuns")
        .where({ month: today.slice(0, 7), status: "draft" })
        .whereNull("deletedAt")
        .first("code", "people")
      if (run)
        tasks.push({
          id: `hr-payroll-${run.code}`,
          app: "hr",
          title: "Approve this month's payroll",
          detail: `${run.code}: ${run.people} ${run.people === 1 ? "person" : "people"}. Review the draft, approve it, then pay on the 1st`,
          href: `/hrm/payroll/${run.code.toLowerCase()}`,
        })
    }
  }

  // Documents: expired and soon-expiring documents (NOCs, contracts, licenses) for people who can
  // renew them (documents.edit), in the types they may see. The day's expiry notifications go
  // out here too when nobody has opened Documents yet today.
  const docs = await documentsContext("/")
  if (docs.can("edit") && docs.has("expiry") && docs.visibleTypes.length) {
    await remindExpiring(ctx.db, ctx.tenant)
    const today = pkToday()
    const rows = await ctx
      .db("assets")
      .where({ app: "documents" })
      .whereNull("deletedAt")
      .whereNull("supersededAt")
      .whereIn("category", docs.visibleTypes)
      .where("expiresOn", "<=", addDays(today, SOON_DAYS))
      .orderBy("expiresOn")
      .select("title", "expiresOn")
    const expired = rows.filter((r) => new Date(r.expiresOn).toISOString().slice(0, 10) < today)
    const soon = rows.length - expired.length
    if (expired.length)
      tasks.push({
        id: `documents-expired-${expired.length}`,
        app: "documents",
        title: `${expired.length} ${expired.length === 1 ? "document has" : "documents have"} expired`,
        detail: `${expired
          .slice(0, 2)
          .map((r) => r.title)
          .join(", ")}${expired.length > 2 ? "…" : ""}: renew and upload the new copy`,
        href: "/documents/expiring",
        critical: true,
      })
    if (soon)
      tasks.push({
        id: `documents-expiring-${soon}`,
        app: "documents",
        title: `${soon} ${soon === 1 ? "document expires" : "documents expire"} in the next ${SOON_DAYS} days`,
        detail: rows.find((r) => new Date(r.expiresOn).toISOString().slice(0, 10) >= today)?.title,
        href: "/documents/expiring",
      })
  }

  // Project Portfolio: project events in the next 7 days
  if (isFullAccess(permissions) || can(permissions, "portfolio", "view")) {
    const now = new Date()
    const soon = await ctx
      .db("projectEvents as e")
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
      tasks.push({ id: `event-${e.code}`, app: "portfolio", title: e.title, detail: [when, e.projectName, e.venue].filter(Boolean).join(" · "), href: `/project-portfolio/projects/${e.projectCode.toLowerCase()}` })
    }
  }
  return tasks
}
