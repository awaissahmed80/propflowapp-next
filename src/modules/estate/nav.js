// Estate Management sidebar; description is the page subtitle
export const SERVICES_NAV = [
  {
    items: [
      { label: "Overview", icon: "dashboard-line", to: "/estate-management", end: true, description: "Open requests, overdue items and complaints" },
      { label: "Service desk", icon: "inbox-line", to: "/estate-management/requests", description: "Every request from buyers and residents" },
    ],
  },
  {
    label: "Ownership",
    items: [
      { label: "Transfers", icon: "arrow-left-right-line", to: "/estate-management/transfers", feature: "transfers", description: "Files changing hands: papers, NDC, fee, biometric and the new owner" },
      { label: "NDC", icon: "shield-check-line", to: "/estate-management/ndc", feature: "ndc-possession", description: "No demand certificates for transfers, mortgages and sales" },
      { label: "Possession", icon: "key-2-line", to: "/estate-management/possession", feature: "ndc-possession", description: "Demarcation, possession letters and handover" },
    ],
  },
  {
    label: "Residents",
    items: [{ label: "Complaints", icon: "error-warning-line", to: "/estate-management/complaints", feature: "complaints", description: "Maintenance and site complaints, by category and priority" }],
  },
  {
    label: "Setup",
    items: [{ label: "Customize", icon: "equalizer-line", to: "/estate-management/customize", description: "Fees and timelines per request, and this app's lists & labels" }],
  },
]

// A page's sidebar entry (label, description, feature) by its path
export const servicesNavItem = (to) => SERVICES_NAV.flatMap((g) => g.items).find((i) => i.to === to)
