// Sales sidebar; description is the page subtitle. soon: a ComingSoon placeholder until it's built.
// need: what the role must have, as the page checks it (AppShell locks it otherwise, see portal/nav-access.js)
export const SALES_NAV = [
  {
    items: [
      { label: "Overview", icon: "dashboard-line", to: "/operations", end: true, description: "Bookings, collections and overdue installments" },
      { label: "Bookings", icon: "hand-coin-line", to: "/operations/bookings", description: "Tokens, bookings and allotments with each buyer's payment schedule" },
    ],
  },
  {
    label: "Collections",
    items: [
      { label: "Installments", icon: "calendar-todo-line", to: "/operations/installments", feature: "installments", description: "Overdue and upcoming installments across every booking" },
      { label: "Receipts", icon: "receipt-line", to: "/operations/receipts", description: "Payments received, cheques in clearing and bounced cheques" },
    ],
  },
  {
    label: "Partners",
    items: [{ label: "Commissions", icon: "percent-line", to: "/operations/commissions", need: { grant: "operations.commissions" }, description: "Dealer and agent commission earned, due and paid" }],
  },
  { label: "Insights", items: [{ label: "Reports", icon: "bar-chart-2-line", to: "/operations/reports", description: "Sales, collections and receivables reports" }] },
  { label: "Setup", items: [{ label: "Customize", icon: "equalizer-line", to: "/operations/customize", description: "Booking stages, statuses and payment methods" }] },
]
