// HR & Payroll sidebar; description is the page subtitle
// need: what the role must have, as the page checks it (AppShell locks it otherwise, see portal/nav-access.js)
export const HR_NAV = [
  {
    items: [
      { label: "Overview", icon: "dashboard-line", to: "/hrm", end: true, description: "People, who's away, and this month's payroll" },
      { label: "Employees", icon: "team-line", to: "/hrm/employees", description: "Everyone on the payroll, with or without a portal login" },
      { label: "Leave", icon: "calendar-check-line", to: "/hrm/leave", feature: "leave", description: "Requests, approvals and who's away" },
      { label: "Duty roster", icon: "calendar-schedule-line", to: "/hrm/roster", feature: "attendance", description: "Posts, shifts, cover and daily attendance" },
    ],
  },
  {
    label: "Payroll",
    items: [
      {
        label: "Payroll",
        icon: "money-rupee-circle-line",
        to: "/hrm/payroll",
        feature: "payroll",
        need: { grant: ["hr.payroll", "hr.salaries"] },
        description: "Monthly salary runs: review, approve, then pay through Finance",
      },
      { label: "Loans & advances", icon: "hand-coin-line", to: "/hrm/loans", feature: "payroll", description: "Given now, recovered through payroll" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", icon: "bar-chart-2-line", to: "/hrm/reports", description: "Headcount, payroll, tax, EOBI, leave and attendance" }],
  },
  {
    label: "Setup",
    items: [{ label: "Customize", icon: "equalizer-line", to: "/hrm/customize", description: "Payroll rules, and HR's lists & labels" }],
  },
]

export const hrNavItem = (to) => HR_NAV.flatMap((g) => g.items).find((i) => i.to === to)
