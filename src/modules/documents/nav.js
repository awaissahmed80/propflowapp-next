// Documents sidebar; description is the page subtitle. The layout adds a "Company documents"
// group (one item per document type, with counts) and a "From apps" group (files other apps keep).
export const DOCUMENTS_NAV = [
  {
    items: [
      { label: "All documents", icon: "folder-5-line", to: "/documents", end: true, description: "Every company document you can see, newest first" },
      { label: "Expiring", icon: "alarm-warning-line", to: "/documents/expiring", feature: "expiry", description: "NOCs, agreements and licenses expired or expiring in the next 90 days" },
      { label: "Shared links", icon: "share-forward-line", to: "/documents/shared", feature: "sharing", description: "Links to documents shared outside the workspace, and who opened them" },
    ],
  },
  {
    label: "Setup",
    items: [{ label: "Customize", icon: "equalizer-line", to: "/documents/customize", description: "Document types and who can see each" }],
  },
]

// Files other apps store, shown read-only here with a link back to their record
export const APP_SOURCES = [
  { key: "projects", label: "Project files", icon: "community-line", app: "portfolio", ownerTypes: ["project", "project_update"], description: "Plans, approvals and photos kept on projects" },
  {
    key: "bookings",
    label: "Booking files",
    icon: "folder-shield-2-line",
    app: "operations",
    ownerTypes: ["booking", "receipt", "booking-activity"],
    description: "Buyer documents, payment proofs and attachments kept on bookings",
  },
  { key: "pages", label: "Landing page images", icon: "pages-line", app: "campaigns", ownerTypes: ["landing-page"], description: "Images used on campaign landing pages" },
]

export const documentsNavItem = (to) => DOCUMENTS_NAV.flatMap((g) => g.items).find((i) => i.to === to)
