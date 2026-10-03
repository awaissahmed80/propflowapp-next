// Project Portfolio sidebar; description is the page subtitle. Resale & Rentals are placeholders
// (ComingSoon) until they're built.
export const ESTATE_NAV = [
  { items: [{ label: "Overview", icon: "dashboard-line", to: "/project-portfolio", end: true, description: "Inventory health, availability and pricing across all projects" }] },
  {
    label: "Development",
    items: [
      { label: "Projects", icon: "community-line", to: "/project-portfolio/projects", description: "Societies, phases and blocks" },
      { label: "Inventory", icon: "layout-grid-line", to: "/project-portfolio/inventory", description: "Plots, files, houses, apartments and shops with live status" },
      { label: "Price Lists", icon: "price-tag-3-line", to: "/project-portfolio/price-lists", feature: "price-lists", description: "Rates, premiums, charges and payment plans, versioned per project" },
    ],
  },
  {
    label: "Resale & Rentals",
    items: [
      { label: "Listings", icon: "home-4-line", to: "/project-portfolio/listings", feature: "resale", description: "Resale and rental stock, portal syndication and enquiries" },
      { label: "Rentals", icon: "key-2-line", to: "/project-portfolio/rentals", feature: "resale", description: "Tenancies, rent schedules and renewals" },
      { label: "Owners", icon: "contacts-book-2-line", to: "/project-portfolio/owners", feature: "resale", description: "Property owners and landlords with their CNIC and documents" },
    ],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", icon: "bar-chart-2-line", to: "/project-portfolio/reports", feature: "reports", description: "Availability, stock, premiums, holds, dealer quotas and current rates" }],
  },
  { label: "Setup", items: [{ label: "Customize", icon: "equalizer-line", to: "/project-portfolio/customize", description: "Unit types, statuses, premium features, authorities and other Project Portfolio choices" }] },
]
