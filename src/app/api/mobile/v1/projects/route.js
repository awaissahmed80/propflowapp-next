import { appClosed, json, mobileRoute } from "@/modules/mobile/server/api"
import { estateContext } from "@/modules/portfolio/server/context"
import { listProjects } from "@/modules/portfolio/server/queries"

// GET /api/mobile/v1/projects: the workspace's projects with availability
// → { projects: [{ code, name, color, type, city, coverUrl, unitTypes, stats }] }. docs/mobile-api.md
export const GET = mobileRoute(async () => {
  const ctx = await estateContext()
  const closed = appClosed(ctx)
  if (closed) return closed
  const projects = await listProjects(ctx)
  return json({
    projects: projects.map((p) => ({ code: p.code, name: p.name, color: p.color, type: p.type, city: p.city ?? null, status: p.status ?? null, coverUrl: p.coverUrl, unitTypes: p.unitTypes, phaseCount: p.phaseCount, blockCount: p.blockCount, stats: p.stats })),
  })
})
