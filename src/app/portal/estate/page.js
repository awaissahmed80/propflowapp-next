import { estatePage } from "@/modules/estate/server/context"
import { listProjects } from "@/modules/estate/server/queries"
import { ProjectsView } from "@/modules/estate/components/projects-view"

export const metadata = { title: "Overview" }

// The full overview (holds needing attention, stock by size, dealer quotas) comes with inventory;
// until then it shows the portfolio
export default async function EstateOverviewPage() {
  const ctx = await estatePage("/estate")
  const projects = await listProjects(ctx)
  return <ProjectsView projects={projects} view="table" canCreate={ctx.can("create")} />
}
