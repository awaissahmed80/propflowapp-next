"use server"

import { getPortal } from "@/modules/portal/server/context"
import { crmContext } from "@/modules/crm/server/context"
import { contactsContext } from "@/modules/contacts/server/context"
import { salesContext } from "@/modules/operations/server/context"
import { estateContext } from "@/modules/portfolio/server/context"
import { servicesContext } from "@/modules/estate/server/context"
import { financeContext } from "@/modules/finance/server/context"
import { hrContext } from "@/modules/hr/server/context"
import { documentsContext } from "@/modules/documents/server/context"
import { campaignsContext } from "@/modules/campaigns/server/context"
import {
  parseTerm,
  searchAccounts,
  searchBookings,
  searchCampaigns,
  searchContacts,
  searchDocuments,
  searchEmployees,
  searchLeadContacts,
  searchLeads,
  searchPaymentRequests,
  searchProjects,
  searchRequests,
  searchUnits,
  searchVouchers,
} from "./search"

// Spotlight (⌘K) record search: leads, contacts, bookings, projects, units, requests, Finance
// records, employees, documents and campaigns matching the query, from the apps this person can
// open, each limited the way that app's own lists are (search.js).
//   → [{ value: "Leads", items: [{ value, label, meta, icon, href }] }], groups without matches left out
export async function spotlightSearch(query) {
  const t = parseTerm(query)
  if (t.text.length < 2) return []
  const portal = await getPortal()
  if (!portal.setupCompleted) return []
  const opens = (code) => portal.apps.some((a) => a.code === code)
  // Full CNICs (contacts.cnic) may be searched; everyone else's are masked, so they can't be
  const cnic = Boolean(portal.access.grants["contacts.cnic"])

  // [label, app, context, feature, run(ctx)]: the app's context decides view rights and switched-off features
  const groups = [
    ["Leads", "crm", crmContext, null, (ctx) => searchLeads(ctx, t, { cnic })],
    opens("contacts") ? ["Contacts", "contacts", contactsContext, null, (ctx) => searchContacts(ctx, t, { cnic })] : ["Contacts", "crm", crmContext, null, (ctx) => searchLeadContacts(ctx, t, { cnic })],
    ["Bookings", "operations", salesContext, null, (ctx) => searchBookings(ctx, t, { cnic })],
    ["Projects", "portfolio", estateContext, null, (ctx) => searchProjects(ctx, t)],
    ["Units", "portfolio", estateContext, null, (ctx) => searchUnits(ctx, t)],
    ["Requests", "estate", servicesContext, null, (ctx) => searchRequests(ctx, t, { cnic })],
    ["Vouchers", "finance", financeContext, null, (ctx) => searchVouchers(ctx, t)],
    ["Accounts", "finance", financeContext, null, (ctx) => searchAccounts(ctx, t)],
    ["Payment requests", "finance", financeContext, "collections", (ctx) => searchPaymentRequests(ctx, t, { cnic })],
    ["Employees", "hr", hrContext, null, (ctx) => searchEmployees(ctx, t, { cnic })],
    ["Documents", "documents", documentsContext, null, (ctx) => searchDocuments(ctx, t)],
    ["Campaigns", "campaigns", campaignsContext, null, (ctx) => searchCampaigns(ctx, t)],
  ]

  const found = await Promise.all(
    groups.map(async ([label, app, context, feature, run]) => {
      if (!opens(app)) return null
      try {
        const ctx = await context()
        if (!ctx.can("view") || (feature && !ctx.has(feature))) return null
        const items = await run(ctx)
        return items.length ? { value: label, items } : null
      } catch (err) {
        // One app failing only drops its group
        console.error(`Spotlight search (${label}) failed:`, err)
        return null
      }
    }),
  )
  return found.filter(Boolean)
}
