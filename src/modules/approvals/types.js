// Approval types and statuses, for the inbox and the apps that ask. Each type's server side
// (who can decide, what approving does) is in server/handlers.js.
export const APPROVAL_TYPES = {
  "price-list": { label: "Price list", app: "estate", icon: "price-tag-3-line", color: "amber" },
}

export const APPROVAL_STATUS = {
  pending: { label: "Waiting", color: "amber" },
  approved: { label: "Approved", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  withdrawn: { label: "Withdrawn", color: "gray" },
}
