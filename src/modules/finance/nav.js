// Finance sidebar; description is the page subtitle
export const FINANCE_NAV = [
  {
    items: [{ label: "Overview", icon: "dashboard-line", to: "/finance", end: true, description: "Cash and bank, money in and out, and what's waiting" }],
  },
  {
    label: "Money in",
    items: [
      { label: "Receipts", icon: "money-dollar-circle-line", to: "/finance/receipts", feature: "collections", description: "Every payment from buyers, from Operations and the cashier" },
      { label: "Cheques", icon: "bank-card-2-line", to: "/finance/cheques", feature: "banking", description: "Cheques and pay orders in clearing: clear or bounce them" },
      { label: "Payment requests", icon: "file-text-line", to: "/finance/payment-requests", feature: "collections", description: "Invoices to buyers for installments due and fees" },
    ],
  },
  {
    label: "Money out",
    items: [
      { label: "Vouchers", icon: "file-list-3-line", to: "/finance/vouchers", description: "Payments, receipts, transfers and journals, posted or waiting" },
      { label: "Refunds", icon: "refund-2-line", to: "/finance/refunds", description: "What canceled bookings' buyers are owed, and paying it" },
      { label: "Vendors", icon: "store-2-line", to: "/finance/vendors", feature: "vendors", description: "Contractors and suppliers, with income tax withholding" },
    ],
  },
  {
    label: "Books",
    items: [
      { label: "Bank & cash", icon: "bank-line", to: "/finance/banks", description: "Balances of every cash and bank account" },
      { label: "Chart of accounts", icon: "node-tree", to: "/finance/accounts", description: "Accounts and balances; open one for its statement" },
      { label: "Reports", icon: "bar-chart-2-line", to: "/finance/reports", description: "Trial balance, profit & loss, balance sheet and more" },
    ],
  },
  {
    label: "Setup",
    items: [{ label: "Customize", icon: "equalizer-line", to: "/finance/customize", description: "Closed periods, the default account, and Finance's lists & labels" }],
  },
]
