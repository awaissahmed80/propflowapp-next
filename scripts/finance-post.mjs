// Post what the other apps recorded before Finance existed: bookings, payments, cheques,
// cancellations, commission payouts and Estate Management fees. Each event posts once, so it's
// safe to run again (only what's missing is posted).
//
//   yarn finance:post              every workspace
//   yarn finance:post TEN00001     one workspace
//   yarn finance:post --dry-run    count what would be posted
import { registerHooks } from "node:module"
import nextEnv from "@next/env"
import { resolve } from "./lib/app-imports.mjs"

registerHooks({ resolve })
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production")

const { platformDb, tenantDb, closeAll } = await import("../src/server/db/connections.js")
const posting = await import("../src/modules/finance/server/posting.js")

const args = process.argv.slice(2)
const dry = args.includes("--dry-run")
const only = args.find((a) => !a.startsWith("--"))
const ctx = { user: null }

try {
  let q = platformDb()("tenants").whereNull("deletedAt").whereNot({ status: "provisioning" })
  if (only) q = q.where({ code: only.toUpperCase() })
  for (const t of await q.select("code", "name", "dbName", "dbHost")) {
    const db = tenantDb({ dbName: t.dbName, dbHost: t.dbHost })
    if (!(await db.schema.hasTable("vouchers"))) {
      console.log(`- ${t.code}: run yarn tenant:migrate first`)
      continue
    }
    const count = { sale: 0, received: 0, cleared: 0, bounced: 0, cancelled: 0, commission: 0, fee: 0 }
    const run = async (key, fn) => {
      if (dry) return
      const out = await db.transaction((trx) => fn(trx))
      if (out) count[key]++
    }
    const bookings = await db("bookings").whereNull("deletedAt").orderBy("id").select("id", "status")
    for (const b of bookings) await run("sale", (trx) => posting.postBookingSale(trx, ctx, b.id))
    // Payments: in clearing at first when they were cheques or pay orders, then what happened to them
    const receipts = await db("receipts").whereNull("deletedAt").orderBy("receivedOn").select("id", "method", "status", "clearedAt", "bouncedAt")
    for (const r of receipts) {
      const waited = ["cheque", "pay-order"].includes(r.method)
      await run("received", (trx) => posting.postReceipt(trx, ctx, r.id, { clearing: waited }))
      if (waited && r.status === "cleared") await run("cleared", (trx) => posting.postReceiptStatus(trx, ctx, r.id, "cleared"))
      if (r.status === "bounced") await run("bounced", (trx) => posting.postReceiptStatus(trx, ctx, r.id, "bounced"))
    }
    for (const b of bookings.filter((x) => ["cancelled", "refunded"].includes(x.status))) await run("cancelled", (trx) => posting.postCancellation(trx, ctx, b.id))
    for (const p of await db("commissionPayouts").whereNull("deletedAt").orderBy("id").select("id")) await run("commission", (trx) => posting.postCommissionPayout(trx, ctx, p.id))
    for (const r of await db("serviceRequests").whereNull("deletedAt").whereNotNull("fee").select("id")) await run("fee", (trx) => posting.postServiceFee(trx, ctx, r.id))
    console.log(dry ? `- ${t.code}: ${bookings.length} bookings, ${receipts.length} payments to check` : `✓ ${t.code} ${t.name}: posted ${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}`)
  }
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await closeAll()
}
