// Settings sidebar; description is the page subtitle. Each app's own settings live in App
// Settings (src/modules/settings/sections.js). Integrations gathers every third-party connection
// (the same cards as each app's own Integrations page).
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
  {
    label: "Data",
    items: [
      { label: "Import & Export", icon: "arrow-up-down-line", to: "/settings/import-export", description: "Bring data in from Excel or CSV and take it out again: leads and their history, contacts, units, employees" },
      { label: "Recycle Bin", icon: "delete-bin-line", to: "/settings/recycle-bin", need: { admin: true }, description: "Deleted records from every app: restore them, or delete them permanently" },
    ],
  },
  {
    label: "Connections",
    items: [
      { label: "Integrations", icon: "plug-line", to: "/settings/integrations", description: "Third-party services connected to this workspace: ads, messaging and payments" },
      { label: "Email", icon: "mail-settings-line", to: "/settings/email", description: "Your own email account for sending to leads and customers" },
    ],
  },
]
