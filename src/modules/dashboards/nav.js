// Dashboards sidebar: one item per role dashboard. dashboard: its key (cards.js), feature: the
// Dashboards feature it needs (portal/features.js). Dashboards with no card this person may see
// stay in the sidebar, locked (AppShell shows a plan lock first when the feature is off);
// description is the page subtitle.
export const DASHBOARDS = [
  { key: "executive", label: "Executive", icon: "dashboard-3-line", to: "/dashboards", end: true, description: "Sales, money, stock, leads, after-sales and people at a glance" },
  { key: "sales", label: "Sales & marketing", icon: "user-star-line", to: "/dashboards/sales", description: "Leads, pipeline, sources, conversion, campaigns and bookings" },
  { key: "finance", label: "Collections & finance", icon: "bank-line", to: "/dashboards/finance", description: "Collections, receivables, defaulters, cheques, cash and profit" },
  { key: "inventory", label: "Projects & inventory", icon: "community-line", to: "/dashboards/inventory", description: "Units by status, stock value, sold share, holds and rates" },
  { key: "after-sales", label: "After-sales", icon: "home-gear-line", to: "/dashboards/after-sales", description: "Service requests, transfers, NDC, possession and complaints" },
  { key: "people", label: "People", icon: "team-line", to: "/dashboards/people", description: "Headcount, who's away, leave, attendance and payroll" },
].map((d) => ({ ...d, feature: d.key }))

export const dashboardByKey = (key) => DASHBOARDS.find((d) => d.key === key) ?? null

// The sidebar: keys are the dashboards this person may open; the rest are locked
export const dashboardsNav = (keys) => [
  {
    items: DASHBOARDS.map(({ key, label, icon, to, end, description, feature }) => ({
      label,
      icon,
      to,
      end,
      description,
      feature,
      dashboard: key,
      ...(keys.includes(key) ? {} : { locked: true, lockedReason: "Nothing on it your role can see" }),
    })),
  },
]
