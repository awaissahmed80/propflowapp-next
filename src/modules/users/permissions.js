// Workspace role permissions, used by the server, the UI and the default-role seed (so no path
// aliases here). A role's permissions are a list:
//   ["*"]                                  everything in every app (Owner, Administrator)
//   ["crm.view", "crm.create", "sales.view"…]   app code + action
// Apps listed in APP_PERMISSIONS also limit which records a role sees (role.scope) and have
// named permissions inside the app (role.grants): a toggle, a percent limit or a choice.

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"]

export const ACTION_LABELS = { view: "View", create: "Create", edit: "Edit", delete: "Delete", approve: "Approve", export: "Export" }

export const ACTION_HINTS = {
  view: "Open the app and see its records",
  create: "Add new records",
  edit: "Change existing records",
  delete: "Delete records",
  approve: "Approve discounts, refunds, transfers, price lists and other requests",
  export: "Export and print reports",
}

export const SCOPE_LABELS = { own: "Own records", team: "Their team's", all: "Everything", linked: "Linked to their work" }

export const scopeHint = (scope, noun) =>
  ({
    own: `Only the ${noun} assigned to them.`,
    team: `Their own ${noun} and those of the team they're in or lead.`,
    all: `All ${noun} in the workspace.`,
    linked: "Only the people behind the leads and bookings they can see.",
  })[scope]

const toggle = (key, label, hint) => ({ key, label, hint, type: "toggle" })

export const APP_PERMISSIONS = {
  crm: {
    scopes: ["own", "team", "all"],
    noun: "leads",
    grants: [toggle("crm.reassign", "Assign leads to other people", "Without it, new leads stay with the person who adds them.")],
  },
  sales: {
    scopes: ["own", "team", "all"],
    noun: "bookings, receipts and installments",
    grants: [
      { key: "sales.discount", label: "Extra discount on bookings", hint: "Up to this share of the list price, on top of the plan discount.", type: "percent", max: 10 },
      toggle("sales.receipts", "Record payments"),
      toggle("sales.cheques", "Clear or bounce cheques"),
      toggle("sales.allot", "Issue allotment letters"),
      toggle("sales.cancel", "Cancel bookings", "Puts the unit back on sale and works out the refund."),
      {
        key: "sales.commissions",
        label: "See commissions",
        type: "choice",
        options: [
          ["none", "None"],
          ["own", "Their own"],
          ["all", "Everyone's"],
        ],
      },
      toggle("sales.pay-commissions", "Pay commissions"),
    ],
  },
  contacts: {
    scopes: ["linked", "all"],
    noun: "contacts",
    grants: [toggle("contacts.cnic", "See full CNIC numbers", "Otherwise shown as 35202-•••••••-1 everywhere, including Sales.")],
  },
  services: {
    scopes: ["own", "team", "all"],
    noun: "service requests",
    grants: [
      toggle("services.assign", "Assign requests to other people", "Without it, requests they log stay with them."),
      toggle("services.ndc", "Issue NDCs", "Only possible when the buyer has no overdue dues."),
      toggle("services.transfer", "Approve and complete transfers", "Moves the file to the new owner."),
      toggle("services.possession", "Hand over possession"),
      toggle("services.waive", "Waive fees"),
    ],
  },
  hr: {
    scopes: ["own", "team", "all"],
    noun: "employees, leave and payslips",
    grants: [
      toggle("hr.salaries", "See salaries and payslips", "Without it, pay is hidden except on their own record."),
      toggle("hr.approve-leave", "Approve leave", "For the people they can see."),
      toggle("hr.roster", "Manage rosters and mark attendance", "Sees the duty roster for every post, without seeing salaries."),
      toggle("hr.payroll", "Run and approve payroll"),
      toggle("hr.loans", "Give loans and advances"),
    ],
  },
}

export const isFullAccess = (permissions) => Array.isArray(permissions) && permissions.includes("*")

// Actions a role has in an app, e.g. ["view", "create"]
export function actionsIn(permissions, app) {
  if (!Array.isArray(permissions)) return []
  if (isFullAccess(permissions)) return [...ACTIONS]
  return ACTIONS.filter((a) => permissions.includes(`${app}.${a}`))
}

export const can = (permissions, app, action = "view") => actionsIn(permissions, app).includes(action)

// { app: [actions] } for the editor, and back to the stored list (any action implies view)
export function toMatrix(permissions, apps) {
  return Object.fromEntries(apps.map((a) => [a, actionsIn(permissions, a)]))
}
export function fromMatrix(matrix) {
  return Object.entries(matrix).flatMap(([app, actions]) => {
    if (!actions?.length) return []
    const withView = actions.includes("view") ? actions : ["view", ...actions]
    return ACTIONS.filter((a) => withView.includes(a)).map((a) => `${app}.${a}`)
  })
}

export const grantDef = (key) => APP_PERMISSIONS[key.split(".")[0]]?.grants.find((g) => g.key === key) ?? null
// The most a grant can be (full-access roles), and nothing
const fullGrant = (def) => (def.type === "toggle" ? true : def.type === "percent" ? def.max : def.options.at(-1)[0])
export const emptyGrant = (def) => (def.type === "toggle" ? false : def.type === "percent" ? 0 : def.options[0][0])

// A role's scope and grants for every listed app, filled in: what the Roles editor edits.
// Full-access roles get the widest value of everything; anything unset gets the narrowest.
export function roleAccess(role) {
  const full = isFullAccess(role.permissions)
  const scope = {}
  const grants = {}
  for (const [app, def] of Object.entries(APP_PERMISSIONS)) {
    scope[app] = full ? "all" : (role.scope?.[app] ?? def.scopes[0])
    for (const g of def.grants) grants[g.key] = full ? fullGrant(g) : (role.grants?.[g.key] ?? emptyGrant(g))
  }
  return { scope, grants }
}

// Keep only known apps, scopes and grant values, so a request can't store anything else
export function cleanAccess({ scope = {}, grants = {} } = {}) {
  const outScope = {}
  const outGrants = {}
  for (const [app, def] of Object.entries(APP_PERMISSIONS)) {
    if (def.scopes.includes(scope[app])) outScope[app] = scope[app]
    for (const g of def.grants) {
      const v = grants[g.key]
      if (g.type === "toggle" && typeof v === "boolean") outGrants[g.key] = v
      if (g.type === "percent" && typeof v === "number" && Number.isFinite(v)) outGrants[g.key] = Math.min(g.max, Math.max(0, Math.round(v * 2) / 2))
      if (g.type === "choice" && g.options.some(([o]) => o === v)) outGrants[g.key] = v
    }
  }
  return { scope: outScope, grants: outGrants }
}

// The role every dealer login gets (Dealer Accounts); it can be edited, not deleted
export const DEALER_ROLE = "dealer"

// Roles every new workspace starts with. Owner and Administrator always have full access and
// can't be edited; the rest are starting points the workspace can change or delete.
export const DEFAULT_ROLES = [
  { code: "owner", name: "Owner", description: "Company owner. Full access, including billing and subscription", permissions: ["*"], system: true },
  { code: "admin", name: "Administrator", description: "Full access to every app the company subscribes to", permissions: ["*"], system: true },
  {
    code: "sales-manager",
    name: "Sales Manager",
    description: "Owns the pipeline from lead to allotment",
    permissions: [
      ...["view", "create", "edit"].map((a) => `estate.${a}`),
      ...["view", "create", "edit", "delete", "export"].map((a) => `crm.${a}`),
      ...["view", "create", "edit", "approve", "export"].map((a) => `sales.${a}`),
      "services.view",
      "finance.view",
      "hr.view",
      "dashboards.view",
      "documents.view",
      "documents.create",
      ...["view", "create", "edit", "export"].map((a) => `contacts.${a}`),
      ...["view", "create", "edit", "delete", "approve", "export"].map((a) => `campaigns.${a}`),
    ],
    scope: { crm: "all", sales: "all", contacts: "all", services: "all", hr: "all" },
    grants: {
      "crm.reassign": true,
      "sales.discount": 5,
      "sales.receipts": true,
      "sales.cheques": false,
      "sales.allot": true,
      "sales.cancel": true,
      "sales.commissions": "all",
      "sales.pay-commissions": false,
      "contacts.cnic": true,
      "hr.approve-leave": true,
      "hr.roster": true,
    },
  },
  {
    code: "team-lead",
    name: "Team Lead",
    description: "Runs a sales team: sees the team's leads and bookings",
    permissions: [
      "estate.view",
      "estate.create",
      "crm.view",
      "crm.create",
      "crm.edit",
      "crm.export",
      "sales.view",
      "sales.create",
      "sales.edit",
      "hr.view",
      "documents.view",
      "contacts.view",
      "contacts.create",
      "contacts.edit",
      "campaigns.view",
    ],
    scope: { crm: "team", sales: "team", contacts: "linked", hr: "team" },
    grants: { "crm.reassign": true, "sales.discount": 2, "sales.receipts": true, "sales.commissions": "own", "contacts.cnic": true, "hr.approve-leave": true },
  },
  {
    code: "sales-agent",
    name: "Sales Agent",
    description: "Works assigned leads and books units",
    permissions: ["estate.view", "estate.create", "crm.view", "crm.create", "crm.edit", "sales.view", "sales.create", "hr.view", "documents.view", "contacts.view", "contacts.create", "contacts.edit", "campaigns.view"],
    scope: { crm: "own", sales: "own", contacts: "linked", hr: "own" },
    grants: { "sales.discount": 1, "sales.receipts": true, "sales.commissions": "own", "contacts.cnic": true },
  },
  {
    code: "accountant",
    name: "Accountant",
    description: "Receipts, receivables, payroll and books",
    permissions: [
      "services.view",
      "services.approve",
      ...["view", "create", "edit", "approve", "export"].map((a) => `finance.${a}`),
      ...["view", "create", "edit", "export"].map((a) => `hr.${a}`),
      "dashboards.view",
      "documents.view",
      "documents.create",
      "contacts.view",
      "contacts.create",
      "contacts.edit",
      "sales.view",
      "sales.edit",
      "sales.export",
    ],
    scope: { crm: "own", sales: "all", contacts: "all", services: "all", hr: "all" },
    grants: {
      "sales.receipts": true,
      "sales.cheques": true,
      "sales.commissions": "all",
      "sales.pay-commissions": true,
      "contacts.cnic": true,
      "services.ndc": true,
      "services.waive": true,
      "hr.salaries": true,
      "hr.payroll": true,
      "hr.loans": true,
      "hr.roster": true,
    },
  },
  {
    // Logins for external dealer firms (Dealer Accounts): their firm's leads, bookings and quota
    code: "dealer",
    name: "Dealer",
    description: "External dealer: allocated inventory, own leads and commissions",
    permissions: ["estate.view", "estate.create", "estate.edit", "crm.view", "crm.create", "crm.edit", "sales.view", "sales.create", "documents.view", "contacts.view"],
    scope: { crm: "own", sales: "own", contacts: "linked" },
    grants: { "sales.discount": 0, "sales.commissions": "own", "contacts.cnic": false },
  },
  {
    code: "customer-services",
    name: "Customer Services",
    description: "Runs the service desk: transfers, NDC, possession and complaints",
    permissions: [
      "services.view",
      "services.create",
      "services.edit",
      "services.export",
      "sales.view",
      "estate.view",
      "contacts.view",
      "contacts.create",
      "contacts.edit",
      "documents.view",
      "documents.create",
      "hr.view",
    ],
    scope: { services: "all", sales: "all", contacts: "all", crm: "own", hr: "own" },
    grants: { "services.assign": true, "services.possession": true, "sales.commissions": "none", "contacts.cnic": true },
  },
]
