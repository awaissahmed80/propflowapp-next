import "server-only"
import { z } from "zod"
import { live } from "@/server/db/records"
import { nextCode } from "@/server/db/numbering"
import { logActivity } from "@/server/tenants/activity"
import { notify } from "@/server/notifications"
import { getLookups, isLookupValue } from "@/modules/lookups/server"
import { postCommissionPayout } from "@/modules/finance/server/posting"
import { bookingEvent } from "./activity"
import { commissionRows } from "./commissions"

// Paying commission, shared by Operations › Commissions (people who can pay) and Approvals (a
// request approved by someone who can): check what's asked, then pay one payout per partner.

const rs = (n) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.round(n))}`
const payable = (rows, codes) => rows.filter((r) => codes.includes(r.code))

const paySchema = z.object({
  bookings: z.array(z.string().trim().min(1)).min(1, "Pick at least one booking.").max(500),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date."),
  method: z.string().trim().min(1, "Pick how it was paid."),
  account: z.string().trim().max(40).optional().nullable(),
  reference: z.string().trim().max(120).optional().default(""),
  whtPct: z.coerce.number().min(0, "0% or more.").max(50, "At most 50%."),
  notes: z.string().trim().max(500).optional().default(""),
})

// Check a payout request against what this person can see → { v, account, groups } | { error } | { fieldErrors }
export async function prepareCommissionPayout(ctx, input) {
  const parsed = paySchema.safeParse(input)
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) }
  const v = parsed.data
  if (!isLookupValue((await getLookups(ctx.db, ["payment-method"]))["payment-method"], v.method)) return { fieldErrors: { method: "Pick how it was paid." } }
  const account = v.account ? await live(ctx.db, "accounts").where({ code: v.account }).whereIn("kind", ["cash", "bank"]).first("id") : null
  if (v.account && !account) return { fieldErrors: { account: "Pick the account it was paid from." } }

  const codes = [...new Set(v.bookings.map((c) => c.toUpperCase()))]
  const { rows } = await commissionRows(ctx)
  const chosen = payable(rows, codes)
  if (chosen.length !== codes.length) return { error: "Some of those bookings aren't yours to pay. Reload and try again." }
  const notReady = chosen.find((r) => r.commission !== "payable")
  if (notReady) return { error: `${notReady.code} isn't payable (${notReady.commission === "paid" ? "already paid" : notReady.commission === "pending" ? "still waiting" : "canceled"}).` }

  // One payout per partner
  const groups = new Map()
  for (const r of chosen) groups.set(r.partner.key, [...(groups.get(r.partner.key) ?? []), r])
  return { v, account, groups, gross: chosen.reduce((s, r) => s + r.amount, 0), count: chosen.length }
}

// Pay a prepared payout: one per partner, posted to Finance → { ok, codes }
export async function executeCommissionPayout(ctx, { v, account, groups }) {
  const made = []
  const now = new Date()
  await ctx.db.transaction(async (trx) => {
    for (const list of groups.values()) {
      const partner = list[0].partner
      const gross = list.reduce((s, r) => s + r.amount, 0)
      const whtPct = partner.type === "dealer" ? v.whtPct : 0
      const wht = Math.round((gross * whtPct) / 100)
      const code = await nextCode(trx, "commission-payout")
      const [id] = await trx("commissionPayouts").insert({
        code,
        partnerType: partner.type,
        dealerId: partner.dealerId ?? null,
        userId: partner.userId ?? null,
        paidOn: v.paidOn,
        method: v.method,
        accountId: account?.id ?? null,
        reference: v.reference || null,
        gross,
        whtPct,
        wht,
        net: gross - wht,
        notes: v.notes || null,
        createdBy: ctx.user.id,
        createdAt: now,
      })
      await trx("commissionPayoutItems").insert(list.map((r) => ({ payoutId: id, bookingId: r.bookingId, amount: r.amount, pct: r.pct })))
      await postCommissionPayout(trx, ctx, id)
      for (const r of list) await bookingEvent(trx, ctx, r.bookingId, "commission", `Commission ${rs(r.amount)} paid to ${partner.name} (${code})`)
      if (partner.type === "agent" && partner.userId)
        await notify(trx, [partner.userId], {
          app: "operations",
          kind: "commission.paid",
          title: `Commission paid · ${rs(gross - wht)}`,
          body: `${list.length} ${list.length === 1 ? "booking" : "bookings"} (${code})`,
          href: "/operations/commissions?tab=payouts",
          icon: "percent-line",
          by: ctx.user.id,
        })
      made.push(code)
    }
  })
  await logActivity(ctx.db, { type: "operations", action: "commission.paid", actorUserId: ctx.user.id, summary: `paid commission (${made.join(", ")})` })
  return { ok: true, codes: made }
}
