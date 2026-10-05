"use server"

import { z } from "zod"
import { peopleByIds } from "@/modules/users/server/queries"
import { crmAction } from "@/modules/crm/server/context"
import { contactsAction } from "@/modules/contacts/server/context"
import { estateAction } from "@/modules/portfolio/server/context"
import { hrAction } from "@/modules/hr/server/context"
import { assignableAgents } from "@/modules/crm/server/queries"
import { listRules } from "@/modules/crm/server/assignment"
import { getLookups } from "@/modules/lookups/server"
import { ENTITIES, MAX_IMPORT_ROWS } from "../entities"
import { logImport, previewRows, runRows, toRecords } from "./engine"
import { leadsImporter } from "./leads"
import { activitiesImporter } from "./activities"
import { contactsImporter } from "./contacts"
import { unitsImporter } from "./units"
import { employeesImporter } from "./employees"
import { exporters } from "./exporters"

// Import & export (lists' Import / Export menu, Settings › Import & Export). Each kind of data uses
// its own app's permissions: import needs create (and edit to update existing records), export
// needs export. Rows arrive already read from the file in the browser.

const IMPORTERS = { leads: leadsImporter, activities: activitiesImporter, contacts: contactsImporter, units: unitsImporter, employees: employeesImporter }
const ACTION = { leads: crmAction, activities: crmAction, contacts: contactsAction, units: estateAction, employees: hrAction }

async function access(entity, action) {
  const e = ENTITIES[entity]
  if (!e || !ACTION[entity]) return { error: "Unknown data." }
  const { ctx, error } = await ACTION[entity](action)
  if (error) return { error }
  return { ctx, e }
}

const payload = z.object({
  rows: z
    .array(z.array(z.string().max(5000)))
    .min(1, "The file has no rows.")
    .max(MAX_IMPORT_ROWS, `At most ${MAX_IMPORT_ROWS} rows at a time.`),
  mapping: z.record(z.string(), z.number().int().min(-1)),
  options: z.record(z.string(), z.any()).optional().default({}),
  mode: z.enum(["skip", "update"]).optional().default("skip"),
  fileName: z.string().max(200).optional().nullable(),
})

// What the import dialog needs for its choices → { ok, options } | { error }
//   leads: agents and assignment rules · contacts: contact types · employees: whether pay is taken
export async function importSetup(entity) {
  const { ctx, error } = await access(entity, "create")
  if (error) return { error }
  if (entity === "leads") {
    const [agents, rules] = await Promise.all([assignableAgents(ctx), listRules(ctx.db)])
    return {
      ok: true,
      options: { agents: agents.map((a) => ({ value: String(a.id), label: a.name })), rules: rules.filter((r) => r.active).map((r) => ({ value: String(r.id), label: r.name })), canReassign: Boolean(ctx.canReassign) },
    }
  }
  if (entity === "contacts") {
    const types = (await getLookups(ctx.db, ["contact-type"]))["contact-type"].filter((t) => t.isActive)
    return { ok: true, options: { types: types.map((t) => ({ value: t.value, label: t.label })) } }
  }
  if (entity === "employees") return { ok: true, options: { salaries: Boolean(ctx.grant?.("hr.salaries")) } }
  return { ok: true, options: {} }
}

// Assigning to someone else needs crm.reassign; without it leads go to the importer
function leadOptions(ctx, options) {
  const assign = options.assign ?? { mode: "rules" }
  if (!ctx.canReassign && assign.mode !== "none") return { ...options, assign: { mode: "agent", agentId: ctx.user.id } }
  return options
}

// Check every row without saving → { ok, counts, rows } | { error }
export async function previewImport(entity, input) {
  const { ctx, e, error } = await access(entity, "create")
  if (error) return { error }
  const parsed = payload.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const importer = IMPORTERS[entity]
  const options = entity === "leads" ? leadOptions(ctx, v.options) : v.options
  const prep = await importer.prepare(ctx, { ...options, fileName: v.fileName })
  const result = await previewRows(importer, prep, toRecords(e, v.rows, v.mapping))
  // Only the first 300 rows' details go back; the counts cover them all
  const detail = [
    ...result.rows.filter((r) => r.status === "error"),
    ...result.rows.filter((r) => r.status !== "error" && r.warnings.length),
    ...result.rows.filter((r) => r.status !== "error" && !r.warnings.length),
  ].slice(0, 300)
  return { ok: true, counts: result.counts, warnings: result.rows.filter((r) => r.warnings.length).length, rows: detail }
}

// Save → { ok, result } | { error }
export async function runImport(entity, input) {
  const parsed = payload.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const { ctx, e, error } = await access(entity, "create")
  if (error) return { error }
  if (v.mode === "update") {
    const edit = await access(entity, "edit")
    if (edit.error) return { error: "Your role can't change existing records: choose “Skip them” instead." }
  }
  const importer = IMPORTERS[entity]
  const options = entity === "leads" ? leadOptions(ctx, v.options) : v.options
  const prep = await importer.prepare(ctx, { ...options, fileName: v.fileName })
  const result = await runRows(importer, prep, toRecords(e, v.rows, v.mapping), v.mode)
  await logImport(ctx, entity, { fileName: v.fileName, mode: v.mode, options: entity === "leads" ? { assign: options.assign } : options, total: v.rows.length, result })
  return { ok: true, result: { ...result, errors: result.errors.slice(0, 1000) } }
}

// Everything this person may see → { ok, headers, rows } | { error }
export async function exportData(entity) {
  const { ctx, error } = await access(entity, "export")
  if (error) return { error: error.includes("export") ? error : "Your role can't export this." }
  const out = await exporters[entity](ctx)
  return { ok: true, ...out }
}

// The workspace's imports, newest first (only the kinds this person can open)
export async function importHistory() {
  const kinds = []
  for (const key of Object.keys(IMPORTERS)) if (!(await access(key, "view")).error) kinds.push(key)
  if (!kinds.length) return { ok: true, list: [] }
  const { ctx } = await access(kinds[0], "view")
  const rows = await ctx.db("dataImports").whereIn("entity", kinds).orderBy("id", "desc").limit(100)
  const people = await peopleByIds(rows.map((r) => r.createdBy))
  return {
    ok: true,
    list: rows.map((r) => ({
      id: r.id,
      entity: r.entity,
      fileName: r.fileName,
      mode: r.mode,
      total: r.total,
      created: r.created,
      updated: r.updated,
      skipped: r.skipped,
      failed: r.failed,
      errors: typeof r.errors === "string" ? JSON.parse(r.errors) : (r.errors ?? []),
      by: people.get(r.createdBy)?.name ?? null,
      at: r.createdAt,
    })),
  }
}
