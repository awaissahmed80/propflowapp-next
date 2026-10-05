"use server"

import { z } from "zod"
import { platformDb } from "@/server/db/connections"
import { requireStaff } from "@/server/auth/dal"
import { can } from "@/modules/console/roles"
import { DYNAMIC_PRICING_KEY, PRICING_MODE_KEY, mergeDynamicPricing } from "@/modules/web/dynamic-pricing"
import { getDynamicPricing } from "@/server/dynamic-pricing"
import { logAudit } from "./audit"

// Console › Dynamic Pricing: switch the website between the plans and the
// package builder, and set the base fee, users included, price per extra user and per app.
// Owner, admin and finance (Plans & Pricing); every change goes to the audit log.

const money = z.coerce.number().int("Whole rupees.").min(0, "Can't be negative.").max(10_000_000)
const schema = z.object({
  mode: z.enum(["plans", "dynamic"]),
  baseMonthly: money,
  baseUsers: z.coerce.number().int().min(1, "At least 1 user.").max(1000),
  userPrice: money,
  maxUsers: z.coerce.number().int().min(1).max(10_000),
  baseApps: z.array(z.string().max(30)).max(30),
  appPrices: z.record(z.string().max(30), money),
})

// → { ok } | { error } | { fieldErrors }
export async function saveDynamicPricing(input) {
  const staff = await requireStaff("/pricing")
  if (!can(staff.role, "plans")) return { error: "Only the owner, an administrator or finance can change pricing." }
  const parsed = schema.safeParse(input ?? {})
  if (!parsed.success) return { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) }
  const v = parsed.data
  if (v.maxUsers < v.baseUsers) return { fieldErrors: { maxUsers: "At least the users included in the base." } }
  const { catalog, mode: before } = await getDynamicPricing()
  const codes = catalog.map((a) => a.code)
  const baseApps = v.baseApps.filter((c) => codes.includes(c))
  // Every app outside the base needs a price to be offered
  const appPrices = Object.fromEntries(codes.filter((c) => !baseApps.includes(c)).map((c) => [c, v.appPrices[c] ?? 0]))
  if (v.mode === "dynamic" && !Object.keys(appPrices).length) return { error: "Leave at least one app outside the base, with a price." }
  const pricing = mergeDynamicPricing({ ...v, baseApps, appPrices })
  const db = platformDb()
  const now = new Date()
  for (const [key, value] of [
    [PRICING_MODE_KEY, v.mode],
    [DYNAMIC_PRICING_KEY, pricing],
  ])
    await db("settings")
      .insert({ key, value: JSON.stringify(value), updatedAt: now, updatedBy: staff.user.id })
      .onConflict("key")
      .merge(["value", "updatedAt", "updatedBy"])
  await logAudit({
    actorUserId: staff.user.id,
    action: "pricing.dynamic",
    details: { summary: before !== v.mode ? `Website pricing: ${v.mode === "dynamic" ? "dynamic (build your own package)" : "plans"}` : "Changed dynamic pricing", mode: v.mode, pricing },
  })
  return { ok: true }
}
