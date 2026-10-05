// Status and type lists shown in the console. Values are what the pf_platform tables store.

export const TENANT_STATUSES = [
  { value: "provisioning", label: "Setting up", color: "gray" },
  { value: "trial", label: "Trial", color: "sky" },
  { value: "active", label: "Active", color: "green" },
  { value: "past_due", label: "Past due", color: "red" },
  { value: "suspended", label: "Suspended", color: "red" },
  { value: "closed", label: "Closed", color: "gray" },
]

// "awaiting" isn't stored: it's an unpaid invoice with a bank transfer waiting to be matched
export const INVOICE_STATUSES = [
  { value: "draft", label: "Draft", color: "gray" },
  { value: "issued", label: "Unpaid", color: "amber" },
  { value: "awaiting", label: "Transfer to verify", color: "amber" },
  { value: "overdue", label: "Overdue", color: "red" },
  { value: "paid", label: "Paid", color: "green" },
  { value: "void", label: "Void", color: "gray" },
]

export const ENQUIRY_STATUSES = [
  { value: "new", label: "New", color: "sky" },
  { value: "contacted", label: "Contacted", color: "violet" },
  { value: "demo", label: "Demo booked", color: "amber" },
  { value: "trial", label: "Trial started", color: "blue" },
  { value: "won", label: "Won", color: "green" },
  { value: "lost", label: "Lost", color: "gray" },
]

export const REQUEST_STATUSES = [
  { value: "open", label: "Open", color: "sky" },
  { value: "in_progress", label: "In progress", color: "violet" },
  { value: "waiting", label: "Waiting on customer", color: "amber" },
  { value: "resolved", label: "Resolved", color: "green" },
]

export const REQUEST_CATEGORIES = [
  { value: "problem", label: "Problem", icon: "bug-line" },
  { value: "feature", label: "Feature request", icon: "lightbulb-line" },
  { value: "question", label: "Question", icon: "question-line" },
  { value: "billing", label: "Billing", icon: "bank-card-line" },
]

export const PRIORITIES = [
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
]

// audit_log.action → what the console shows
export const AUDIT_ACTIONS = {
  "plan.created": "Added plan",
  "plan.updated": "Changed plan",
  "plan.disabled": "Disabled plan",
  "plan.enabled": "Enabled plan",
  "plan.deleted": "Deleted plan",
  "payments.updated": "Changed payment methods",
  "site.maintenance_on": "Turned maintenance mode on",
  "site.maintenance_off": "Put the site back live",
  "site.maintenance_updated": "Changed the maintenance notice",
  "signup.opened": "Opened self sign-up",
  "signup.invite_only": "Made sign-up invitation only",
  "pricing.shown": "Showed prices on the website",
  "pricing.hidden": "Hid prices on the website",
  "workspace_invite.sent": "Invited a new workspace",
  "workspace_invite.resent": "Resent workspace invitation",
  "workspace_invite.revoked": "Canceled workspace invitation",
  "tenant.created": "Workspace created",
  "tenant.suspended": "Suspended workspace",
  "tenant.reactivated": "Reactivated workspace",
  "tenant.plan_changed": "Changed plan",
  "tenant.trial_extended": "Changed trial or renewal date",
  "tenant.details_changed": "Edited workspace details",
  "tenant.setup_retried": "Retried workspace setup",
  "tenant.apps_changed": "Changed apps",
  "invoice.created": "Created draft invoice",
  "invoice.issued": "Issued invoice",
  "invoice.updated": "Edited invoice",
  "invoice.payment_confirmed": "Recorded payment",
  "invoice.voided": "Voided invoice",
  "invoice.status_changed": "Changed invoice status",
  "impersonation.started": "Started impersonation",
  "impersonation.ended": "Ended impersonation",
  "integration.status": "Changed integration status",
  "integration.workspace": "Switched an integration for a workspace",
  "meta.disconnected": "Disconnected Facebook lead ads",
  "team.invited": "Invited to the team",
  "team.invite_resent": "Resent team invitation",
  "team.invite_revoked": "Canceled team invitation",
  "team.joined": "Joined the team",
  "team.role_changed": "Changed team role",
  "team.deactivated": "Removed console access",
  "team.reactivated": "Restored console access",
}

export const byValue = (list) => Object.fromEntries(list.map((s) => [s.value, s]))
