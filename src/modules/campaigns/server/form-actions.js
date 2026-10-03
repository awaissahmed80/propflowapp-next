"use server"

import { z } from "zod"
import { live } from "@/server/db/records"
import { logActivity } from "@/server/tenants/activity"
import { FIELD_TYPES } from "../constants"
import { campaignsAction } from "./context"
import { createFormRow, publicForm, submitEntry } from "./forms"

// Lead forms in the app: add, change (fields and settings), pause / accept entries, and send a
// test entry from the builder (it becomes a real lead, marked as a test)

const ref = (table) => async (ctx, code) =>
  code
    ? live(ctx.db, table)
        .where({ code: String(code).toUpperCase() })
        .first("id")
    : null
const campaignRef = ref("campaigns")
const projectRef = ref("projects")

// → { ok, code } | { error } | { fieldErrors }
export async function createForm({ name, campaign, project } = {}) {
  const { ctx, error } = await campaignsAction("create")
  if (error) return { error }
  const n = String(name ?? "").trim()
  if (n.length < 2) return { fieldErrors: { name: "Give the form a name." } }
  const [c, p] = await Promise.all([campaignRef(ctx, campaign), projectRef(ctx, project)])
  if (campaign && !c) return { fieldErrors: { campaign: "That campaign was removed." } }
  // A campaign's project, unless one was picked
  const projectId = p?.id ?? (c ? ((await live(ctx.db, "campaigns").where({ id: c.id }).first("projectId"))?.projectId ?? null) : null)
  let code
  await ctx.db.transaction(async (trx) => {
    code = await createFormRow(trx, { name: n.slice(0, 150), campaignId: c?.id ?? null, projectId, userId: ctx.user.id })
  })
  await logActivity(ctx.db, { type: "campaigns", action: "form.created", actorUserId: ctx.user.id, summary: `added the lead form ${n} (${code})` })
  return { ok: true, code }
}

const fieldSchema = z.object({
  id: z.string().trim().min(1).max(40),
  type: z.enum(Object.keys(FIELD_TYPES)),
  label: z.string().trim().min(1, "Every question needs a label.").max(200),
  required: z.boolean().optional().default(false),
  placeholder: z.string().trim().max(120).optional().nullable(),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  mapTo: z.enum(["size", "unitType", "budget", "paymentPlan", "overseas", "notes"]).optional().nullable(),
})
const formSchema = z.object({
  name: z.string().trim().min(2, "Give the form a name.").max(150),
  campaign: z.string().trim().max(20).optional().nullable(),
  project: z.string().trim().max(30).optional().nullable(),
  fields: z.array(fieldSchema).min(2).max(40),
  settings: z.object({
    title: z.string().trim().max(150).optional().default(""),
    intro: z.string().trim().max(500).optional().default(""),
    submitLabel: z.string().trim().max(40).optional().default("Send"),
    successMessage: z.string().trim().max(500).optional().default(""),
    whatsapp: z.string().trim().max(30).optional().default(""),
    redirectUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !v || /^https?:\/\//i.test(v), "Use a full address starting with https://")
      .optional()
      .default(""),
    accent: z.string().trim().max(20).optional().default("blue"),
    channel: z.string().trim().max(40).optional().default(""),
    assignTo: z.string().trim().max(20).optional().default(""),
  }),
})

// Save the builder → { ok } | { error } | { fieldErrors }
export async function saveForm(code, input) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const parsed = formSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  if (!v.fields.some((f) => f.type === "name") || !v.fields.some((f) => f.type === "phone")) return { error: "A form needs its name and mobile questions." }
  if (v.fields.some((f) => FIELD_TYPES[f.type].options && !f.options?.length)) return { error: "Dropdowns and choices need at least one option." }
  const f = await live(ctx.db, "leadForms")
    .where({ code: String(code).toUpperCase() })
    .first("id")
  if (!f) return { error: "That form was removed." }
  const [c, p] = await Promise.all([campaignRef(ctx, v.campaign), projectRef(ctx, v.project)])
  // Name and mobile are always required
  const fields = v.fields.map((x) => (["name", "phone"].includes(x.type) ? { ...x, required: true } : x))
  await ctx
    .db("leadForms")
    .where({ id: f.id })
    .update({ name: v.name, campaignId: c?.id ?? null, projectId: p?.id ?? null, fields: JSON.stringify(fields), settings: JSON.stringify(v.settings), updatedAt: new Date(), updatedBy: ctx.user.id })
  return { ok: true }
}

// Pause it or accept entries again → { ok } | { error }
export async function setFormStatus(code, status) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  if (!["active", "paused"].includes(status)) return { error: "Unknown status." }
  const n = await ctx
    .db("leadForms")
    .where({ code: String(code).toUpperCase() })
    .whereNull("deletedAt")
    .update({ status, updatedAt: new Date(), updatedBy: ctx.user.id })
  return n ? { ok: true } : { error: "That form was removed." }
}

// A test entry from the builder's preview → { ok, duplicate } | { fieldErrors } | { error }
export async function testFormEntry(code, values) {
  const { ctx, error } = await campaignsAction("edit")
  if (error) return { error }
  const form = await publicForm(ctx.db, code)
  if (!form) return { error: "That form was removed." }
  return submitEntry({ db: ctx.db, tenant: ctx.tenant }, form, values ?? {}, { test: true, by: ctx.user.id })
}
