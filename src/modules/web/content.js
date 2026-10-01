// Copy for the marketing home page (propflowapp.com). Pakistan only for now: Marla and Kanal,
// Lac and Crore, LDA / CDA, files and balloting. Prices are not here: they come from the plans
// in the console, so the page always matches what customers are charged.

const APPS = [
  { name: "Estate Management", icon: "building-2-line", color: "bg-orange-500", text: "Projects, inventory, price lists, resale and rentals", live: true },
  { name: "CRM", icon: "user-star-line", color: "bg-sky-500", text: "Leads, follow-ups, site visits and pipeline", live: true },
  { name: "Campaigns", icon: "megaphone-line", color: "bg-rose-500", text: "Campaigns, lead forms, landing pages and cost per lead", live: true },
  { name: "Contacts", icon: "contacts-book-2-line", color: "bg-sky-600", text: "One directory for buyers, owners, tenants and brokers", live: true },
  { name: "Users & Teams", icon: "shield-user-line", color: "bg-cyan-600", text: "Teams, roles, permissions and broker logins", live: true },
  { name: "Sales", icon: "hand-coin-line", color: "bg-blue-600", text: "Reservation, booking, payment schedule and allotment" },
  { name: "Customer Services", icon: "customer-service-2-line", color: "bg-teal-600", text: "Transfers, handovers and complaints" },
  { name: "Finance", icon: "bank-line", color: "bg-emerald-600", text: "Installment collection, receipts, cheques and banking" },
  { name: "HR & Payroll", icon: "team-line", color: "bg-violet-600", text: "Employees, rosters, attendance and payroll" },
]

const TRUST = [
  { icon: "database-2-line", title: "Your own database", text: "Every company's data is kept in its own database, never mixed with anyone else's." },
  { icon: "shield-keyhole-line", title: "Roles for every app", text: "Decide who can view, edit, approve and export in each app, down to brokers." },
  { icon: "history-line", title: "Activity log", text: "Sign-ins, role changes and sensitive actions are recorded with who did what, and when." },
  { icon: "building-4-line", title: "Several companies, one login", text: "Groups with more than one company switch between workspaces without signing out." },
]

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#local", label: "Made for Pakistan" },
  { href: "#apps", label: "Apps" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
]

const BUILT_FOR = [
  { icon: "community-line", label: "Housing societies" },
  { icon: "building-2-line", label: "High-rise apartments" },
  { icon: "store-2-line", label: "Commercial plazas" },
  { icon: "home-8-line", label: "Farmhouse schemes" },
  { icon: "shake-hands-line", label: "Agencies & dealers" },
]

const PAINS = [
  {
    icon: "file-copy-2-line",
    title: "The same plot sold twice",
    before: "Site office, head office and three dealers working from different Excel files.",
    after: "One live inventory. Holds expire on their own, and dealers only see their quota.",
  },
  {
    icon: "chat-off-line",
    title: "Facebook leads going cold",
    before: "Enquiries sitting in a WhatsApp group until someone remembers to call.",
    after: "Every lead gets an agent and a first call planned within 15 minutes, with overdue alerts.",
  },
  {
    icon: "question-line",
    title: "No idea what a booking cost",
    before: "Lakhs spent on ads and expos, and no way to tell which one brought buyers.",
    after: "Spend, leads, site visits and bookings for every campaign and channel, in Rupees.",
  },
]

const FEATURES = [
  {
    id: "inventory",
    tab: "Inventory",
    icon: "building-2-line",
    eyebrow: "Projects & inventory",
    title: "Every phase, block, plot and file, live",
    text: "Set up your society or tower once: phases, blocks, streets and every unit. Plots, open files, houses, apartments, shops and offices sit side by side, and everyone sees the same availability.",
    points: [
      "Marla, Kanal and sq ft, with your society's own marla size (225 or 272 sq ft)",
      "Open files and balloted plots in the same project",
      "LDA, CDA, RDA and DHA approvals with NOC numbers on record",
      "Holds with an expiry time and a reason, so stock is never stuck",
    ],
    screen: "project",
    url: "portal.propflowapp.com/estate/projects/skyline-enclave",
    lenses: [
      { callout: "approval", label: "Approval status on the project, where buyers ask first", at: { right: "-8%", top: "-10%" }, width: "42%" },
      { callout: "availability", label: "Live availability by status for the whole project", at: { right: "-8%", top: "34%" }, width: "34%" },
      { callout: "authority", label: "Your marla size and NOC number", at: { left: "-8%", bottom: "-10%" }, width: "32%" },
    ],
  },
  {
    id: "price-lists",
    tab: "Pricing",
    icon: "price-tag-3-line",
    eyebrow: "Price lists & premiums",
    title: "Prices that follow your price list, automatically",
    text: "Base rates per marla or per sq ft, premiums for corner, park-facing, main boulevard and west-open units, and payment plans, all versioned. Draft next year's list, get it approved, and it switches on by itself.",
    points: [
      "Corner, park-facing and boulevard premiums added to every unit's price",
      "Rate per marla shown next to every price, in Lac and Crore",
      "Cash and 2-, 3- and 4-year plans with down payment, installments and balloon payments",
      "Price list history: who changed what, and from which date",
    ],
    screen: "inventory",
    url: "portal.propflowapp.com/estate/inventory",
    lenses: [
      { callout: "premium", label: "Premiums and rate per marla on every unit", at: { left: "-8%", top: "26%" }, width: "40%" },
      { callout: "stock", label: "Units and available stock value across all projects", at: { right: "-8%", top: "-10%" }, width: "32%" },
    ],
  },
  {
    id: "crm",
    tab: "CRM",
    icon: "user-star-line",
    eyebrow: "CRM",
    title: "A sales pipeline your agents will actually use",
    text: "Leads from Facebook, Instagram, your website, walk-ins and dealer referrals land on one board. Agents see who to call next, managers see who is falling behind, and every lead shows matching available units you can hold in one click.",
    points: [
      "Follow-ups, site visits and office meetings with overdue alerts",
      "One contact, many enquiries: a buyer's history across all projects",
      "Matching plots and files for each lead's size and budget",
      "Team leads see their team; agents see their own leads",
    ],
    screen: "crm-board",
    url: "portal.propflowapp.com/crm/leads",
    lenses: [
      { callout: "card", label: "Size, project, budget, source and the next call on every card", at: { right: "-7%", top: "12%" }, width: "28%" },
      { screen: "lead", callout: "header", label: "Status, priority, interest and budget on every lead", at: { left: "-8%", bottom: "-10%" }, width: "38%" },
    ],
  },
  {
    id: "campaigns",
    tab: "Campaigns",
    icon: "megaphone-line",
    eyebrow: "Campaigns",
    title: "Know what every lead and every booking cost",
    text: "Run launches, booking drives, expos and overseas roadshows with goals and budgets per channel. Every lead is tagged with its campaign and channel, so cost per lead and cost per booking are always up to date.",
    points: [
      "Goals for leads, site visits and bookings, with pacing",
      "Cost per lead by channel: Facebook, Instagram, Google, portals, SMS, expos",
      "Tracking links for every ad, so each lead is credited to the right channel",
      "Lead-to-booking funnel with the top reasons leads are lost",
    ],
    screen: "campaign",
    url: "portal.propflowapp.com/campaigns/skyline-enclave-phase-2",
    lenses: [
      { callout: "cpl", label: "Cost per lead and per booking", at: { right: "-8%", top: "-12%" }, width: "24%" },
      { callout: "goals", label: "Goals, with cost per lead held to target", at: { left: "-8%", bottom: "-14%" }, width: "32%" },
      { callout: "funnel", label: "From lead to site visit to booking", at: { right: "-8%", bottom: "-10%" }, width: "32%" },
    ],
  },
  {
    id: "pages",
    tab: "Landing pages",
    icon: "pages-line",
    eyebrow: "Landing pages & lead forms",
    title: "Launch pages in minutes, not weeks",
    text: "Pick a template (project launch, pre-launch registration, booking drive, overseas Pakistanis or possession ready) and it fills in your approvals, amenities and starting prices from inventory. Add a lead form, publish, and entries go straight to CRM.",
    points: [
      "Templates written for Pakistani property marketing",
      "Starting prices pulled from your live inventory",
      "Lead forms for your own website with one line of embed code",
      "Mobile preview, because most of your buyers are on their phones",
    ],
    screen: "page-editor",
    url: "portal.propflowapp.com/campaigns/pages/phase-2-launch",
    lenses: [{ callout: "phone", label: "See it exactly as buyers will on their phones", at: { left: "-8%", top: "10%" }, width: "34%" }],
  },
  {
    id: "resale",
    tab: "Resale & rentals",
    icon: "home-4-line",
    eyebrow: "Resale & rentals",
    title: "Resale and rentals, handled too",
    text: "List owners' plots and houses, track enquiries by portal, and run tenancies with a rent ledger, police verification status and renewals. Owners keep their CNIC, filer status and bank details on file.",
    points: [
      "Listings for sale or rent, with owners, demand and mandate",
      "Enquiries per listing from property portals, social media and walk-ins",
      "Tenancies with rent due, deposits and yearly increases",
      "Filer and non-filer owners, NTN and IBAN on record",
    ],
    screen: "listings",
    url: "portal.propflowapp.com/estate/listings",
    lenses: [
      { callout: "card", label: "Demand, status, portals and new enquiries on every listing", at: { right: "-8%", bottom: "-12%" }, width: "34%" },
      { callout: "enquiries", label: "Enquiries waiting for a reply", at: { left: "-8%", top: "-6%" }, width: "28%" },
    ],
  },
  {
    id: "reports",
    tab: "Reports",
    icon: "file-chart-line",
    eyebrow: "Reports",
    title: "Reports your MD will actually open",
    text: "Ready-made reports for inventory, dealers, rentals and campaigns: filtered by project or campaign and exported to Excel or PDF in one click.",
    points: [
      "Availability by block, stock by size and premium units",
      "Dealer quotas, holds about to lapse and rent roll",
      "Cost per lead, goals and pacing, and how fast agents call new leads",
      "Excel, PDF and print, with your company name on every page",
    ],
    screen: "report",
    url: "portal.propflowapp.com/campaigns/reports/follow-up",
    lenses: [{ callout: "tiles", label: "How fast your team calls new leads", at: { left: "-8%", top: "-8%" }, width: "30%" }],
  },
]

const PAKISTAN = [
  { icon: "ruler-2-line", title: "Marla, Kanal & sq ft", text: "With your society's marla size, used for every rate and report." },
  { icon: "money-rupee-circle-line", title: "Lac & Crore", text: "Every price, budget and total in the format your buyers use." },
  { icon: "government-line", title: "LDA, CDA, RDA, DHA", text: "Approval status and NOC numbers on every project." },
  { icon: "file-list-3-line", title: "Files & balloting", text: "Open files and balloted plots in the same inventory." },
  { icon: "lock-line", title: "Token holds", text: "Holds with an expiry and a reason, released automatically." },
  { icon: "shake-hands-line", title: "Dealer quotas", text: "Dealers get their own login, limited to their allocated units." },
  { icon: "plane-line", title: "Overseas Pakistanis", text: "Tagged leads, remote booking pages and roadshow campaigns." },
  { icon: "whatsapp-line", title: "WhatsApp first", text: "One-tap WhatsApp from every lead, owner and contact." },
]

const FAQ = [
  {
    q: "Is PropFlow only for developers?",
    a: "It's built for developers and housing societies first: projects, inventory, price lists, files and balloting. Real estate agencies and dealers use the same CRM, campaigns, and resale and rentals tools.",
  },
  {
    q: "Can we bring our existing inventory and leads?",
    a: "Yes. Share your spreadsheets of projects, units and leads, and they'll be loaded into your workspace during setup.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes. PropFlow works in the browser on phones and tablets, so agents at the site office or out on site visits can log calls and hold units.",
  },
  {
    q: "Can dealers use it?",
    a: "Dealers get their own login that shows only their allocated quota and their own leads, so they can hold and sell without seeing the rest of your stock.",
  },
  {
    q: "How does the free trial work?",
    a: "Every feature of the plan you choose, free for the trial period, no card needed. Request a trial and we'll set up your workspace and email you the link. Add your projects and team, and at the end pick a plan to keep your data, or walk away.",
  },
  {
    q: "Which apps are available today?",
    a: "Estate Management, CRM, Campaigns, Contacts and Users & Teams are live. Sales, Customer Services, Finance and HR & Payroll are coming next.",
  },
  {
    q: "Who owns our data?",
    a: "You do. Each company has its own database, and you can export your records to Excel at any time.",
  },
]

export const CONTENT = {
  title: "PropFlow · Real estate ERP made for Pakistan",
  description: "Inventory in Marla and Kanal, price lists and premiums, a CRM for every enquiry and campaigns that show what each booking cost. Built for Pakistani developers, housing societies and agencies.",
  keywords: [
    "real estate ERP Pakistan",
    "real estate software Pakistan",
    "housing society software",
    "property management software Pakistan",
    "real estate CRM Pakistan",
    "plot inventory software",
    "installment plan software",
    "real estate developer software",
    "marla kanal inventory",
  ],
  nav: NAV,
  hero: {
    eyebrow: "For developers, housing societies and agencies",
    title: "The real estate ERP,",
    highlight: "built for Pakistan",
    text: "PropFlow runs your projects end to end: inventory in Marla and Kanal, price lists and premiums, a CRM for every enquiry, and campaigns that show exactly what each booking cost. All in Lac and Crore.",
    note: "No card needed. For projects in Lahore, Karachi, Islamabad and beyond.",
    lenses: [
      { callout: "stock", label: "Available stock, valued in Crore", at: { right: "-8%", top: "-8%" }, width: "28%" },
      { callout: "attention", label: "Holds about to lapse, rent overdue and new enquiries", at: { left: "-8%", bottom: "-12%" }, width: "32%" },
    ],
  },
  builtFor: BUILT_FOR,
  pains: {
    title: "Registers, Excel sheets and WhatsApp groups can only take you so far",
    items: PAINS,
  },
  features: FEATURES,
  local: {
    eyebrow: "Made for Pakistan",
    title: "Speaks the language of your market",
    text: "Not a foreign CRM with a Rupee sign bolted on. PropFlow is built around how property is sold here.",
    items: PAKISTAN,
  },
  apps: APPS.map((a) => ({
    ...a,
    text:
      a.name === "Customer Services"
        ? "Transfers, NDC, possession and complaints"
        : a.name === "Sales"
          ? "Token, booking, installment schedule and allotment"
          : a.text.replace("brokers", "dealers").replace("broker", "dealer"),
  })),
  trust: TRUST.map((t) => ({ ...t, text: t.text.replace("brokers", "dealers") })),
  faq: FAQ,
  cta: {
    title: "Ready to run your projects on PropFlow?",
    textOpen: "Start your {days}-day free trial today. No card needed, and your data stays if you continue.",
    textInvite: "Tell us about your company and projects, and our team will get your workspace ready.",
  },
  // The pricing card marked "Most popular", by plan code
  popularPlan: "growth",
}
