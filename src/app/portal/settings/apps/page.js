import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { settingsPage } from "@/modules/settings/context"
import { directoryGroups } from "@/modules/settings/directory"
import { renderSection } from "@/modules/settings/sections"
import { PageHeader } from "@/components/page-header"
import { SettingsDirectory } from "@/modules/settings/components/settings-directory"

export const metadata = { title: "App Settings" }

// Each app's settings other than its lists (rules, assignment, fees…), grouped by app. The same
// pages as the apps' own Customize tabs. ?section=crm.pipeline opens one.
export default async function AppSettingsPage({ searchParams }) {
  const ctx = await settingsPage("/settings/apps")
  const [{ section }, portal] = await Promise.all([searchParams, getPortal()])
  const { groups } = await directoryGroups(ctx, portal, "sections")
  const found = groups.some((g) => g.sections.some((s) => s.id === section))
  if (!found && groups[0]) redirect(`/settings/apps?section=${groups[0].sections[0].id}`)
  const opened = found ? renderSection(section) : null
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="App Settings" description="Rules, assignment, fees and lists with their own fields, for each app." />
      <div className="min-h-0 flex-1">
        <SettingsDirectory groups={groups} current={{ section: found ? section : null }} label="Apps" placeholder="Find a setting…">
          {opened ?? <p className="p-10 text-center text-sm text-muted-foreground">None of your apps have settings you can change.</p>}
        </SettingsDirectory>
      </div>
    </div>
  )
}
