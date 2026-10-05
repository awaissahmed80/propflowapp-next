// Workspace role permissions, used by the server, the UI and the default-role seed (so no path
// aliases here). A role's permissions are a list:
//   ["*"]                                  everything in every app (Owner, Administrator)
//   ["crm.view", "crm.create", "operations.view"…]   app code + action
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
  operations: {
    scopes: ["own", "team", "all"],
    noun: "bookings, receipts and installments",
    grants: [
      { key: "operations.discount", label: "Extra discount on bookings", hint: "Up to this share of the list price, on top of the plan discount.", type: "percent", max: 10 },
      toggle("operations.reassign", "Give bookings to other people", "Change who handles a booking. Assignment rules still apply."),
      toggle("operations.receipts", "Record payments"),
      toggle("operations.cheques", "Clear or bounce cheques"),
      toggle("operations.allot", "Issue allotment letters"),
      toggle("operations.cancel", "Cancel bookings", "Puts the unit back on sale and works out the refund."),
      {
        key: "operations.commissions",
        label: "See commissions",
        type: "choice",
        options: [
          ["none", "None"],
          ["own", "Their own"],
          ["all", "Everyone's"],
        ],
      },
      toggle("operations.pay-commissions", "Pay commissions"),
    ],
  },
  contacts: {
    scopes: ["linked", "all"],
    noun: "contacts",
    grants: [toggle("contacts.cnic", "See full CNIC numbers", "Otherwise shown as 35202-•••••••-1 everywhere, including Operations.")],
  },
  estate: {
    scopes: ["own", "team", "all"],
    noun: "service requests",
    grants: [
      toggle("estate.assign", "Assign requests to other people", "Without it, requests they log stay with them."),
      toggle("estate.ndc", "Issue NDCs", "Only possible when the buyer has no overdue dues."),
      toggle("estate.transfer", "Approve and complete transfers", "Moves the file to the new owner."),
      toggle("estate.possession", "Hand over possession"),
      toggle("estate.waive", "Waive fees"),
    ],
  },
  // Who sees which document type is set per type (Documents › Customize); here only sharing
  documents: {
    scopes: ["all"],
    noun: "documents",
    grants: [toggle("documents.share", "Share documents outside the workspace", "Links that expire; buyer and HR files can't be shared.")],
  },
  // One set of books: no per-person records. Approve = posts directly; without it, vouchers and
  // payments wait in Approvals for someone who has it.
  finance: {
    scopes: ["all"],
    noun: "vouchers, receipts and payments",
    grants: [
      toggle("finance.cheques", "Clear and bounce cheques", "Also from a booking's payments in Operations."),
      toggle("finance.refunds", "Pay refunds to buyers", "For canceled bookings."),
      toggle("finance.void", "Void posted vouchers", "Posts a reversing entry; nothing is deleted."),
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
      ...["view", "create", "edit"].map((a) => `portfolio.${a}`),
      ...["view", "create", "edit", "delete", "export"].map((a) => `crm.${a}`),
      ...["view", "create", "edit", "approve", "export"].map((a) => `operations.${a}`),
      "estate.view",
      "finance.view",
      "hr.view",
      "dashboards.view",
      "documents.view",
      "documents.create",
      ...["view", "create", "edit", "export"].map((a) => `contacts.${a}`),
      ...["view", "create", "edit", "delete", "approve", "export"].map((a) => `campaigns.${a}`),
    ],
    scope: { crm: "all", operations: "all", contacts: "all", estate: "all", hr: "all" },
    grants: {
      "crm.reassign": true,
      "operations.discount": 5,
      "operations.receipts": true,
      "operations.cheques": false,
      "operations.allot": true,
      "operations.cancel": true,
      "operations.reassign": true,
      "operations.commissions": "all",
      "operations.pay-commissions": false,
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
      "portfolio.view",
      "portfolio.create",
      "crm.view",
      "crm.create",
      "crm.edit",
      "crm.export",
      "operations.view",
      "operations.create",
      "operations.edit",
      "hr.view",
      "documents.view",
      "contacts.view",
      "contacts.create",
      "contacts.edit",
      "campaigns.view",
    ],
    scope: { crm: "team", operations: "team", contacts: "linked", hr: "team" },
    grants: { "crm.reassign": true, "operations.discount": 2, "operations.receipts": true, "operations.commissions": "own", "contacts.cnic": true, "hr.approve-leave": true },
  },
  {
    code: "sales-agent",
    name: "Sales Agent",
    description: "Works assigned leads and books units",
    permissions: [
      "portfolio.view",
      "portfolio.create",
      "crm.view",
      "crm.create",
      "crm.edit",
      "operations.view",
      "operations.create",
      "hr.view",
      "documents.view",
      "contacts.view",
      "contacts.create",
      "contacts.edit",
      "campaigns.view",
    ],
    scope: { crm: "own", operations: "own", contacts: "linked", hr: "own" },
    grants: { "operations.discount": 1, "operations.receipts": true, "operations.commissions": "own", "contacts.cnic": true },
  },
  {
    code: "accountant",
    name: "Accountant",
    description: "Receipts, receivables, payroll and books",
    permissions: [
      "estate.view",
      "estate.approve",
      ...["view", "create", "edit", "approve", "export"].map((a) => `finance.${a}`),
      ...["view", "create", "edit", "export"].map((a) => `hr.${a}`),
      "dashboards.view",
      "documents.view",
      "documents.create",
      "contacts.view",
      "contacts.create",
      "contacts.edit",
      "operations.view",
      "operations.edit",
      "operations.export",
    ],
    scope: { crm: "own", operations: "all", contacts: "all", estate: "all", hr: "all", finance: "all" },
    grants: {
      "operations.receipts": true,
      "operations.cheques": true,
      "finance.cheques": true,
      "finance.refunds": true,
      "finance.void": true,
      "operations.commissions": "all",
      "operations.pay-commissions": true,
      "contacts.cnic": true,
      "estate.ndc": true,
      "estate.waive": true,
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
    permissions: ["portfolio.view", "portfolio.create", "portfolio.edit", "crm.view", "crm.create", "crm.edit", "operations.view", "operations.create", "documents.view", "contacts.view"],
    scope: { crm: "own", operations: "own", contacts: "linked" },
    grants: { "operations.discount": 0, "operations.commissions": "own", "contacts.cnic": false },
  },
  {
    code: "estate-officer",
    name: "Estate Officer",
    description: "Runs the estate office: transfers, NDC, possession, maintenance and complaints",
    permissions: [
      "estate.view",
      "estate.create",
      "estate.edit",
      "estate.export",
      "operations.view",
      "portfolio.view",
      "contacts.view",
      "contacts.create",
      "contacts.edit",
      "documents.view",
      "documents.create",
      "hr.view",
    ],
    scope: { estate: "all", operations: "all", contacts: "all", crm: "own", hr: "own" },
    grants: { "estate.assign": true, "estate.possession": true, "operations.commissions": "none", "contacts.cnic": true },
  },
]
