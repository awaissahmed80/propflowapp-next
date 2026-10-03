import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { settingsPage } from "@/modules/settings/context"
import { directoryGroups } from "@/modules/settings/directory"
import { PageHeader } from "@/components/page-header"
import { SettingsDirectory, SettingsListCard } from "@/modules/settings/components/settings-directory"

export const metadata = { title: "Lists & Labels" }

// Every app's plain pick-lists in one place, grouped by app (lists with their own fields, like
// unit sizes or activity points, are in App Settings). ?list=lead-status opens one.
export default async function ListsPage({ searchParams }) {
  const ctx = await settingsPage("/settings/lists")
  const [{ list }, portal] = await Promise.all([searchParams, getPortal()])
  const { groups, lists } = await directoryGroups(ctx, portal, "lists")
  const open = groups.some((g) => g.lists.some((l) => l.key === list)) ? lists.find((l) => l.key === list) : null
  if (!open && groups[0]) redirect(`/settings/lists?list=${groups[0].lists[0].key}`)
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lists & Labels" description="Rename, recolor, reorder and extend the choices your team sees across the workspace." />
      <div className="min-h-0 flex-1">
        <SettingsDirectory groups={groups} current={{ list: open?.key }} label="Lists" placeholder="Find a list or value…">
          {open ? (
            // Remount when the saved values change, so edits start from what's stored
            <SettingsListCard key={`${open.key}:${JSON.stringify(open.values)}`} list={open} />
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">No lists yet.</p>
          )}
        </SettingsDirectory>
      </div>
    </div>
  )
}
