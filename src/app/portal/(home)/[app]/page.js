import { redirect } from "next/navigation"
import Link from "next/link"
import { getPortal } from "@/modules/portal/server/context"
import { NoAccess } from "@/modules/portal/components/no-access"
import { AppIcon } from "@/components/app-icon"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

export async function generateMetadata({ params }) {
  const { app } = await params
  const { apps } = await getPortal()
  return { title: apps.find((a) => a.code === app)?.name ?? "App" }
}

// Stand-in for each app until it's ported; also stops direct links to apps the person can't open
export default async function AppPage({ params }) {
  const [{ app: code }, { apps, setupCompleted }] = await Promise.all([params, getPortal()])
  if (!setupCompleted) redirect("/setup")
  const app = apps.find((a) => a.code === code)

  if (!app) return <NoAccess />

  return (
    <main className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="flex items-center gap-4">
        <AppIcon icon={app.icon} color={app.color} size="xl" />
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{app.category}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
          <p className="text-sm text-muted-foreground">{app.description}</p>
        </div>
      </div>
      <div className="mt-8 rounded-2xl border border-dashed bg-background p-10 text-center">
        <Icon name="hammer-line" className="text-3xl text-muted-foreground" />
        <p className="mt-2 font-medium">This app is on its way</p>
        <p className="mt-1 text-sm text-muted-foreground">It&apos;s being brought over to the new PropFlow. Everything you add will stay in your workspace.</p>
        <Button className="mt-6" variant="outline" leftIcon="apps-2-line" nativeButton={false} render={<Link href="/" />}>
          Back to apps
        </Button>
      </div>
    </main>
  )
}
