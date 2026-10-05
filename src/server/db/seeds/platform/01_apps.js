// App catalog. Safe to run again: adds new apps and updates names, icons and order.
const APPS = [
  ["desk", "My Desk", "Your tasks, approvals, shifts, leave and pay in one place", "user-smile-line", "teal", "Workspace & Admin", true],
  ["portfolio", "Project Portfolio", "Projects, phases, inventory, price lists and dealer quotas", "community-line", "orange", "Projects & Sales"],
  ["campaigns", "Campaigns", "Ad campaigns, lead forms, landing pages and cost per lead", "megaphone-line", "rose", "Projects & Sales"],
  ["crm", "CRM", "Leads, follow-ups, site visits, call logs and pipeline", "user-star-line", "sky", "Projects & Sales"],
  ["operations", "Operations", "Bookings after sale: milestones, allotments, KYC, handover", "flow-chart", "blue", "After-Sales"],
  ["estate", "Estate Management", "Transfers, NDC, possession, resale, rentals and complaints", "home-gear-line", "teal", "After-Sales"],
  ["finance", "Finance", "Payments, invoices, receipts, cheques, escrow and banking", "bank-line", "emerald", "Finance & HR"],
  ["hr", "HR & Payroll", "Employees, duty rosters, attendance, leave and payroll", "team-line", "violet", "Finance & HR"],
  ["dashboards", "Dashboards", "Live sales, inventory and collections KPIs at a glance", "dashboard-3-line", "indigo", "Workspace & Admin"],
  ["contacts", "Contacts", "Leads, customers, owners, tenants, dealers and vendors", "contacts-book-2-line", "sky", "Workspace & Admin"],
  ["documents", "Documents", "Agreements, allotment letters, scans and shared files", "folder-5-line", "yellow", "Workspace & Admin"],
  ["users", "Users & Teams", "Users, sales teams, dealer logins, roles and permissions", "shield-user-line", "cyan", "Workspace & Admin"],
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
