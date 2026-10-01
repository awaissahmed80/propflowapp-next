// App catalogue. Safe to run again: adds new apps and updates names, icons and order.
const APPS = [
  ["desk", "My Desk", "Your shifts, leave, pay, team, tasks and approvals in one place", "user-smile-line", "teal", "Workspace & Admin", true],
  ["estate", "Estate Management", "Projects, plots, files, houses and shops, listings and rentals", "building-2-line", "orange", "Property & Sales"],
  ["crm", "CRM", "Leads, follow-ups, site visits and call logs", "user-star-line", "sky", "Property & Sales"],
  ["campaigns", "Campaigns", "Ad campaigns, lead forms, landing pages and cost per lead", "megaphone-line", "rose", "Property & Sales"],
  ["sales", "Sales", "Bookings, installment plans, allotments, dealers and commissions", "hand-coin-line", "blue", "Property & Sales"],
  ["services", "Customer Services", "Transfers, NDC, possession, maintenance and complaints", "customer-service-2-line", "teal", "Property & Sales"],
  ["finance", "Finance", "Installment collections, receipts, cheques, ledger and banking", "bank-line", "emerald", "Operations & Finance"],
  ["hr", "HR & Payroll", "Employees, duty rosters, attendance, leave and payroll", "team-line", "violet", "Operations & Finance"],
  ["dashboards", "Dashboards", "Sales, inventory and collections KPIs at a glance", "dashboard-3-line", "indigo", "Workspace & Admin"],
  ["contacts", "Contacts", "Everyone you deal with: leads, customers, owners, tenants, dealers and vendors", "contacts-book-2-line", "sky", "Workspace & Admin"],
  ["documents", "Documents", "Agreements, allotment letters and scanned files", "folder-5-line", "yellow", "Workspace & Admin"],
  ["users", "Users & Teams", "Users, sales teams, roles and permissions", "shield-user-line", "cyan", "Workspace & Admin"],
  ["settings", "Settings", "Company profile, subscription, billing and integrations", "settings-3-line", "zinc", "Workspace & Admin"],
]

export async function seed(knex) {
  const rows = APPS.map(([code, name, description, icon, color, category, alwaysOn = false], i) => ({
    code,
    name,
    description,
    icon,
    color,
    category,
    always_on: alwaysOn,
    sort_order: (i + 1) * 10,
  }))
  await knex("apps").insert(rows).onConflict("code").merge(["name", "description", "icon", "color", "category", "always_on", "sort_order"])
}
