import { estatePage } from "@/modules/portfolio/server/context"
import { getProject } from "@/modules/portfolio/server/queries"
import { ProjectView, ProjectNotFound } from "@/modules/portfolio/components/project-view"

export async function generateMetadata({ params }) {
  const { code } = await params
  const project = await getProject(await estatePage(`/project-portfolio/projects/${code}`), code)
  return { title: project?.name ?? "Project" }
}

// /estate/projects/ske
export default async function ProjectPage({ params }) {
  const { code } = await params
  const ctx = await estatePage(`/project-portfolio/projects/${code}`)
  const project = await getProject(ctx, code)
  if (!project) return <ProjectNotFound />
  return <ProjectView project={project} canEdit={ctx.can("edit")} canCreate={ctx.can("create")} />
}
