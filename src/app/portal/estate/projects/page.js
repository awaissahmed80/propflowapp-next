import { estatePage } from "@/modules/estate/server/context"
import { listProjects } from "@/modules/estate/server/queries"
import { ProjectsView } from "@/modules/estate/components/projects-view"

export const metadata = { title: "Projects" }

export default async function ProjectsPage({ searchParams }) {
  const ctx = await estatePage("/estate/projects")
  const [projects, { view }] = await Promise.all([listProjects(ctx), searchParams])
  return <ProjectsView projects={projects} view={view === "table" ? "table" : "cards"} canCreate={ctx.can("create")} />
}
