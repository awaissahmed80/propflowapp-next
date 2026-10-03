import { estatePage } from "@/modules/portfolio/server/context"
import { listProjects } from "@/modules/portfolio/server/queries"
import { ProjectsView } from "@/modules/portfolio/components/projects-view"

export const metadata = { title: "Projects" }

export default async function ProjectsPage({ searchParams }) {
  const ctx = await estatePage("/project-portfolio/projects")
  const [projects, { view }] = await Promise.all([listProjects(ctx), searchParams])
  return <ProjectsView projects={projects} view={view === "table" ? "table" : "cards"} canCreate={ctx.can("create")} />
}
