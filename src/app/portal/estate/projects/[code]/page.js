import { estatePage } from "@/modules/estate/server/context"
import { getProject } from "@/modules/estate/server/queries"
import { ProjectView, ProjectNotFound } from "@/modules/estate/components/project-view"

export async function generateMetadata({ params }) {
  const { code } = await params
  const project = await getProject(await estatePage(`/estate/projects/${code}`), code)
  return { title: project?.name ?? "Project" }
}

// /estate/projects/ske
export default async function ProjectPage({ params }) {
  const { code } = await params
  const ctx = await estatePage(`/estate/projects/${code}`)
  const project = await getProject(ctx, code)
  if (!project) return <ProjectNotFound />
  return <ProjectView project={project} canEdit={ctx.can("edit")} canCreate={ctx.can("create")} />
}
