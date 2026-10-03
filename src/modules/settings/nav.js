// Settings sidebar; description is the page subtitle. Each app's own settings live in App
// Settings (src/modules/settings/sections.js); approval rules and integrations join as they're built.
export const SETTINGS_NAV = [
  {
    label: "Company",
    items: [
      { label: "Company Profile", icon: "building-2-line", to: "/settings", end: true, description: "Name, logo, NTN and addresses used on documents" },
      { label: "Subscription & Billing", icon: "vip-crown-line", to: "/settings/billing", description: "Plan, apps, usage and invoices" },
    ],
  },
  {
    label: "Customize",
    items: [
      { label: "Lists & Labels", icon: "list-settings-line", to: "/settings/lists", description: "Statuses, types and other choices used across the workspace" },
      { label: "App Settings", icon: "equalizer-line", to: "/settings/apps", description: "Rules, assignment, fees and lists with their own fields, for each app" },
    ],
  },
  { label: "Connections", items: [{ label: "Email", icon: "mail-settings-line", to: "/settings/email", description: "Your own email account for sending to leads and customers" }] },
]
