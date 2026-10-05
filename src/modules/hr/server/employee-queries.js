import "server-only"
import { authDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { maskCnic } from "@/lib/cnic"
import { listMembers } from "@/modules/users/server/queries"
import { memberHref } from "@/modules/users/links"
import { SALARY_PARTS, isOwner, monthlyGross } from "../constants"
import { scoped, seesPay } from "./context"
import { hrRules, loansLeft } from "./payroll"

// Reads for HR & Payroll's people screens: employees, one employee, the overview, leave and
// loans. Everything is limited to the employees this person may see (scoped()); pay shows only
// with seesPay(), CNICs in full only with contacts.cnic.

const n = (v) => Number(v ?? 0)
const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}
// A DATE column (UTC midnight) or "2026-10-04" → "2026-10-04"
export const day = (d) => (!d ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))
// Today in Pakistan → "2026-10-04"
export const pkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())
const shiftDay = (d, days) => new Date(new Date(`${d}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
const hideCnic = (ctx, cnic) => maskCnic(cnic, Boolean(ctx.grant("contacts.cnic")))
const teamRef = (t) => (t ? { id: t.id, name: t.name, color: t.color } : null)

// Teams and projects by id, for labels
async function refs(db) {
  const [teams, projects] = await Promise.all([live(db, "teams").orderBy("sortOrder").select("id", "name", "color"), live(db, "projects").orderBy("name").select("id", "code", "name")])
  return { teams, projects, teamOf: new Map(teams.map((t) => [t.id, t])), projectOf: new Map(projects.map((p) => [p.id, p])) }
}

// Who's on approved leave today → Set(employeeId)
async function awayToday(db, ids) {
  if (!ids.length) return new Set()
  const today = pkToday()
  const rows = await live(db, "leaveRequests").whereIn("employeeId", ids).where({ status: "approved" }).where("startOn", "<=", today).where("endOn", ">=", today).select("employeeId")
  return new Set(rows.map((r) => r.employeeId))
}

const EMPLOYEE_COLUMNS = ["id", "code", "userId", "name", "cnic", "phone", "designation", "department", "teamId", "projectId", "employmentType", "joinedOn", "leftOn", "status", "salary"]

// The short shape lists and pickers use
function employeeShape(ctx, e, { teamOf, projectOf }, away = new Set()) {
  const project = projectOf.get(e.projectId)
  return {
    code: e.code,
    name: e.name,
    designation: e.designation,
    department: e.department,
    team: teamRef(teamOf.get(e.teamId)),
    project: project ? { code: project.code, name: project.name } : null,
    employmentType: e.employmentType,
    status: e.status,
    joinedOn: day(e.joinedOn),
    leftOn: day(e.leftOn),
    phone: e.phone,
    cnic: hideCnic(ctx, e.cnic),
    hasLogin: e.userId != null,
    isMe: e.userId != null && e.userId === ctx.user.id,
    onLeave: away.has(e.id),
    gross: seesPay(ctx, e) ? monthlyGross(json(e.salary, {})) : null,
  }
}

// Employees › everyone this person may see → { employees, teams, projects }
export async function listEmployees(ctx) {
  const [rows, r] = await Promise.all([
    scoped(ctx, live(ctx.db, "employees"))
      .orderBy("name")
      .select(EMPLOYEE_COLUMNS.map((c) => `employees.${c}`)),
    refs(ctx.db),
  ])
  const away = await awayToday(
    ctx.db,
    rows.map((e) => e.id),
  )
  return {
    employees: rows.map((e) => employeeShape(ctx, e, r, away)),
    teams: r.teams.map(teamRef),
    projects: r.projects.map((p) => ({ code: p.code, name: p.name })),
  }
}

// Active employees this person may pick (apply leave, give a loan) → [{ code, name, designation, gross, isMe }]
export async function employeeOptions(ctx) {
  const rows = await scoped(ctx, live(ctx.db, "employees")).where({ status: "active" }).orderBy("name").select("id", "code", "name", "designation", "userId", "salary")
  return rows.map((e) => ({ id: e.id, code: e.code, name: e.name, designation: e.designation, isMe: e.userId != null && e.userId === ctx.user.id, gross: seesPay(ctx, e) ? monthlyGross(json(e.salary, {})) : null }))
}

// Leave taken this year by type → Map(employeeId → { type: days }) (approved, starting this year)
async function leaveUsed(db, ids, year) {
  if (!ids.length) return new Map()
  const rows = await live(db, "leaveRequests")
    .whereIn("employeeId", ids)
    .where({ status: "approved" })
    .whereBetween("startOn", [`${year}-01-01`, `${year}-12-31`])
    .groupBy("employeeId", "type")
    .select("employeeId", "type")
    .sum({ days: "days" })
  const out = new Map()
  for (const r of rows) {
    if (!out.has(r.employeeId)) out.set(r.employeeId, {})
    out.get(r.employeeId)[r.type] = n(r.days)
  }
  return out
}

// Allowance, used and left per leave type (unpaid has no allowance) → [{ type, allowance, used, left }]
export function balancesFrom(rules, used = {}) {
  const types = [...new Set([...Object.keys(rules.leave), ...Object.keys(used), "unpaid"])]
  return types.map((type) => {
    const allowance = type in rules.leave ? n(rules.leave[type]) : null
    const u = n(used[type])
    return { type, allowance, used: u, left: allowance == null ? null : Math.max(0, allowance - u) }
  })
}

// Leave balances for many employees this year → { [code]: balances }
export async function leaveBalances(ctx, employees) {
  const year = pkToday().slice(0, 4)
  const [rules, used] = await Promise.all([
    hrRules(ctx.db),
    leaveUsed(
      ctx.db,
      employees.map((e) => e.id),
      year,
    ),
  ])
  return Object.fromEntries(employees.map((e) => [e.code, balancesFrom(rules, used.get(e.id))]))
}

// One employee's page → null when missing or not this person's to see
export async function getEmployee(ctx, code) {
  const e = await scoped(ctx, live(ctx.db, "employees"))
    .where({ "employees.code": String(code ?? "").toUpperCase() })
    .first()
  if (!e) return null
  const pay = seesPay(ctx, e)
  const year = pkToday().slice(0, 4)
  const [r, rules, used, leaves, loans, slips, away, member] = await Promise.all([
    refs(ctx.db),
    hrRules(ctx.db),
    leaveUsed(ctx.db, [e.id], year),
    live(ctx.db, "leaveRequests").where({ employeeId: e.id }).orderBy("startOn", "desc").limit(12).select("code", "type", "startOn", "endOn", "days", "reason", "status", "decisionNote"),
    live(ctx.db, "loans").where({ employeeId: e.id }).orderBy("id", "desc").select("id", "code", "kind", "amount", "installment", "startMonth", "reason", "status", "givenAt"),
    pay
      ? ctx
          .db("payrollLines as l")
          .join("payrollRuns as r", "r.id", "l.runId")
          .whereNull("r.deletedAt")
          .where("l.employeeId", e.id)
          .whereIn("r.status", ["approved", "paid"])
          .orderBy("r.month", "desc")
          .limit(12)
          .select("r.code", "r.month", "r.status", "r.paidAt", "l.gross", "l.bonus", "l.net")
      : [],
    awayToday(ctx.db, [e.id]),
    e.userId ? live(ctx.db, "members").where({ userId: e.userId }).first("code") : null,
  ])
  const left = new Map((await loansLeft(ctx.db, [e.id])).map((l) => [l.id, l]))
  const login = e.userId ? await authDb()("users").where({ id: e.userId }).first("id", "name", "email") : null
  const salary = json(e.salary, {})
  const emergency = json(e.emergency, null)
  return {
    ...employeeShape(ctx, e, r, away),
    gender: e.gender,
    guardianRelation: e.guardianRelation,
    guardianName: e.guardianName,
    cnicMasked: Boolean(e.cnic) && !ctx.grant("contacts.cnic"),
    email: e.email,
    dateOfBirth: day(e.dateOfBirth),
    teamId: e.teamId,
    address: e.address,
    emergency: emergency?.name || emergency?.phone ? emergency : null,
    eobiNo: e.eobiNo,
    ntn: e.ntn,
    endReason: e.endReason,
    notes: e.notes,
    login: login ? { id: login.id, name: login.name, email: login.email, href: member?.code ? memberHref(member.code) : null } : null,
    pay: pay
      ? {
          salary: Object.fromEntries(SALARY_PARTS.map((p) => [p.key, n(salary[p.key])])),
          gross: monthlyGross(salary),
          pf: Boolean(e.pf),
          payMethod: e.payMethod,
          bankName: e.bankName,
          accountTitle: e.accountTitle,
          iban: e.iban,
        }
      : null,
    balances: balancesFrom(rules, used.get(e.id)),
    year,
    leaves: leaves.map((l) => ({ code: l.code, type: l.type, startOn: day(l.startOn), endOn: day(l.endOn), days: n(l.days), reason: l.reason, status: l.status, decisionNote: l.decisionNote })),
    loans: loans.map((l) => {
      const amount = n(l.amount)
      const recovered = l.status === "active" ? n(left.get(l.id)?.recovered) : l.status === "closed" ? amount : 0
      return {
        code: l.code,
        kind: l.kind,
        amount,
        installment: n(l.installment),
        startMonth: l.startMonth,
        reason: l.reason,
        status: l.status,
        givenAt: l.givenAt,
        recovered,
        left: l.status === "active" ? n(left.get(l.id)?.left) : l.status === "pending" ? amount : 0,
      }
    }),
    payslips: slips.map((s) => ({ run: s.code, month: s.month, status: s.status, paidAt: s.paidAt, gross: n(s.gross) + n(s.bonus), net: n(s.net) })),
  }
}

// Workspace members a login can be linked to: active, not a dealer, not on another employee → [{ id, name, email }]
export async function linkableMembers(ctx) {
  const [members, taken] = await Promise.all([listMembers(ctx), live(ctx.db, "employees").whereNotNull("userId").select("userId")])
  const used = new Set(taken.map((t) => t.userId))
  return members.filter((m) => m.status === "active" && !m.dealerId && !used.has(m.id)).map((m) => ({ id: m.id, name: m.name, email: m.email }))
}

// ---------- overview ----------

const monthName = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
const monthLabel = (m) => monthName.format(new Date(`${m}-15T00:00:00Z`))
const monthsBack = (month, count) => {
  const [y, m] = month.split("-").map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 15))
    return d.toISOString().slice(0, 7)
  })
}

// HR home: headcount, who's away, leave waiting, and (with hr.salaries and payroll) this month's
// payroll, tax withheld and six months of payroll cost
export async function hrOverview(ctx) {
  const today = pkToday()
  const [rows, r] = await Promise.all([
    scoped(ctx, live(ctx.db, "employees"))
      .orderBy("name")
      .select(EMPLOYEE_COLUMNS.map((c) => `employees.${c}`)),
    refs(ctx.db),
  ])
  // Headcount leaves owners and directors out
  const active = rows.filter((e) => e.status === "active" && !isOwner(e.employmentType))
  const ids = rows.map((e) => e.id)
  const byId = new Map(rows.map((e) => [e.id, e]))
  const [awayRows, waiting] = await Promise.all([
    ids.length
      ? live(ctx.db, "leaveRequests").whereIn("employeeId", ids).where({ status: "approved" }).where("startOn", "<=", today).where("endOn", ">=", today).orderBy("endOn").select("employeeId", "type", "endOn")
      : [],
    ids.length ? live(ctx.db, "leaveRequests").whereIn("employeeId", ids).where({ status: "pending" }).count({ c: "id" }).first() : { c: 0 },
  ])
  const since = shiftDay(today, -90)
  const departments = new Map()
  for (const e of active) departments.set(e.department ?? "", (departments.get(e.department ?? "") ?? 0) + 1)

  let payroll = null
  if (ctx.grant("hr.salaries") && ctx.has("payroll")) {
    const thisMonth = today.slice(0, 7)
    const months = monthsBack(thisMonth, 6)
    const [current, latestDraft, lastPaid, paid] = await Promise.all([
      live(ctx.db, "payrollRuns").where({ month: thisMonth }).first("code", "month", "status", "gross", "net", "people"),
      live(ctx.db, "payrollRuns").where({ status: "draft" }).orderBy("month", "desc").first("code", "month", "status", "gross", "net", "people"),
      live(ctx.db, "payrollRuns").where({ status: "paid" }).orderBy("month", "desc").first("id", "code", "month"),
      ctx
        .db("payrollRuns as r")
        .leftJoin("payrollLines as l", "l.runId", "r.id")
        .whereNull("r.deletedAt")
        .where("r.status", "paid")
        .whereIn("r.month", months)
        .groupBy("r.month")
        .select("r.month")
        .sum({ gross: "l.gross", bonus: "l.bonus", eobiEmployer: "l.eobiEmployer", pfEmployer: "l.pfEmployer" }),
    ])
    const run = current ?? latestDraft
    const withheld = lastPaid ? await ctx.db("payrollLines").where({ runId: lastPaid.id }).sum({ tax: "tax", eobi: "eobi", eobiEmployer: "eobiEmployer" }).first() : null
    const cost = new Map(paid.map((p) => [p.month, p]))
    payroll = {
      run: run ? { code: run.code, month: run.month, label: monthLabel(run.month), status: run.status, gross: n(run.gross), net: n(run.net), people: n(run.people) } : null,
      lastPaid: lastPaid ? { code: lastPaid.code, label: monthLabel(lastPaid.month), tax: n(withheld?.tax), eobi: n(withheld?.eobi) + n(withheld?.eobiEmployer) } : null,
      months: months.map((m) => {
        const p = cost.get(m)
        return { month: monthLabel(m), pay: n(p?.gross) + n(p?.bonus), employer: n(p?.eobiEmployer) + n(p?.pfEmployer) }
      }),
    }
  }

  return {
    active: active.length,
    joined: active.filter((e) => day(e.joinedOn) >= since).length,
    probation: active.filter((e) => e.employmentType === "probation").length,
    waiting: n(waiting?.c),
    away: awayRows.map((l) => ({ ...employeeShape(ctx, byId.get(l.employeeId), r), leaveType: l.type, backOn: shiftDay(day(l.endOn), 1) })),
    departments: [...departments].map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count),
    payroll,
  }
}

// ---------- leave ----------

// Leave requests for the employees this person may see, newest first, with what they may do on each
export async function listLeave(ctx) {
  const rows = await scoped(
    ctx,
    ctx.db("leaveRequests as l").join("employees", function () {
      this.on("employees.id", "=", "l.employeeId").andOnNull("employees.deletedAt")
    }),
  )
    .whereNull("l.deletedAt")
    .orderBy("l.startOn", "desc")
    .limit(2000)
    .select(
      "l.code",
      "l.type",
      "l.startOn",
      "l.endOn",
      "l.days",
      "l.reason",
      "l.status",
      "l.decidedBy",
      "l.decidedAt",
      "l.decisionNote",
      "l.createdAt",
      "l.employeeId",
      "employees.code as employeeCode",
      "employees.name",
      "employees.designation",
      "employees.userId",
    )
  const people = await authDb()("users")
    .whereIn("id", [...new Set(rows.map((l) => l.decidedBy).filter(Boolean))])
    .select("id", "name")
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  const today = pkToday()
  const approver = Boolean(ctx.grant("hr.approve-leave"))
  const manage = ctx.can("edit") && approver
  return rows.map((l) => {
    const mine = ctx.me?.id === l.employeeId
    const startOn = day(l.startOn)
    return {
      code: l.code,
      type: l.type,
      startOn,
      endOn: day(l.endOn),
      days: n(l.days),
      reason: l.reason,
      status: l.status,
      decidedBy: nameOf.get(l.decidedBy) ?? null,
      decidedAt: l.decidedAt,
      decisionNote: l.decisionNote,
      appliedAt: l.createdAt,
      employee: { code: l.employeeCode, name: l.name, designation: l.designation, isMe: mine },
      canDecide: approver && l.status === "pending" && l.userId !== ctx.user.id,
      canCancel: ["pending", "approved"].includes(l.status) && (manage || (mine && (l.status === "pending" || startOn > today))),
    }
  })
}

// ---------- loans ----------

// Loans and advances for the employees this person may see, with what's been recovered
export async function listLoans(ctx) {
  const rows = await scoped(
    ctx,
    ctx.db("loans as l").join("employees", function () {
      this.on("employees.id", "=", "l.employeeId").andOnNull("employees.deletedAt")
    }),
  )
    .whereNull("l.deletedAt")
    .leftJoin("accounts as a", "a.id", "l.accountId")
    .orderBy("l.id", "desc")
    .select(
      "l.id",
      "l.code",
      "l.kind",
      "l.amount",
      "l.installment",
      "l.startMonth",
      "l.reason",
      "l.status",
      "l.givenAt",
      "l.employeeId",
      "a.name as account",
      "employees.code as employeeCode",
      "employees.name",
      "employees.designation",
    )
  const left = new Map((await loansLeft(ctx.db, [...new Set(rows.map((l) => l.employeeId))])).map((l) => [l.id, l]))
  return rows.map((l) => {
    const amount = n(l.amount)
    const recovered = l.status === "active" ? n(left.get(l.id)?.recovered) : l.status === "closed" ? amount : 0
    return {
      code: l.code,
      kind: l.kind,
      amount,
      installment: n(l.installment),
      startMonth: l.startMonth,
      reason: l.reason,
      status: l.status,
      givenAt: l.givenAt,
      account: l.account,
      recovered,
      left: l.status === "active" ? n(left.get(l.id)?.left) : l.status === "pending" ? amount : 0,
      employee: { code: l.employeeCode, name: l.name, designation: l.designation },
    }
  })
}
