// Console team roles. Fixed on purpose: a small team doesn't need a role editor.
// view: sections the person sees in the console; manage: sections where they can change things.
// Shared by server checks and the UI, so the two never disagree.

export const CONSOLE_AREAS = {
  overview: "Overview",
  enquiries: "Sales enquiries",
  requests: "Workspace requests",
  workspaces: "Workspaces",
  billing: "Billing & invoices",
  plans: "Plans & pricing",
  team: "Team",
  audit: "Audit log",
  settings: "Platform settings",
}
const ALL = Object.keys(CONSOLE_AREAS)

export const PLATFORM_ROLES = {
  owner: {
    label: "Platform owner",
    description: "Everything, including the team. There is one owner.",
    view: ALL,
    manage: ALL,
    impersonate: true,
  },
  admin: {
    label: "Administrator",
    description: "Runs the platform day to day. Everything except managing the team.",
    view: ALL,
    manage: ALL.filter((a) => a !== "team"),
    impersonate: true,
  },
  finance: {
    label: "Finance",
    description: "Invoices, payments and pricing.",
    view: ["overview", "workspaces", "billing", "plans", "audit"],
    manage: ["billing", "plans"],
    impersonate: false,
  },
  sales: {
    label: "Sales",
    description: "Follows up website enquiries and starts trials.",
    view: ["overview", "enquiries", "workspaces", "plans"],
    manage: ["enquiries"],
    impersonate: false,
  },
  support: {
    label: "Support",
    description: "Answers workspace requests and can sign in as a user to help.",
    view: ["overview", "requests", "workspaces"],
    manage: ["requests"],
    impersonate: true,
  },
}

// Roles the owner can give when inviting (the owner role isn't handed out)
export const INVITABLE_ROLES = ["admin", "finance", "sales", "support"]

export const roleLabel = (role) => PLATFORM_ROLES[role]?.label ?? role
export const canView = (role, area) => PLATFORM_ROLES[role]?.view.includes(area) ?? false
export const can = (role, area) => PLATFORM_ROLES[role]?.manage.includes(area) ?? false
// Who may sign in as a workspace user
export const canImpersonate = (role) => PLATFORM_ROLES[role]?.impersonate ?? false
