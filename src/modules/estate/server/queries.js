import "server-only"
import { live } from "@/server/db/records"
import { peopleByIds } from "@/modules/users/server/queries"
import { assignableAgents } from "@/modules/crm/server/queries"
import { ledgerFor } from "@/modules/operations/server/ledger"
import { CHECKLISTS, CLOSED_STATUSES, DOCUMENT_PAPERS, OPEN_STATUSES, mergeSettings } from "../constants"
import { scoped } from "./context"

// Reads for Estate Management. Requests only ever come through scoped(), so people see what their
// role allows. Each request carries its file (booking): unit, buyer, how much is paid and overdue,
// and its checklist with the automatic steps worked out from live data.

export const SETTINGS_KEY = "estate_settings"
const json = (v, fallback) => {
  if (v == null) return fallback
  if (typeof v !== "string") return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}
const person = (p) => (p ? { id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null, phone: p.phone ?? null } : null)
const maskCnic = (ctx, cnic) => (!cnic ? null : ctx.grant?.("contacts.cnic") ? cnic : cnic.replace(/^(\d{5})-?\d{7}-?(\d)$/, "$1-•••••••-$2"))

export async function servicesSettings(db) {
  const row = await db("settings").where({ key: SETTINGS_KEY }).first("value")
  return mergeSettings(json(row?.value, {}))
}

// The newest NDC on a file that's still valid → { code, number, issuedAt, validTill } | null
export async function validNdc(db, bookingId, settings, now = new Date()) {
  if (!bookingId) return null
  const rows = await live(db, "serviceRequests").where({ bookingId, type: "ndc", status: "completed" }).orderBy("closedAt", "desc").select("code", "data", "closedAt")
  for (const r of rows) {
    const d = json(r.data, {})
    const issued = d.issuedAt ?? r.closedAt
    const days = Number(d.validDays ?? settings.ndc.validDays)
    const till = new Date(new Date(issued).getTime() + days * 86_400_000)
    if (till > now) return { code: r.code, number: d.number ?? null, issuedAt: issued, validTill: till }
  }
  return null
}

// Requests with their file, unit, buyer and assignee → raw rows
function base(ctx) {
  return scoped(ctx, ctx.db("serviceRequests as r").whereNull("r.deletedAt"), "r")
    .leftJoin("bookings as b", "b.id", "r.bookingId")
    .leftJoin("units as u", "u.id", ctx.db.raw("coalesce(r.unit_id, b.unit_id)"))
    .leftJoin("projects as p", "p.id", "u.projectId")
    .leftJoin("projectPhases as ph", "ph.id", "u.phaseId")
    .leftJoin("projectBlocks as k", "k.id", "u.blockId")
    .leftJoin("contacts as c", "c.id", "r.contactId")
    .select(
      "r.*",
      "b.code as bookingCode",
      "b.netPrice",
      "b.agreedPrice",
      "b.status as bookingStatus",
      "b.stage as bookingStage",
      "b.nominee",
      "u.number as unitNumber",
      "u.type as unitType",
      "u.sizeValue",
      "u.sizeUnit",
      "u.code as unitCode",
      "k.name as blockName",
      "p.code as projectCode",
      "p.name as projectName",
      "ph.name as phaseName",
      "ph.status as phaseStatus",
      "c.code as contactCode",
      "c.name as contactName",
      "c.phone as contactPhone",
      "c.cnic as contactCnic",
    )
}

// The file's money position for each request's booking → Map(bookingId → summary)
async function money(db, rows) {
  const ids = [...new Set(rows.map((r) => r.bookingId).filter(Boolean))]
  if (!ids.length) return new Map()
  const bookings = await db("bookings").whereIn("id", ids).select("id", "netPrice", "agreedPrice", "status")
  return ledgerFor(db, bookings)
}

// Checklist: manual steps ticked by staff, automatic ones from live data
function checklist(r, m, ndc) {
  const ticked = new Set(json(r.steps, []))
  const fee = json(r.fee, null)
  const feeDone = !fee?.amount || Boolean(fee.paidAt) || Boolean(fee.waived)
  return (CHECKLISTS[r.type] ?? []).map((s) => {
    if (!s.auto) return { ...s, done: ticked.has(s.key), detail: s.key === "supporting" && r.type === "document" ? DOCUMENT_PAPERS[json(r.data, {}).kind] : null }
    if (s.key === "fee") return { ...s, done: feeDone, detail: fee?.waived ? "Waived" : fee?.paidAt ? `Paid${fee.ref ? ` · ${fee.ref}` : ""}` : fee?.amount ? null : "No fee" }
    if (s.key === "ndc")
      return { ...s, done: Boolean(ndc), detail: ndc ? `${ndc.number ?? ndc.code}, valid till ${new Date(ndc.validTill).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Needs an NDC first" }
    if (s.key === "dues") return { ...s, done: (m?.overdueAmount ?? 0) <= 0, detail: m?.overdueAmount > 0 ? `${m.overdueCount} overdue` : null, amount: m?.overdueAmount ?? 0 }
    if (s.key === "paid") return { ...s, done: m ? m.balance <= 0 : false, amount: m?.balance ?? null }
    if (s.key === "phase") return { ...s, done: ["possession", "completed"].includes(r.phaseStatus), detail: r.phaseName ?? null }
    return { ...s, done: false }
  })
}

function shape(ctx, r, m, people, ndc = null) {
  const data = json(r.data, {})
  const steps = checklist(r, m, ndc)
  const closed = CLOSED_STATUSES.includes(r.status)
  return {
    code: r.code,
    type: r.type,
    status: r.status,
    priority: r.priority,
    channel: r.channel,
    subject: r.subject,
    details: r.details ?? "",
    // The purchaser's and seller's CNICs follow the same masking as contacts
    data: { ...data, ...(data.to ? { to: { ...data.to, cnic: maskCnic(ctx, data.to.cnic) } } : {}), ...(data.from ? { from: { ...data.from, cnic: maskCnic(ctx, data.from.cnic) } } : {}) },
    fee: json(r.fee, null),
    resolution: r.resolution,
    createdAt: r.createdAt,
    closedAt: r.closedAt,
    dueAt: r.dueAt,
    overdue: !closed && r.dueAt ? new Date(r.dueAt) < new Date() : false,
    closed,
    steps,
    ready: steps.every((s) => s.done),
    assignee: person(people.get(r.assignedTo)),
    contact: r.contactCode ? { code: r.contactCode, name: r.contactName, phone: r.contactPhone, cnic: maskCnic(ctx, r.contactCnic) } : null,
    booking: r.bookingCode
      ? {
          code: r.bookingCode,
          stage: r.bookingStage,
          status: r.bookingStatus,
          net: Number(r.netPrice ?? r.agreedPrice ?? 0),
          received: m?.received ?? 0,
          balance: m?.balance ?? null,
          paidPct: m?.paidPct ?? 0,
          overdueAmount: m?.overdueAmount ?? 0,
          overdueCount: m?.overdueCount ?? 0,
          nominee: json(r.nominee, null),
        }
      : null,
    unit: r.unitNumber
      ? {
          code: r.unitCode,
          number: r.unitNumber,
          type: r.unitType,
          sizeValue: Number(r.sizeValue),
          sizeUnit: r.sizeUnit,
          block: r.blockName,
          phase: r.phaseName,
          phaseStatus: r.phaseStatus,
          project: { code: r.projectCode, name: r.projectName },
        }
      : null,
  }
}

// Requests for a list (one type, or every type for the Service desk)
export async function listRequests(ctx, { type = null } = {}) {
  const q = base(ctx).orderBy("r.createdAt", "desc").limit(3000)
  if (type) q.where("r.type", type)
  const rows = await q
  const [m, people] = await Promise.all([money(ctx.db, rows), peopleByIds(rows.map((r) => r.assignedTo))])
  return rows.map((r) => shape(ctx, r, m.get(r.bookingId), people))
}

// One request with its timeline, the file's other requests and its NDC
export async function getRequest(ctx, code) {
  const r = await base(ctx)
    .where("r.code", String(code ?? "").toUpperCase())
    .first()
  if (!r) return null
  const settings = await servicesSettings(ctx.db)
  const [m, events, related, ndc] = await Promise.all([
    money(ctx.db, [r]),
    ctx.db("serviceRequestEvents").where({ requestId: r.id }).orderBy("at").orderBy("id"),
    r.bookingId ? live(ctx.db, "serviceRequests").where({ bookingId: r.bookingId }).whereNot({ id: r.id }).orderBy("createdAt", "desc").limit(10).select("code", "type", "status", "subject", "createdAt") : [],
    validNdc(ctx.db, r.bookingId, settings),
  ])
  const people = await peopleByIds([r.assignedTo, ...events.map((e) => e.by)])
  const openNdc = r.type === "transfer" && r.bookingId ? await live(ctx.db, "serviceRequests").where({ bookingId: r.bookingId, type: "ndc" }).whereIn("status", OPEN_STATUSES).first("code") : null
  return {
    ...shape(ctx, r, m.get(r.bookingId), people, ndc),
    events: events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: e.at, by: person(people.get(e.by)) })),
    related,
    ndcOnFile: ndc,
    openNdc: openNdc?.code ?? null,
    settings,
  }
}

// Files a request can be about: every live booking (Care works on all files)
export async function bookingOptions(ctx) {
  const rows = await ctx
    .db("bookings as b")
    .whereNull("b.deletedAt")
    .whereNotIn("b.status", ["cancelled", "refunded"])
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .orderBy("b.bookedAt", "desc")
    .limit(5000)
    .select("b.code", "b.customerName", "c.name as contactName", "c.phone as contactPhone", "u.number as unitNumber", "u.type as unitType", "u.sizeValue", "u.sizeUnit", "p.name as projectName")
  return rows.map((b) => ({
    value: b.code,
    label: `${b.contactName ?? b.customerName} · ${b.projectName} ${b.unitNumber}`,
    buyer: b.contactName ?? b.customerName,
    phone: b.contactPhone,
    unit: { type: b.unitType, sizeValue: Number(b.sizeValue), sizeUnit: b.sizeUnit, number: b.unitNumber },
    project: b.projectName,
  }))
}

// People requests can be given to
export const serviceStaff = async (ctx) => (await assignableAgents(ctx)).map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl, team: a.team }))

// Fully paid owners in phases open for possession who haven't asked for it yet
export async function possessionReady(ctx) {
  const bookings = await ctx
    .db("bookings as b")
    .whereNull("b.deletedAt")
    .whereNotIn("b.status", ["cancelled", "refunded"])
    .where((q) => q.whereNot("b.stage", "completed").orWhereNull("b.stage"))
    .join("units as u", "u.id", "b.unitId")
    .join("projectPhases as ph", "ph.id", "u.phaseId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .whereIn("ph.status", ["possession", "completed"])
    .whereNotExists((q) => q.select(ctx.db.raw("1")).from("serviceRequests as r").whereColumn("r.bookingId", "b.id").where("r.type", "possession").whereNull("r.deletedAt").whereNot("r.status", "rejected"))
    .select("b.id", "b.code", "b.netPrice", "b.agreedPrice", "b.status", "b.customerName", "c.name as contactName", "c.phone as contactPhone", "u.number as unitNumber", "p.name as projectName", "ph.name as phaseName")
  const m = await ledgerFor(ctx.db, bookings)
  return bookings
    .filter((b) => (m.get(b.id)?.balance ?? 1) <= 0)
    .map((b) => ({ code: b.code, buyer: b.contactName ?? b.customerName, phone: b.contactPhone, unit: b.unitNumber, project: b.projectName, phase: b.phaseName }))
}

// The overview: open, overdue, complaints, transfers and recent work
export async function serviceOverview(ctx) {
  const all = await listRequests(ctx)
  const now = Date.now()
  const d30 = now - 30 * 86_400_000
  const open = all.filter((r) => !r.closed)
  const complaints = all.filter((r) => r.type === "complaint")
  const closedComplaints = complaints.filter((r) => r.closed && r.closedAt && new Date(r.closedAt) >= d30)
  const fixHours = closedComplaints.map((r) => (new Date(r.closedAt) - new Date(r.createdAt)) / 3_600_000)
  const byType = {}
  for (const r of open) byType[r.type] = (byType[r.type] ?? 0) + 1
  const byCategory = {}
  for (const r of complaints.filter((x) => new Date(x.createdAt) >= d30)) byCategory[r.data.category ?? "other"] = (byCategory[r.data.category ?? "other"] ?? 0) + 1
  const slim = (r) => ({
    code: r.code,
    type: r.type,
    status: r.status,
    priority: r.priority,
    subject: r.subject,
    dueAt: r.dueAt,
    overdue: r.overdue,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
    contact: r.contact?.name ?? null,
    unit: r.unit ? `${r.unit.project.name} ${r.unit.number}` : null,
    assignee: r.assignee,
  })
  return {
    open: open.length,
    overdue: open.filter((r) => r.overdue).length,
    openComplaints: complaints.filter((r) => !r.closed).length,
    urgentComplaints: complaints.filter((r) => !r.closed && ["urgent", "high"].includes(r.priority)).length,
    transfersOpen: all.filter((r) => r.type === "transfer" && !r.closed).length,
    transfersDone30: all.filter((r) => r.type === "transfer" && r.status === "completed" && r.closedAt && new Date(r.closedAt) >= d30).length,
    fixHours: fixHours.length ? Math.round(fixHours.reduce((s, h) => s + h, 0) / fixHours.length) : null,
    onTimePct: closedComplaints.length ? Math.round((closedComplaints.filter((r) => !r.dueAt || new Date(r.closedAt) <= new Date(r.dueAt)).length / closedComplaints.length) * 100) : null,
    byType,
    byCategory,
    overdueList: open
      .filter((r) => r.overdue)
      .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
      .slice(0, 7)
      .map(slim),
    waiting: open
      .filter((r) => r.status === "awaiting-customer")
      .slice(0, 7)
      .map(slim),
    recent: all
      .filter((r) => r.closed)
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
      .slice(0, 5)
      .map(slim),
  }
}
