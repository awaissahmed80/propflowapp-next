// Estate Management sidebar; description is the page subtitle. Resale & Rentals are placeholders
// (ComingSoon) until they're built.
export const ESTATE_NAV = [
  { items: [{ label: "Overview", icon: "dashboard-line", to: "/estate", end: true, description: "Inventory health, availability and pricing across all projects" }] },
  {
    label: "Development",
    items: [
      { label: "Projects", icon: "community-line", to: "/estate/projects", description: "Societies, phases and blocks" },
      { label: "Inventory", icon: "layout-grid-line", to: "/estate/inventory", description: "Plots, files, houses, apartments and shops with live status" },
      { label: "Price Lists", icon: "price-tag-3-line", to: "/estate/price-lists", feature: "price-lists", description: "Rates, premiums, charges and payment plans, versioned per project" },
    ],
  },
  {
    label: "Resale & Rentals",
    items: [
      { label: "Listings", icon: "home-4-line", to: "/estate/listings", feature: "resale", description: "Resale and rental stock, portal syndication and enquiries" },
      { label: "Rentals", icon: "key-2-line", to: "/estate/rentals", feature: "resale", description: "Tenancies, rent schedules and renewals" },
      { label: "Owners", icon: "contacts-book-2-line", to: "/estate/owners", feature: "resale", description: "Property owners and landlords with their CNIC and documents" },
    ],
  },
  { label: "Insights", items: [{ label: "Reports", icon: "bar-chart-2-line", to: "/estate/reports", feature: "reports", description: "Availability, stock, premiums, holds, dealer quotas and current rates" }] },
  { label: "Setup", items: [{ label: "Lists & Labels", icon: "list-settings-line", to: "/estate/lists", description: "Unit types, statuses, premium features, authorities and other Estate Management choices" }] },
]
