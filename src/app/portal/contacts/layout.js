import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getPortal } from "@/modules/portal/server/context"
import { AppShell } from "@/modules/portal/components/app-shell"
import { PortalShell } from "@/modules/portal/components/portal-shell"
import { NoAccess } from "@/modules/portal/components/no-access"
import { LookupsProvider } from "@/modules/lookups/context"
import { contactLists, contactsContext, scoped } from "@/modules/contacts/server/context"
import { CONTACTS_NAV } from "@/modules/contacts/nav"

export const metadata = { title: { default: "Contacts", template: "%s · Contacts · PropFlow" } }

// Contacts: one directory of everyone the business deals with, shared by every app. The sidebar's
// "By type" group comes from the contact-type list, with how many contacts each has.
export default async function ContactsLayout({ children }) {
  const [portal, jar] = await Promise.all([getPortal(), cookies()])
  if (!portal.setupCompleted) redirect("/setup")
  if (!portal.apps.some((a) => a.code === "contacts"))
    return (
      <PortalShell portal={portal}>
        <NoAccess />
      </PortalShell>
    )
  const ctx = await contactsContext()
  const lists = await contactLists(ctx)
  const counts = ctx.can("view")
    ? await scoped(ctx, ctx.db("contacts").whereNull("contacts.deletedAt"))
        .join("contactLinks as l", "l.contactId", "contacts.id")
        .whereNull("l.deletedAt")
        .groupBy("l.role")
        .select("l.role")
        .countDistinct({ n: "contacts.id" })
    : []
  const byRole = Object.fromEntries(counts.map((c) => [c.role, Number(c.n)]))
  const types = (lists["contact-type"] ?? []).filter((t) => t.isActive)
  const nav = [
    CONTACTS_NAV[0],
    {
      label: "By type",
      items: types.map((t) => ({ label: t.label, icon: t.icon || "user-line", to: `/contacts/type/${t.value}`, badge: byRole[t.value] || undefined, description: `Contacts marked as ${t.label.toLowerCase()}` })),
    },
    ...CONTACTS_NAV.slice(1),
  ]
  return (
    <AppShell portal={portal} appCode="contacts" nav={nav} defaultOpen={jar.get("sidebar_state")?.value !== "false"}>
      <LookupsProvider lists={lists} app="contacts" canAdd={ctx.can("edit")}>
        {children}
      </LookupsProvider>
    </AppShell>
  )
}
