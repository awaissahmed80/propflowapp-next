import "server-only"
import { logActivity } from "@/server/tenants/activity"
import { ENTITIES } from "../entities"

// Import engine, the same for every kind of data. An importer:
//   prepare(ctx, options) → prep (lists, maps, counters loaded once)
//   check(prep, record) → { data, errors: [], warnings: [], label } (no writes)
//   match(prep, data) → the existing record it is, or null
//   create(prep, data) / update(prep, existing, data) → writes one row (own transaction)
// record: { fieldKey: cell text } from the file's columns as mapped.

// File rows + mapping { fieldKey: columnIndex } → records
export function toRecords(entity, rows, mapping) {
  return rows.map((r) => Object.fromEntries(entity.fields.filter((f) => mapping[f.key] != null && mapping[f.key] >= 0).map((f) => [f.key, r[mapping[f.key]] ?? ""])))
}

// Look at every row without saving → { counts, rows: [{ row, label, status, errors, warnings }] }
//   status: new | match (skip or update) | error
export async function previewRows(importer, prep, records) {
  const out = []
  const counts = { new: 0, match: 0, error: 0 }
  for (let i = 0; i < records.length; i++) {
    const c = await importer.check(prep, records[i])
    const status = c.errors.length ? "error" : (await importer.match(prep, c.data)) ? "match" : "new"
    counts[status] += 1
    importer.remember?.(prep, c.data, status)
    out.push({ row: i + 2, label: c.label, status, errors: c.errors, warnings: c.warnings })
  }
  return { counts, rows: out }
}

// Save → { created, updated, skipped, failed, errors: [{ row, label, errors }] }
//   mode: "skip" leaves matches as they are, "update" fills their empty fields (importer decides)
export async function runRows(importer, prep, records, mode) {
  const result = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] }
  for (let i = 0; i < records.length; i++) {
    const c = await importer.check(prep, records[i])
    if (c.errors.length) {
      result.failed += 1
      result.errors.push({ row: i + 2, label: c.label, errors: c.errors })
      continue
    }
    try {
      const existing = await importer.match(prep, c.data)
      if (existing && mode !== "update") result.skipped += 1
      else if (existing) {
        const changed = await importer.update(prep, existing, c.data)
        result[changed === false ? "skipped" : "updated"] += 1
      } else {
        await importer.create(prep, c.data)
        result.created += 1
      }
      importer.remember?.(prep, c.data, existing ? "match" : "new")
    } catch (err) {
      console.error(`Import ${importer.key} row ${i + 2}:`, err)
      result.failed += 1
      result.errors.push({ row: i + 2, label: c.label, errors: [err.publicMessage ?? "Couldn't save this row."] })
    }
  }
  await importer.finish?.(prep)
  return result
}

// Save the import in the log (and the workspace's activity)
export async function logImport(ctx, entityKey, { fileName, mode, options, total, result }) {
  const e = ENTITIES[entityKey]
  const [id] = await ctx.db("dataImports").insert({
    entity: entityKey,
    fileName: fileName?.slice(0, 200) ?? null,
    mode,
    options: options ? JSON.stringify(options) : null,
    total,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: result.failed,
    errors: result.errors.length ? JSON.stringify(result.errors.slice(0, 1000)) : null,
    createdBy: ctx.user.id,
  })
  await logActivity(ctx.db, {
    type: e.app,
    action: "data.imported",
    actorUserId: ctx.user.id,
    summary: `imported ${result.created} ${result.created === 1 ? e.one : e.label.toLowerCase()}${result.updated ? `, updated ${result.updated}` : ""}${fileName ? ` from ${fileName}` : ""}`,
  })
  return id
}

// An error worth showing to the importer as it is
export const rowError = (message) => Object.assign(new Error(message), { publicMessage: message })
