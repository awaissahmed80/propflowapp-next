import "server-only"
import { live } from "@/server/db/records"
import { getLookups } from "@/modules/lookups/server"
import { activeList, withListPremiums } from "@/modules/portfolio/server/price-list-queries"
import { figures, sizeError, unitCodes, workspaceMeasures } from "@/modules/portfolio/server/unit-build"
import * as V from "../values"

// Units import (Project Portfolio inventory), like Inventory › Add units one row at a time: the
// project (code or name), phase (optional when the project has one) and block must exist; the type
// must fit the block; the size is checked against the type's area units; price comes from the base
// rate and the features' premiums on the project's active price list. A row matches the unit with
// the same number in the same block; "update" fills its empty street / floor / bedrooms (sold or
// booked units are left alone).

const STATUS = { available: "available", open: "available", "": "available", blocked: "blocked", block: "blocked", reserved: "blocked" }

export const unitsImporter = {
  key: "units",
  async prepare(ctx) {
    const [lists, m, projects, phases, blocks] = await Promise.all([
      getLookups(ctx.db, ["unit-type", "feature", "area-unit"]),
      workspaceMeasures(ctx.db),
      live(ctx.db, "projects").select("id", "code", "name", "marlaSqft"),
      live(ctx.db, "projectPhases").select("id", "projectId", "name", "stage"),
      live(ctx.db, "projectBlocks").select("id", "phaseId", "name", "category"),
    ])
    return { ctx, lists, m, projects, phases, blocks, featureLists: new Map(), seen: new Set() }
  },

  // The project's features with its active price list's premiums (cached)
  async features(prep, projectId) {
    if (!prep.featureLists.has(projectId))
      prep.featureLists.set(
        projectId,
        withListPremiums(
          prep.lists.feature.filter((f) => f.isActive),
          await activeList(prep.ctx.db, projectId),
        ),
      )
    return prep.featureLists.get(projectId)
  },

  // "10 Marla" / "1,600 sq ft" / "12" → { value, unit } against the workspace's area units
  size(prep, type, v) {
    const s = String(v ?? "")
      .trim()
      .replace(/,/g, "")
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
    if (!m || !(Number(m[1]) > 0)) return { error: `“${v}” isn't a size (e.g. 10 Marla)` }
    const word = m[2].toLowerCase().replace(/[.\s]/g, "").replace(/s$/, "")
    const allowed = prep.m.unitsFor(type)
    const unit = !word ? allowed[0] : prep.lists["area-unit"].find((u) => [u.value, u.label, u.meta?.short].filter(Boolean).some((x) => String(x).toLowerCase().replace(/[.\s]/g, "").replace(/s$/, "") === word))?.value
    if (!unit) return { error: `“${m[2]}” isn't an area unit in your lists` }
    const bad = sizeError(prep.m, type, unit)
    return bad ? { error: bad } : { value: { sizeValue: Number(m[1]), sizeUnit: unit } }
  },

  async check(prep, r) {
    const errors = []
    const warnings = []
    const low = (v) =>
      String(v ?? "")
        .trim()
        .toLowerCase()
    const project = prep.projects.find((p) => low(p.code) === low(r.project) || low(p.name) === low(r.project))
    if (!project) errors.push(V.isEmpty(r.project) ? "Project is empty" : `Project: “${r.project}” isn't one of your projects`)
    const phases = project ? prep.phases.filter((p) => p.projectId === project.id) : []
    let phase = null
    if (!V.isEmpty(r.phase)) {
      phase = phases.find((p) => low(p.name) === low(r.phase))
      if (project && !phase) errors.push(`Phase: “${r.phase}” isn't a phase of ${project.name}`)
    }
    const candidates = prep.blocks.filter((b) => (phase ? b.phaseId === phase.id : phases.some((p) => p.id === b.phaseId)) && low(b.name) === low(r.block))
    if (project && V.isEmpty(r.block)) errors.push("Block is empty")
    else if (project && candidates.length === 0 && !errors.some((e) => e.startsWith("Phase")))
      errors.push(`Block: no block “${r.block}”${phase ? ` in ${phase.name}` : ` in ${project.name}`} (add it in the project first)`)
    else if (candidates.length > 1) errors.push(`Block: “${r.block}” is in more than one phase: fill in the Phase column`)
    const block = candidates.length === 1 ? candidates[0] : null
    if (block && !phase) phase = phases.find((p) => p.id === block.phaseId)
    const number = V.text(r.number, 40)?.value
    if (!number) errors.push("Unit number is empty")
    const type = V.lookup(prep.lists["unit-type"], r.type, "unit type")
    if (!type) errors.push("Type is empty")
    else if (type.error) errors.push(`Type: ${type.error}`)
    else if (block && !prep.m.typesFor(block.category, { unballoted: phase?.stage === "unballoted" }).includes(type.value))
      errors.push(phase?.stage === "unballoted" ? "Type: unballoted phases hold files only" : `Type: a ${block.category} block can't hold this type`)
    const size = type?.value ? (V.isEmpty(r.size) ? { error: "is empty" } : this.size(prep, type.value, r.size)) : null
    if (size?.error) errors.push(`Size: ${size.error}`)
    const rate = V.money(r.rate)
    if (!rate) errors.push("Base rate is empty")
    else if (rate.error) errors.push(`Base rate: ${rate.error}`)
    const featureList = project ? await this.features(prep, project.id) : []
    const features = []
    for (const f of V.isEmpty(r.features) ? [] : String(r.features).split(/[,;|]/)) {
      const hit = V.lookup(featureList, f, "feature")
      if (hit?.value) features.push(hit.value)
      else if (hit?.error) warnings.push(`Features: ${hit.error} (left out)`)
    }
    const status = STATUS[low(r.status)]
    if (!V.isEmpty(r.status) && !status) warnings.push(`Status: “${r.status}” (added as available)`)
    const floor = V.int(r.floor, -5, 200)
    const bedrooms = V.int(r.bedrooms, 0, 20)
    if (floor?.error) warnings.push(`Floor: ${floor.error} (left empty)`)
    if (bedrooms?.error) warnings.push(`Bedrooms: ${bedrooms.error} (left empty)`)
    const t = type?.value
    const data = {
      project,
      phase,
      block,
      number,
      type: t,
      ...(size?.value ?? {}),
      rate: rate?.value,
      features,
      featureList,
      status: status ?? "available",
      street: ["plot", "house", "farmhouse"].includes(t) ? (V.text(r.street, 60)?.value ?? null) : null,
      floor: t && prep.m.sizedInSqft(t) ? (floor?.value ?? null) : null,
      bedrooms: ["house", "apartment"].includes(t) ? (bedrooms?.value ?? null) : null,
    }
    const key = block ? `${block.id}:${number}` : null
    if (key && prep.seen.has(key)) errors.push("Unit number: on an earlier row in the same block")
    return { data, errors, warnings, label: [project?.code, block?.name, number].filter(Boolean).join(" · ") || "(empty row)" }
  },

  async match(prep, d) {
    return live(prep.ctx.db, "units").where({ blockId: d.block.id, number: d.number }).first("id", "code", "status")
  },

  remember(prep, d) {
    if (d?.block && d.number) prep.seen.add(`${d.block.id}:${d.number}`)
  },

  async create(prep, d) {
    const uid = prep.ctx.user.id
    await prep.ctx.db.transaction(async (trx) => {
      const [code] = await unitCodes(trx, d.project.code, 1)
      await trx("units").insert({
        projectId: d.project.id,
        phaseId: d.phase.id,
        blockId: d.block.id,
        type: d.type,
        category: d.block.category,
        street: d.street,
        floor: d.floor,
        bedrooms: d.bedrooms,
        status: d.status,
        blockReason: d.status === "blocked" ? "Imported as blocked" : null,
        ...figures({ type: d.type, sizeValue: d.sizeValue, sizeUnit: d.sizeUnit, features: d.features, rate: d.rate, marlaSqft: d.project.marlaSqft, featureList: d.featureList, m: prep.m }),
        code,
        number: d.number,
        createdBy: uid,
      })
    })
  },

  async update(prep, existing, d) {
    if (!["available", "blocked"].includes(existing.status)) return false
    const u = await prep.ctx.db("units").where({ id: existing.id }).first("street", "floor", "bedrooms")
    const patch = {}
    for (const k of ["street", "floor", "bedrooms"]) if (u[k] == null && d[k] != null) patch[k] = d[k]
    if (!Object.keys(patch).length) return false
    await prep.ctx
      .db("units")
      .where({ id: existing.id })
      .update({ ...patch, updatedAt: new Date(), updatedBy: prep.ctx.user.id })
    return true
  },
}
