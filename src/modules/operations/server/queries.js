import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { peopleByIds } from "@/modules/users/server/queries"
import { activeListsByProject } from "@/modules/portfolio/server/price-list-queries"
import { assetUrl } from "@/server/assets"
import { handles, scoped } from "./context"
import { assignableAgents } from "@/modules/crm/server/queries"
import { ledgerFor } from "./ledger"
import { bookingDocuments } from "./documents"
import { salesSettings } from "./settings"
import { commissionRows } from "./commissions"

// Proof of payment on receipts (assets owner_type "receipt"), by receipt id
async function proofsFor(db, ids) {
  if (!ids.length) return new Map()
  const rows = await live(db, "assets").where({ ownerType: "receipt", collection: "proof" }).whereIn("ownerId", ids).select("ownerId", "code", "mime", "fileName")
  return new Map(rows.map((a) => [a.ownerId, { url: assetUrl(a.code), mime: a.mime, name: a.fileName }]))
}

const voiceOf = (files, id) => {
  const f = files.find((x) => x.ownerId === id && x.collection === "voice")
  return f ? { url: assetUrl(f.code), mime: f.mime } : null
}

// A booking's timeline: system events and people's notes/actions with their files, oldest first
async function timeline(ctx, booking) {
  const rows = await live(ctx.db, "bookingActivities").where({ bookingId: booking.id }).orderBy("at").orderBy("id")
  // Files picked from the booking's folder (by asset id), besides ones uploaded with the activity
  const pickedIds = (r) => {
    try {
      const v = typeof r.attachments === "string" ? JSON.parse(r.attachments) : r.attachments
      return Array.isArray(v) ? v.map(Number) : []
    } catch {
      return []
    }
  }
  const allPicked = [...new Set(rows.flatMap(pickedIds))]
  const [people, files, picked] = await Promise.all([
    peopleByIds([...rows.map((r) => r.by), booking.createdBy, booking.agentId]),
    rows.length
      ? live(ctx.db, "assets")
          .where({ ownerType: "booking-activity" })
          .whereIn("collection", ["attachments", "voice"])
          .whereIn(
            "ownerId",
            rows.map((r) => r.id),
          )
          .orderBy("id")
          .select("ownerId", "collection", "code", "mime", "fileName", "size")
      : [],
    allPicked.length ? live(ctx.db, "assets").whereIn("id", allPicked).select("id", "code", "mime", "fileName", "size") : [],
  ])
  const shapeFile = (f) => ({ code: f.code, url: assetUrl(f.code), mime: f.mime, name: f.fileName, size: f.size })
  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    event: r.event,
    notes: r.notes ?? "",
    at: r.at,
    by: person(people.get(r.by)),
    files: [
      ...files.filter((f) => f.ownerId === r.id && f.collection === "attachments").map(shapeFile),
      ...pickedIds(r)
        .map((id) => picked.find((f) => f.id === id))
        .filter(Boolean)
        .map(shapeFile),
    ],
    voice: voiceOf(files, r.id),
  }))
  // Bookings from before the timeline existed still start with when they were booked
  if (!items.some((i) => i.event === "created"))
    items.unshift({
      id: `booked-${booking.id}`,
      type: "system",
      event: "created",
      notes: `Booked unit ${booking.unitNumber ?? ""}`.trim(),
      at: booking.bookedAt,
      by: person(people.get(booking.createdBy ?? booking.agentId)),
      files: [],
      voice: null,
    })
  return items
}

// Reads for Sales. Bookings only ever come through scoped(), so people see what their role allows.

export const SALES_LISTS = ["booking-stage", "booking-status", "payment-method", "activity-type", "unit-type", "area-unit", "block-category", "feature", "contact-type", "lead-status", "lead-source"]
export const salesLists = (ctx) => getLookups(ctx.db, SALES_LISTS)

const person = (p) => (p ? { id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null } : null)
// 35202-1234567-1 → 35202-•••••••-1 without the "See full CNIC numbers" grant
const maskCnic = (ctx, cnic) => (!cnic ? null : ctx.grant("contacts.cnic") ? cnic : cnic.replace(/^(\d{5})-?\d{7}-?(\d)$/, "$1-•••••••-$2"))

// Bookings with their unit, project and buyer (scoped), newest first
function baseQuery(ctx) {
  return scoped(ctx, ctx.db("bookings as b").whereNull("b.deletedAt"), "b")
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .leftJoin("projectBlocks as k", "k.id", "u.blockId")
    .leftJoin("dealers as d", "d.id", "b.dealerId")
    .select(
      "b.*",
      "d.name as dealerName",
      "u.code as unitCode",
      "u.number as unitNumber",
      "u.type as unitType",
      "u.sizeValue",
      "u.sizeUnit",
      "u.price as unitPrice",
      "u.features as unitFeatures",
      "k.name as blockName",
      "p.code as projectCode",
      "p.name as projectName",
      "p.color as projectColor",
      "c.code as contactCode",
      "c.name as contactName",
      "c.phone as contactPhone",
      "c.cnic as contactCnic",
      "c.guardianRelation",
      "c.guardianName",
    )
}

function shape(ctx, b, money, people) {
  const plan = typeof b.plan === "string" ? JSON.parse(b.plan) : b.plan
  return {
    code: b.code,
    stage: b.stage,
    status: b.status,
    kind: b.kind,
    buyer: {
      code: b.contactCode ?? null,
      name: b.contactName ?? b.customerName,
      phone: b.contactPhone ?? b.customerPhone,
      cnic: maskCnic(ctx, b.contactCnic),
      guardian: b.guardianName ? `${b.guardianRelation ?? "S/O"} ${b.guardianName}` : null,
    },
    unit: { code: b.unitCode, number: b.unitNumber, type: b.unitType, sizeValue: Number(b.sizeValue), sizeUnit: b.sizeUnit, block: b.blockName },
    project: { code: b.projectCode, name: b.projectName, color: b.projectColor },
    plan: plan ? { key: plan.key, name: plan.name } : null,
    agreedPrice: Number(b.agreedPrice),
    net: Number(b.netPrice ?? b.agreedPrice),
    tokenAmount: b.tokenAmount == null ? null : Number(b.tokenAmount),
    tokenDueDate: b.tokenDueDate ?? null,
    agent: person(people.get(b.agentId)),
    dealer: b.dealerName ?? null,
    // Sold by someone other than who handles it now (Assignment rules handed it on)
    soldBy: b.soldBy && b.soldBy !== b.agentId ? person(people.get(b.soldBy)) : null,
    soldByMe: b.soldBy === ctx.user.id,
    handledByMe: b.agentId === ctx.user.id,
    allotmentNo: b.allotmentNo ?? null,
    bookedAt: b.bookedAt,
    received: money?.received ?? 0,
    clearing: money?.clearing ?? 0,
    balance: money?.balance ?? Number(b.netPrice ?? b.agreedPrice),
    paidPct: money?.paidPct ?? 0,
    overdueAmount: money?.overdueAmount ?? 0,
    overdueCount: money?.overdueCount ?? 0,
    nextDue: money?.nextDue ?? null,
  }
}

// Bookings with their raw row and payment lines, for reports → [{ booking, row, lines }]
export async function listBookingsWithLines(ctx) {
  const rows = await baseQuery(ctx).orderBy("b.bookedAt", "desc").limit(10000)
  const [money, people] = await Promise.all([ledgerFor(ctx.db, rows), peopleByIds(rows.flatMap((r) => [r.agentId, r.soldBy, r.cancelledBy]))])
  return rows.map((b) => ({ booking: shape(ctx, b, money.get(b.id), people), row: b, lines: money.get(b.id)?.lines ?? [], people }))
}

export async function listBookings(ctx) {
  const rows = await baseQuery(ctx).orderBy("b.bookedAt", "desc").limit(5000)
  const [money, people] = await Promise.all([ledgerFor(ctx.db, rows), peopleByIds(rows.flatMap((r) => [r.agentId, r.soldBy]))])
  return rows.map((b) => shape(ctx, b, money.get(b.id), people))
}

const byCode = (ctx, code) =>
  baseQuery(ctx)
    .where("b.code", String(code ?? "").toUpperCase())
    .first()

// One booking with its schedule, receipts, buyer, nominee and what can be done with it
export async function getBooking(ctx, code) {
  const b = await byCode(ctx, code)
  if (!b) return null
  const [money, receipts, contact, lead, dealer, lists, accounts] = await Promise.all([
    ledgerFor(ctx.db, [b]).then((m) => m.get(b.id)),
    live(ctx.db, "receipts").where({ bookingId: b.id }).orderBy("receivedOn", "desc").orderBy("id", "desc"),
    b.contactId ? live(ctx.db, "contacts").where({ id: b.contactId }).first() : null,
    b.leadId ? ctx.db("leads").where({ id: b.leadId }).first("code") : null,
    b.dealerId ? ctx.db("dealers").where({ id: b.dealerId }).first("code", "name") : null,
    activeListsByProject(ctx),
    live(ctx.db, "accounts").whereIn("kind", ["cash", "bank"]).where({ isActive: true }).orderBy("sortOrder").orderBy("code").select("id", "code", "name", "kind", "bankName", "isDefault"),
  ])
  const [documents, settings, works, agents, commission, dealers] = await Promise.all([
    bookingDocuments(ctx.db, b),
    salesSettings(ctx.db),
    handles(ctx, b),
    // People it can be handed to (sales.reassign)
    ctx.can("edit") && ctx.grant("operations.reassign") ? assignableAgents(ctx) : [],
    // Its commission, for people who may see it (sales.commissions)
    commissionRows(ctx, { bookingIds: [b.id] }).then((r) => r.rows[0] ?? null),
    // Dealers to pick from (who brought the buyer)
    ctx.can("edit") ? live(ctx.db, "dealers").where({ isActive: true }).orderBy("name").select("code", "name") : [],
  ])
  const [people, activity, proofs] = await Promise.all([
    peopleByIds([b.agentId, b.soldBy, b.allottedBy, b.cancelledBy, ...receipts.map((r) => r.createdBy), ...documents.files.map((f) => f.by)]),
    timeline(ctx, b),
    proofsFor(
      ctx.db,
      receipts.map((r) => r.id),
    ),
  ])
  const plan = typeof b.plan === "string" ? JSON.parse(b.plan) : b.plan
  const nominee = typeof b.nominee === "string" ? JSON.parse(b.nominee) : b.nominee
  const list = lists[b.projectCode] ?? null
  return {
    ...shape(ctx, b, money, people),
    plan,
    planStart: b.planStart,
    unitFeatures: (typeof b.unitFeatures === "string" ? JSON.parse(b.unitFeatures) : b.unitFeatures) ?? [],
    listPrice: b.listPrice == null ? Number(b.unitPrice) : Number(b.listPrice),
    planDiscount: Number(b.planDiscount ?? 0),
    extraDiscount: Number(b.extraDiscount ?? 0),
    notes: b.notes ?? "",
    lines: money.lines.map((l) => ({
      id: l.id,
      number: l.number,
      kind: l.kind,
      label: l.label ?? (l.kind === "token" ? "Token" : `Installment ${l.number}`),
      dueDate: l.dueDate,
      amount: l.amount,
      paid: l.paid,
      balance: l.balance,
      state: l.state,
      daysLate: l.daysLate,
    })),
    linesLeft: money.linesLeft,
    receipts: receipts.map((r) => ({
      code: r.code,
      receivedOn: r.receivedOn,
      amount: Number(r.amount),
      method: r.method,
      reference: r.reference,
      chequeNo: r.chequeNo,
      chequeBank: r.chequeBank,
      chequeDate: r.chequeDate,
      status: r.status,
      notes: r.notes ?? "",
      by: person(people.get(r.createdBy)),
      proof: proofs.get(r.id) ?? null,
    })),
    buyerDetails: contact
      ? {
          code: contact.code,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          cnic: maskCnic(ctx, contact.cnic),
          hasCnic: Boolean(contact.cnic),
          guardianRelation: contact.guardianRelation,
          guardianName: contact.guardianName,
          address: contact.address,
          city: contact.city,
        }
      : { code: null, name: b.customerName, phone: b.customerPhone, hasCnic: false },
    nominee: nominee ?? null,
    lead: lead ? { code: lead.code } : null,
    dealer: dealer ? { code: dealer.code, name: dealer.name } : null,
    allotment: b.allotmentNo ? { no: b.allotmentNo, at: b.allottedAt, by: person(people.get(b.allottedBy)) } : null,
    cancellation: b.cancelledAt ? { at: b.cancelledAt, by: person(people.get(b.cancelledBy)), reason: b.cancelReason, deductionPct: Number(b.deductionPct ?? 0), refund: Number(b.refundAmount ?? 0) } : null,
    activity,
    documents: {
      enforce: settings.enforceDocuments,
      checklist: documents.checklist.map((d) => ({ ...d, files: d.files.map((f) => ({ ...f, by: person(people.get(f.by)) })) })),
      files: documents.files.map((f) => ({ ...f, by: person(people.get(f.by)) })),
    },
    deductionPct: settings.deductionPct,
    kycAt: b.kycAt,
    handoverAt: b.handoverAt,
    completedAt: b.completedAt,
    // The project's active price list: plans to choose from and the charges on top
    plans: list?.plans ?? [],
    charges: list?.charges ?? [],
    priceListName: list ? `${list.name} (v${list.version})` : null,
    accounts,
    // works: may work it (handler, their team, or all scope); otherwise they follow it as its seller
    access: { works, seller: b.soldBy === ctx.user.id },
    commission: commission ? { pct: commission.pct, amount: commission.amount, status: commission.commission, partner: commission.partner.name, payout: commission.payout } : null,
    dealers,
    agents: agents.map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl ?? null, team: a.team ?? null })),
  }
}

// Schedule lines that need chasing: overdue, part paid or due within 30 days (open bookings)
export async function listDueLines(ctx) {
  const rows = await baseQuery(ctx).whereNotIn("b.status", ["cancelled", "refunded"]).orderBy("b.bookedAt", "desc")
  const [money, people] = await Promise.all([ledgerFor(ctx.db, rows), peopleByIds(rows.flatMap((r) => [r.agentId, r.soldBy]))])
  return rows.flatMap((b) => {
    const m = money.get(b.id)
    const booking = shape(ctx, b, m, people)
    return m.lines
      .filter((l) => l.balance > 0 && ["overdue", "partial", "due-soon"].includes(l.state))
      .map((l) => ({ id: l.id, label: l.label ?? `Installment ${l.number}`, kind: l.kind, dueDate: l.dueDate, amount: l.amount, balance: l.balance, state: l.state, daysLate: l.daysLate, booking }))
  })
}

// Receipts on bookings this person may see, newest first
export async function listReceipts(ctx) {
  const rows = await scoped(ctx, ctx.db("receipts as r").whereNull("r.deletedAt").join("bookings as b", "b.id", "r.bookingId"), "b")
    .join("units as u", "u.id", "b.unitId")
    .join("projects as p", "p.id", "b.projectId")
    .leftJoin("contacts as c", "c.id", "b.contactId")
    .orderBy("r.receivedOn", "desc")
    .orderBy("r.id", "desc")
    .limit(5000)
    .select("r.*", "b.code as bookingCode", "b.customerName", "c.name as contactName", "u.number as unitNumber", "p.code as projectCode", "p.name as projectName")
  const [people, proofs] = await Promise.all([
    peopleByIds(rows.map((r) => r.createdBy)),
    proofsFor(
      ctx.db,
      rows.map((r) => r.id),
    ),
  ])
  return rows.map((r) => ({
    code: r.code,
    receivedOn: r.receivedOn,
    amount: Number(r.amount),
    method: r.method,
    reference: r.reference,
    chequeNo: r.chequeNo,
    chequeBank: r.chequeBank,
    status: r.status,
    notes: r.notes ?? "",
    by: person(people.get(r.createdBy)),
    proof: proofs.get(r.id) ?? null,
    booking: { code: r.bookingCode, buyer: r.contactName ?? r.customerName, unit: r.unitNumber, project: { code: r.projectCode, name: r.projectName } },
  }))
}

// Bookings a payment can be taken for (open, with something left to pay)
export async function payableBookings(ctx) {
  return (await listBookings(ctx)).filter((b) => !["cancelled", "refunded"].includes(b.status) && b.balance > 0)
}

// Cash and bank accounts money can be received into (Get started › accounts)
export const receivingAccounts = (ctx) =>
  live(ctx.db, "accounts").whereIn("kind", ["cash", "bank"]).where({ isActive: true }).orderBy("sortOrder").orderBy("code").select("id", "code", "name", "kind", "bankName", "isDefault")

// Overview numbers, from the bookings this person may see
export async function salesOverview(ctx) {
  const [bookings, receipts] = await Promise.all([listBookings(ctx), listReceipts(ctx)])
  const now = Date.now()
  const DAY = 86_400_000
  const live30 = bookings.filter((b) => !["cancelled", "refunded"].includes(b.status))
  const inLast = (d, days, from = 0) => d && now - new Date(d).getTime() < days * DAY && now - new Date(d).getTime() >= from * DAY
  const cleared = receipts.filter((r) => r.status === "cleared")
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (5 - i))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    return {
      key,
      label: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d),
      collected: cleared.filter((r) => String(r.receivedOn).slice(0, 7) === key || new Date(r.receivedOn).toISOString().slice(0, 7) === key).reduce((s, r) => s + r.amount, 0),
      booked: bookings.filter((b) => new Date(b.bookedAt).toISOString().slice(0, 7) === key && !["cancelled", "refunded"].includes(b.status)).length,
    }
  })
  const collected30 = cleared.filter((r) => inLast(r.receivedOn, 30)).reduce((s, r) => s + r.amount, 0)
  const collectedPrev = cleared.filter((r) => inLast(r.receivedOn, 60, 30)).reduce((s, r) => s + r.amount, 0)
  const overdue = live30.filter((b) => b.overdueAmount > 0).sort((a, b) => b.overdueAmount - a.overdueAmount)
  const totalNet = live30.reduce((s, b) => s + b.net, 0)
  const totalReceived = live30.reduce((s, b) => s + b.received, 0)
  return {
    tiles: {
      booked30: bookings.filter((b) => inLast(b.bookedAt, 30) && !["cancelled", "refunded"].includes(b.status)).length,
      bookedValue30: bookings.filter((b) => inLast(b.bookedAt, 30) && !["cancelled", "refunded"].includes(b.status)).reduce((s, b) => s + b.net, 0),
      collected30,
      collectedTrend: collectedPrev ? Math.round(((collected30 - collectedPrev) / collectedPrev) * 100) : null,
      overdueAmount: overdue.reduce((s, b) => s + b.overdueAmount, 0),
      overdueBuyers: overdue.length,
      defaulters: live30.filter((b) => b.status === "defaulter").length,
      clearing: receipts.filter((r) => r.status === "clearing").reduce((s, r) => s + r.amount, 0),
      clearingCount: receipts.filter((r) => r.status === "clearing").length,
      receivable: live30.reduce((s, b) => s + b.balance, 0),
    },
    months,
    receivedPct: totalNet ? Math.round((totalReceived / totalNet) * 100) : 0,
    totalNet,
    totalReceived,
    stages: ["token", "booking-kyc", "active", "handover", "completed"].map((stage) => ({ stage, count: live30.filter((b) => b.stage === stage).length })),
    mostOverdue: overdue.slice(0, 6),
    recent: bookings.slice(0, 6),
    total: bookings.length,
  }
}

// Units that can be booked from Sales: available or on hold, in a project with an active price
// list that has payment plans. Each with its project's plans and charges.
export async function bookableUnits(ctx) {
  const lists = await activeListsByProject(ctx)
  const projectCodes = Object.keys(lists).filter((c) => lists[c].plans.length)
  if (!projectCodes.length) return []
  const rows = await ctx
    .db("units as u")
    .whereNull("u.deletedAt")
    .whereIn("u.status", ["available", "on-hold"])
    .join("projects as p", "p.id", "u.projectId")
    .whereIn("p.code", projectCodes)
    .leftJoin("projectBlocks as k", "k.id", "u.blockId")
    .orderBy("p.name")
    .orderBy("u.number")
    .limit(3000)
    .select("u.code", "u.number", "u.type", "u.sizeValue", "u.sizeUnit", "u.price", "u.status", "k.name as block", "p.code as projectCode", "p.name as projectName", "p.color as projectColor")
  return rows.map((u) => ({
    code: u.code,
    number: u.number,
    type: u.type,
    sizeValue: Number(u.sizeValue),
    sizeUnit: u.sizeUnit,
    price: Number(u.price),
    status: u.status,
    block: u.block,
    project: { code: u.projectCode, name: u.projectName, color: u.projectColor },
    plans: lists[u.projectCode].plans,
  }))
}
