// Approval types and statuses, for the inbox and the apps that ask. Each type's server side
// (who can decide, what approving does) is in server/handlers.js.
export const APPROVAL_TYPES = {
  "price-list": { label: "Price list", app: "portfolio", icon: "price-tag-3-line", color: "amber" },
  "service-transfer": { label: "Ownership transfer", app: "estate", icon: "arrow-left-right-line", color: "teal" },
  receipt: { label: "Payment received", app: "operations", icon: "money-dollar-circle-line", color: "green" },
  cheque: { label: "Cheque status", app: "operations", icon: "bank-card-2-line", color: "sky" },
  cancellation: { label: "Booking cancellation", app: "operations", icon: "close-circle-line", color: "red" },
  "commission-payout": { label: "Commission payout", app: "operations", icon: "percent-line", color: "violet" },
  voucher: { label: "Voucher", app: "finance", icon: "file-list-3-line", color: "blue" },
  refund: { label: "Refund", app: "finance", icon: "refund-2-line", color: "amber" },
}

export const APPROVAL_STATUS = {
  pending: { label: "Waiting", color: "amber" },
  approved: { label: "Approved", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  withdrawn: { label: "Withdrawn", color: "gray" },
}
