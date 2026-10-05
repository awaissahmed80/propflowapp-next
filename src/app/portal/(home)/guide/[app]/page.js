import { notFound } from "next/navigation"
import { loadGuide } from "@/modules/guide/server"
import { APP_GUIDES } from "@/modules/guide/content"
import { GuideArticle } from "@/modules/guide/components/guide-article"

export async function generateMetadata({ params }) {
  const { app } = await params
  return { title: APP_GUIDES[app] ? `${app === "desk" ? "My Desk" : app.toUpperCase().length <= 3 ? app.toUpperCase() : app[0].toUpperCase() + app.slice(1)} · User Guide` : "User Guide" }
}

// /guide/crm: one app's page of the User Guide, if the role opens the app
export default async function GuideAppPage({ params, searchParams }) {
  const { app } = await params
  const data = await loadGuide(`/guide/${app}`, (await searchParams).role)
  if (!APP_GUIDES[app] || !data.apps.some((a) => a.code === app)) notFound()
  return <GuideArticle code={app} {...data} />
}
