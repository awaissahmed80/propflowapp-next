import { appClosed, fail, json, listParam, mobileRoute, paging } from "@/modules/mobile/server/api"
import { live } from "@/server/db/records"
import { peopleByIds } from "@/modules/users/server/queries"
import { estateContext } from "@/modules/portfolio/server/context"
import { releaseExpiredHolds } from "@/modules/portfolio/server/queries"

// GET /api/mobile/v1/projects/<code>/units?status=available,on-hold&type=plot&q=&page=&size=:
// one page of a project's units (read only) → { project, rows, total, page, size, counts }.
// counts: units per status (for the filter chips). docs/mobile-api.md
export const GET = mobileRoute(async (request, access, { code }) => {
  const ctx = await estateContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const project = await live(ctx.db, "projects")
    .where({ code: String(code ?? "").toUpperCase() })
    .first("id", "code", "name", "color")
  if (!project) return fail("not_found", { message: "That project isn't in this workspace." })
  await releaseExpiredHolds(ctx)
  const sp = new URL(request.url).searchParams
  const { page, size } = paging(request.url, { size: 50, max: 200 })
  const status = listParam(sp, "status")
  const type = listParam(sp, "type")
  const term = (sp.get("q") ?? "").trim().slice(0, 40)
  const base = () => {
    const q = ctx.db("units as u").whereNull("u.deletedAt").where("u.projectId", project.id)
    if (type.length) q.whereIn("u.type", type)
    if (term) q.where((w) => w.where("u.number", "like", `%${term}%`).orWhere("u.street", "like", `%${term}%`))
    return q
  }
  const filtered = () => (status.length ? base().whereIn("u.status", status) : base())
  const [byStatus, totalRow, rows] = await Promise.all([
    base().groupBy("u.status").select("u.status").count({ n: "u.id" }),
    filtered().count({ n: "u.id" }).first(),
    filtered()
      .leftJoin("projectBlocks as b", "b.id", "u.blockId")
      .leftJoin("projectPhases as ph", "ph.id", "u.phaseId")
      .orderBy("u.blockId")
      .orderByRaw("CAST(u.number AS UNSIGNED), u.number")
      .limit(size)
      .offset((page - 1) * size)
      .select("u.code", "u.number", "u.type", "u.category", "u.sizeValue", "u.sizeUnit", "u.street", "u.floor", "u.bedrooms", "u.features", "u.price", "u.status", "u.holdBy", "u.holdExpiresAt", "b.name as block", "ph.name as phase"),
  ])
  const holders = await peopleByIds(rows.map((u) => u.holdBy))
  return json({
    project: { code: project.code, name: project.name, color: project.color },
    rows: rows.map((u) => ({
      code: u.code,
      number: u.number,
      type: u.type,
      category: u.category,
      sizeValue: Number(u.sizeValue),
      sizeUnit: u.sizeUnit,
      street: u.street,
      floor: u.floor,
      bedrooms: u.bedrooms,
      features: u.features ?? [],
      price: Number(u.price),
      status: u.status,
      block: u.block,
      phase: u.phase,
      hold: u.status === "on-hold" ? { by: holders.get(u.holdBy)?.name ?? null, byMe: u.holdBy === access.user.id, expiresAt: u.holdExpiresAt } : null,
    })),
    total: Number(totalRow?.n ?? 0),
    page,
    size,
    counts: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
  })
})
