import { crmPage } from "@/modules/crm/server/context"
import { assignableAgents, crmProjects, listLeads } from "@/modules/crm/server/queries"
import { crmSettings } from "@/modules/crm/server/settings"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { live } from "@/server/db/records"
import { formatPkPhone } from "@/lib/phone"
import { fromUrlCode } from "@/lib/url"
import { contactsContext, scoped as contactsScoped } from "@/modules/contacts/server/context"
import { LeadsView } from "@/modules/crm/components/leads-view"

export const metadata = { title: "Leads" }

// Leads list and board. ?lead=ld-00001 opens a lead; ?new=1 opens the new-lead form (with
// &contact=ct-00012, filled in with that contact's details).
export default async function LeadsPage({ searchParams }) {
  const ctx = await crmPage("/crm/leads")
  const [leads, agents, projects, prefs, brand] = await Promise.all([listLeads(ctx), assignableAgents(ctx), crmProjects(ctx), crmSettings(ctx.db), getWorkspaceBrand(ctx.tenant)])
  const prefill = await contactPrefill(ctx, (await searchParams).contact)
  return (
    <LeadsView
      leads={leads}
      agents={agents}
      projects={projects}
      me={ctx.user.id}
      brand={brand}
      userName={ctx.user.name}
      prefill={prefill}
      access={{
        create: ctx.can("create"),
        edit: ctx.can("edit"),
        export: ctx.can("export"),
        delete: ctx.can("delete"),
        reassign: ctx.canReassign,
        scope: ctx.scope,
        statusNote: prefs.statusNote,
        autoAssign: prefs.autoAssign,
        staleDays: prefs.stale ? prefs.staleDays : null,
      }}
    />
  )
}

// A contact's details for the new-lead form, when this person may add leads and see the contact
async function contactPrefill(ctx, code) {
  if (!code || !ctx.can("create")) return null
  const contacts = await contactsContext()
  if (!contacts.can("view")) return null
  const c = await contactsScoped(contacts, live(ctx.db, "contacts"))
    .where("contacts.code", fromUrlCode(code))
    .first("contacts.name", "contacts.phone", "contacts.whatsapp", "contacts.email", "contacts.city", "contacts.overseas")
  return c ? { name: c.name, phone: formatPkPhone(c.phone ?? ""), whatsapp: Boolean(c.whatsapp), email: c.email ?? "", city: c.city ?? "", overseas: Boolean(c.overseas) } : null
}
