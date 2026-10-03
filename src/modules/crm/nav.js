// CRM sidebar; description is the page subtitle. soon: a ComingSoon placeholder until it's built.
// setup: needs rights to change CRM (crmNav locks it for everyone else, so they still see it).
export const CRM_NAV = [
  { items: [{ label: "Overview", icon: "dashboard-line", to: "/crm", end: true, description: "Your pipeline at a glance: new leads, follow-ups due, conversions and top prospects" }] },
  {
    label: "Pipeline",
    items: [
      { label: "Leads", icon: "user-star-line", to: "/crm/leads", description: "Every enquiry from ads, portals, walk-ins and dealers" },
      { label: "Follow-ups", icon: "alarm-line", to: "/crm/follow-ups", description: "Calls, WhatsApp and other follow-ups planned on your leads" },
      { label: "Site visits", icon: "map-pin-user-line", to: "/crm/site-visits", description: "Customers coming to see the project, by day" },
      { label: "Meetings", icon: "team-line", to: "/crm/meetings", description: "Customers coming to the office, by day" },
    ],
  },
  {
    label: "People",
    items: [{ label: "Contacts", icon: "contacts-book-2-line", to: "/crm/contacts", description: "The people behind your leads, with all their enquiries (the Contacts app has everyone else)" }],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", icon: "bar-chart-2-line", to: "/crm/reports", feature: "reports", description: "Sources, conversions, response times and agent performance" },
      { label: "Leaderboard", icon: "trophy-line", to: "/crm/leaderboard", description: "How each agent and team is doing this month" },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        label: "Customize",
        icon: "equalizer-line",
        to: "/crm/customize",
        setup: true,
        description: "Pipeline rules, lead scoring, assignment rules, and lead statuses, sources and other lists",
      },
    ],
  },
]

// The sidebar for this person: Setup pages locked unless they may change CRM
export const crmNav = (canSetUp) => CRM_NAV.map((g) => ({ ...g, items: g.items.map((i) => (i.setup && !canSetUp ? { ...i, locked: true, lockedReason: "Ask an administrator for access" } : i)) }))
