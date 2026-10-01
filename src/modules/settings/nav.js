// Settings sidebar; description is the page subtitle. Approval rules and integrations join as
// they're built.
export const SETTINGS_NAV = [
  {
    label: "Company",
    items: [
      { label: "Company Profile", icon: "building-2-line", to: "/settings", end: true, description: "Name, logo, NTN and addresses used on documents" },
      { label: "Subscription & Billing", icon: "vip-crown-line", to: "/settings/billing", description: "Plan, apps, usage and invoices" },
    ],
  },
  { label: "Customise", items: [{ label: "Lists & Labels", icon: "list-settings-line", to: "/settings/lists", description: "Statuses, types and other choices used across the workspace" }] },
]
