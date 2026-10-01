"use server"

import { z } from "zod"
import { requireTenant } from "@/server/auth/dal"
import { tenantDb } from "@/server/db/connections"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { can, isFullAccess } from "@/modules/users/permissions"
import { normalizeHex } from "@/lib/color"
import { LOOKUP_COLORS, lookupList, slugify } from "./catalog"

// Lists & Labels: save or reset one list. Whoever can edit the list's app (or has full access)
// may change it. System lists: relabel, recolour, reorder only. Custom lists: also add values,
// switch them off, and delete values the workspace added. Values that came with PropFlow are
// never deleted, so older records keep their label.

// actions: what the person must be able to do in the list's app (editing the list: edit; adding
// a value from a form: edit or create)
async function listEditor(key, usingApp, actions = ["edit"]) {
  const list = lookupList(key)
  if (!list) return { error: "Unknown list." }
  const s = await requireTenant("/")
  const db = tenantDb({ dbName: s.tenant.dbName, dbHost: s.tenant.dbHost })
  const role = await live(db, "roles").where({ id: s.membership.roleId }).first("permissions")
  const permissions = role?.permissions ?? []
  // General lists (cities…) belong to Settings
  // General lists (cities…) belong to Settings, or to the app someone is adding from
  const app = list.app === "general" ? (usingApp ?? "settings") : list.app
  if (!isFullAccess(permissions) && !actions.some((a) => can(permissions, app, a))) return { error: "Your role can't change these lists. Ask an administrator." }
  return { list, db, user: s.user }
}

const valuesSchema = z
  .array(
    z.object({
      value: z.string().trim().min(1).max(60),
      label: z.string().trim().min(1, "Every value needs a label.").max(120, "Keep labels under 120 characters."),
      // Hex from the colour picker (older lists may still hold a colour name)
      color: z
        .string()
        .nullable()
        .optional()
        .refine((c) => !c || LOOKUP_COLORS.includes(c) || normalizeHex(c), "Pick a colour.")
        .transform((c) => (c && !LOOKUP_COLORS.includes(c) ? normalizeHex(c) : c)),
      icon: z.string().trim().max(40).regex(/^[a-z0-9-]*$/, "Icon names use lowercase letters, digits and dashes, e.g. home-4-line.").nullable().optional(),
      meta: z.record(z.string(), z.unknown()).nullable().optional(),
      active: z.boolean().default(true),
      // The value forms preselect (lists that allow one)
      preselected: z.boolean().optional().default(false),
    })
  )
  .max(300)

// values: the whole list in order → { ok } or { error }
export async function saveLookupList(key, input) {
  const { list, db, user, error } = await listEditor(key)
  if (error) return { error }
  const parsed = valuesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const values = parsed.data
  const system = list.kind === "system"

  const labels = values.map((v) => v.label.toLowerCase())
  const dup = labels.find((l, i) => labels.indexOf(l) !== i)
  if (dup) return { error: `"${values.find((v) => v.label.toLowerCase() === dup).label}" is in the list twice.` }

  const existing = await live(db, "lookups").where({ listKey: key }).select("id", "value", "isDefault")
  const byValue = new Map(existing.map((r) => [r.value, r]))
  const sent = new Set(values.map((v) => v.value))
  if (sent.size !== values.length) return { error: "Two values have the same key. Reload and try again." }

  const removed = existing.filter((r) => !sent.has(r.value))
  if (removed.some((r) => r.isDefault)) return { error: "Values that came with PropFlow can't be deleted. Switch them off instead." }
  const added = values.filter((v) => !byValue.has(v.value))
  if (system && (added.length || removed.length)) return { error: "This list is used by the app: values can be renamed and reordered, not added or removed." }
  if (!values.some((v) => v.active || system)) return { error: "Keep at least one value switched on." }
  const preselected = list.defaultable ? values.filter((v) => v.preselected) : []
  if (preselected.length > 1) return { error: "Pick one default value." }
  if (preselected[0] && !preselected[0].active && !system) return { error: `${preselected[0].label} is switched off, so it can't be the default.` }

  // Extra fields (premium %, plural…): only the list's own, in range
  const cleanMeta = (meta = {}) => {
    const out = {}
    for (const f of list.fields ?? []) {
      const raw = meta?.[f.key]
      if (f.type === "select") {
        if (f.options.some((o) => o.value === raw)) out[f.key] = raw
      } else if (f.type === "number") {
        const n = Number(raw)
        if (raw !== null && raw !== undefined && raw !== "" && Number.isFinite(n)) out[f.key] = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n))
      } else if (typeof raw === "string" && raw.trim()) out[f.key] = raw.trim().slice(0, f.maxLength ?? 60)
    }
    return Object.keys(out).length ? out : null
  }

  const now = new Date()
  await db.transaction(async (trx) => {
    for (const [i, v] of values.entries()) {
      const meta = cleanMeta(v.meta)
      const row = {
        label: v.label,
        color: list.colored ? (v.color ?? "#64748b") : null,
        icon: list.icons ? v.icon || null : null,
        meta: meta ? JSON.stringify(meta) : null,
        isActive: system ? true : v.active,
        isPreselected: Boolean(list.defaultable && v.preselected),
        sortOrder: (i + 1) * 10,
      }
      const current = byValue.get(v.value)
      if (current) await trx("lookups").where({ id: current.id }).update({ ...row, updatedAt: now, updatedBy: user.id })
      else await trx("lookups").insert({ ...row, listKey: key, value: v.value, isDefault: false, createdBy: user.id })
    }
    if (removed.length) await trx("lookups").whereIn("id", removed.map((r) => r.id)).update({ deletedAt: now, deletedBy: user.id })
  })
  await logActivity(db, { type: "lists", action: "lookups.saved", actorUserId: user.id, summary: `updated the ${list.name.toLowerCase()} list`, details: { list: key, added: added.length, removed: removed.length } })
  return { ok: true }
}

// Back to the values PropFlow ships with: their labels, colours, order and on. Values the
// workspace added are switched off (not deleted), so records using them keep their label.
export async function resetLookupList(key) {
  const { list, db, user, error } = await listEditor(key)
  if (error) return { error }
  const existing = await live(db, "lookups").where({ listKey: key }).select("id", "value")
  const now = new Date()
  await db.transaction(async (trx) => {
    for (const [i, d] of list.values.entries()) {
      const row = { label: d.label, color: d.color ?? null, icon: d.icon ?? null, meta: d.meta ? JSON.stringify(d.meta) : null, isActive: true, isPreselected: d.value === list.defaultValue, sortOrder: (i + 1) * 10 }
      const current = existing.find((r) => r.value === d.value)
      if (current) await trx("lookups").where({ id: current.id }).update({ ...row, isDefault: true, updatedAt: now, updatedBy: user.id })
      else await trx("lookups").insert({ ...row, listKey: key, value: d.value, isDefault: true, createdBy: user.id })
    }
    const extra = existing.filter((r) => !list.values.some((d) => d.value === r.value))
    for (const [i, r] of extra.entries()) await trx("lookups").where({ id: r.id }).update({ isActive: false, isPreselected: false, sortOrder: (list.values.length + i + 1) * 10, updatedAt: now, updatedBy: user.id })
  })
  await logActivity(db, { type: "lists", action: "lookups.reset", actorUserId: user.id, summary: `reset the ${list.name.toLowerCase()} list to the defaults` })
  return { ok: true }
}

// Add a value to a custom list straight from a form ("+ Add “Survey report”"), without opening
// Lists & Labels. Same permission as editing the list (for general lists like cities: edit in
// the app the person is working in). A name already in the list (any capitals) is reused; a
// switched-off one is switched back on. → { ok, value, label } or { error }
export async function addLookupValue(key, rawLabel, { app } = {}) {
  const { list, db, user, error } = await listEditor(key, app, ["edit", "create"])
  if (error) return { error }
  if (list.kind !== "custom") return { error: `${list.name} can't be added to; pick from the list.` }
  const label = String(rawLabel ?? "").trim().replace(/\s+/g, " ")
  if (label.length < 1 || label.length > 120) return { error: "Keep it under 120 characters." }

  const rows = await db("lookups").where({ listKey: key }).select("id", "value", "label", "isActive", "deletedAt", "sortOrder")
  const same = rows.find((r) => !r.deletedAt && r.label.toLowerCase() === label.toLowerCase())
  if (same) {
    if (!same.isActive) await db("lookups").where({ id: same.id }).update({ isActive: true, updatedAt: new Date(), updatedBy: user.id })
    return { ok: true, value: same.value, label: same.label }
  }
  const taken = new Set(rows.map((r) => r.value))
  const base = list.valueIsLabel ? label.slice(0, 60) : slugify(label) || "value"
  let value = base
  for (let n = 2; taken.has(value); n++) value = `${base}-${n}`
  const order = Math.max(0, ...rows.filter((r) => !r.deletedAt).map((r) => r.sortOrder)) + 10
  await db("lookups").insert({ listKey: key, value, label, color: list.colored ? "#64748b" : null, isDefault: false, isActive: true, sortOrder: order, createdBy: user.id })
  await logActivity(db, { type: "lists", action: "lookups.value_added", actorUserId: user.id, summary: `added “${label}” to ${list.name.toLowerCase()}`, details: { list: key, value } })
  return { ok: true, value, label }
}
