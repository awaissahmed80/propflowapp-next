import { settingsPage } from "@/modules/settings/context"
import { crmContext } from "@/modules/crm/server/context"
import { contactsContext } from "@/modules/contacts/server/context"
import { estateContext } from "@/modules/portfolio/server/context"
import { hrContext } from "@/modules/hr/server/context"
import { importHistory } from "@/modules/data-io/server/actions"
import { ImportExportView } from "@/modules/data-io/components/import-export-view"

export const metadata = { title: "Import & Export" }

// Settings › Import & Export: every kind of data in one place, as each app's role allows, and the
// history of imports with the rows that failed
export default async function ImportExportPage() {
  await settingsPage("/settings/import-export")
  const [crm, contacts, portfolio, hr] = await Promise.all([crmContext(), contactsContext(), estateContext(), hrContext()])
  const can = (ctx) => ({ import: ctx.can("create"), export: ctx.can("export") })
  const access = { leads: can(crm), activities: can(crm), contacts: can(contacts), units: can(portfolio), employees: can(hr) }
  const { list } = await importHistory()
  return <ImportExportView access={access} history={list} />
}
