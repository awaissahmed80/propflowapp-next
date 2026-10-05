// Contacts sidebar; description is the page subtitle. "By type" items are added per contact type
// (the contact-type list) by the layout.
export const CONTACTS_NAV = [
  {
    items: [
      { label: "Overview", icon: "dashboard-line", to: "/contacts", end: true, description: "Who's in the directory, what's new and what needs tidying" },
      { label: "All contacts", icon: "contacts-book-2-line", to: "/contacts/all", description: "Everyone the business deals with: leads, customers, owners, dealers, vendors and staff" },
    ],
  },
  {
    label: "Review",
    items: [
      { label: "Missing CNIC", icon: "id-card-line", to: "/contacts/missing-cnic", feature: "review", description: "Customers and owners without a CNIC, needed for bookings, transfers and NDCs" },
      { label: "Possible duplicates", icon: "git-merge-line", to: "/contacts/duplicates", feature: "review", description: "The same person entered twice: same CNIC, mobile or name. Merge them into one." },
    ],
  },
  {
    label: "Setup",
    items: [{ label: "Customize", icon: "equalizer-line", to: "/contacts/customize", description: "Contact types and other lists shared across apps" }],
  },
]

export const contactsNavItem = (to) => CONTACTS_NAV.flatMap((g) => g.items).find((i) => i.to === to)
