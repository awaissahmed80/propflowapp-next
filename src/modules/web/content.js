// Copy for the marketing home page (propflowapp.com). Pakistan only for now: Marla and Kanal,
// Lac and Crore, LDA / CDA, files and balloting. SEO targets B2B software searches (real estate
// CRM / ERP in Pakistan, housing society software, files and balloting, installment plans, dealer
// quotas, NOC tracking, cost per booking), not consumer property searches. Only claim what the
// product does today. Prices are not here: they come from the plans
// in the console, so the page always matches what customers are charged.

const APPS = [
  { name: "Project Portfolio", icon: "community-line", color: "bg-orange-500", text: "Projects, inventory, price lists, premiums and dealer quotas", live: true },
  { name: "Campaigns", icon: "megaphone-line", color: "bg-rose-500", text: "Campaigns, lead forms, landing pages and cost per lead", live: true },
  { name: "CRM", icon: "user-star-line", color: "bg-sky-500", text: "Leads, follow-ups, site visits and pipeline", live: true },
  { name: "Contacts", icon: "contacts-book-2-line", color: "bg-sky-600", text: "One directory for buyers, owners, nominees and brokers", live: true },
  { name: "Users & Teams", icon: "shield-user-line", color: "bg-cyan-600", text: "Teams, roles, permissions and broker logins", live: true },
  { name: "Operations", icon: "flow-chart", color: "bg-blue-600", text: "Bookings, installment plans, allotments, KYC, handover and dealer commissions", live: true },
  { name: "Estate Management", icon: "home-gear-line", color: "bg-teal-600", text: "Transfers, NDC, possession, maintenance and complaints", live: true },
  { name: "Finance", icon: "bank-line", color: "bg-emerald-600", text: "Receipts, cheques, vouchers, refunds, vendors and your books, posted automatically", live: true },
  { name: "HR & Payroll", icon: "team-line", color: "bg-violet-600", text: "Employees, rosters, attendance and payroll" },
]

const TRUST = [
  { icon: "database-2-line", title: "Your own database", text: "Every company's data is kept in its own database, never mixed with anyone else's." },
  { icon: "shield-keyhole-line", title: "Roles for every app", text: "Decide who can view, edit, approve and export in each app, down to brokers." },
  { icon: "history-line", title: "Activity log", text: "Sign-ins, role changes and sensitive actions are recorded with who did what, and when." },
  { icon: "building-4-line", title: "Several companies, one login", text: "Groups with more than one company switch between workspaces without signing out." },
]

const NAV = [
  { href: "#why", label: "Why PropFlow" },
  { href: "#features", label: "Features" },
  { href: "#builder", label: "Page builder" },
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
  { icon: "hammer-line", label: "Builders" },
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
  {
    icon: "bank-card-2-line",
    title: "Installments chased from a register",
    before: "Due dates in a diary, cheques in a drawer, and a bounced cheque found out a month later.",
    after: "Every buyer's schedule, overdue alerts and a cheque register: cleared or bounced, and the installment is due again.",
  },
  {
    icon: "arrow-left-right-line",
    title: "Transfers and NDCs that take weeks",
    before: "Files passed between desks to check dues, papers and fees before anyone signs.",
    after: "A checklist for every transfer, NDC and possession, with dues checked automatically and the letter printed at the end.",
  },
  {
    icon: "shake-hands-line",
    title: "Dealers selling stock you don't have",
    before: "Dealers booking from an old list while the site office has already sold the unit.",
    after: "Dealer quotas on live inventory, their own login, and commission worked out with tax withheld.",
  },
]

// What PropFlow does that general-purpose CRMs and spreadsheets don't (the comparison table)
const DIFFERENT = [
  { feature: "Plots, files and units in Marla, Kanal and sq ft", detail: "With your society's own marla size (225 or 272 sq ft)", crm: "no", sheet: "partly" },
  { feature: "Open files and plot balloting", detail: "Unballoted files and balloted plots in one inventory", crm: "no", sheet: "partly" },
  { feature: "Token holds that expire on their own", detail: "No plot sold twice, no stock stuck on hold", crm: "no", sheet: "no" },
  { feature: "Dealer quota management", detail: "Dealers see and sell only their allocated units", crm: "no", sheet: "no" },
  { feature: "Price lists with premiums, in Lac and Crore", detail: "Corner, park-facing and boulevard premiums; rate per marla", crm: "no", sheet: "partly" },
  { feature: "Installment plans and cheque clearing", detail: "Down payment, installments, balloon; overdue and defaulter alerts", crm: "no", sheet: "partly" },
  { feature: "LDA, CDA, RDA and DHA NOC tracking", detail: "Approval status and NOC numbers on every project", crm: "no", sheet: "partly" },
  { feature: "Cost per lead and cost per booking", detail: "Every lead tagged with its campaign and channel", crm: "partly", sheet: "no" },
  { feature: "Landing page builder and lead forms", detail: "Templates for launches, expos and overseas Pakistanis", crm: "partly", sheet: "no" },
  { feature: "Transfers, NDC and possession letters", detail: "Checklists, fees and printed letters, after the sale", crm: "no", sheet: "no" },
  { feature: "Accounts posted automatically", detail: "Bookings, receipts, cheques, refunds and commissions in the books", crm: "no", sheet: "no" },
  { feature: "Approvals for money and critical actions", detail: "Discounts, refunds, cancellations and payments signed off", crm: "partly", sheet: "no" },
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
    url: "portal.propflowapp.com/project-portfolio/projects/ske",
    lenses: [
      { callout: "approval", label: "Approval status on the project, where buyers ask first", at: { left: "-8%", top: "-10%" }, width: "34%" },
      { callout: "availability", label: "Live availability by status for the whole project", at: { right: "-8%", top: "8%" }, width: "34%" },
      { callout: "authority", label: "Your marla size and NOC number", at: { right: "-8%", bottom: "-10%" }, width: "30%" },
    ],
  },
  {
    id: "price-lists",
    tab: "Pricing",
    icon: "price-tag-3-line",
    eyebrow: "Price lists & payment plans",
    title: "Prices that follow your price list, automatically",
    text: "Base rates per marla or per sq ft, premiums for corner, park-facing, main boulevard and west-open units, and payment plans, all versioned. Draft next year's list, get it approved, and apply it to your inventory in one click.",
    points: [
      "Corner, park-facing and boulevard premiums added to every unit's price",
      "Rate per marla shown next to every price, in Lac and Crore",
      "Cash and 2-, 3- and 4-year plans with down payment, installments, balloon and on-possession payments",
      "Versions of every list: who prepared it, who activated it, and from which date",
    ],
    screen: "price-list",
    url: "portal.propflowapp.com/project-portfolio/price-lists/pl-0002",
    lenses: [
      { callout: "plan", label: "Down payment, installments, balloon and possession, at a glance", at: { right: "-8%", top: "-10%" }, width: "40%" },
      { callout: "header", label: "Versioned lists: drafted, approved and activated", at: { left: "-8%", top: "-12%" }, width: "34%" },
      { screen: "inventory", callout: "premium", label: "Premiums and rate per marla on every unit", at: { left: "-8%", bottom: "-10%" }, width: "44%" },
    ],
  },
  {
    id: "crm",
    tab: "CRM",
    icon: "user-star-line",
    eyebrow: "CRM",
    title: "A sales pipeline your agents will actually use",
    text: "Leads from your ads, website, walk-ins and dealer referrals land on one board. Agents see who to call next, managers see who is falling behind, and every lead is scored on how engaged it is and whether it can afford what's available.",
    points: [
      "Follow-ups, site visits and office meetings with overdue alerts",
      "One contact, many enquiries: a buyer's history across all projects",
      "A lead score from engagement, budget against your cheapest matching unit, and intent",
      "Team leads see their team; agents see their own leads",
    ],
    screen: "crm-board",
    url: "portal.propflowapp.com/crm/leads",
    lenses: [
      { callout: "card", label: "Size, project, budget, source, score and the next call on every card", at: { right: "-7%", top: "12%" }, width: "28%" },
      { screen: "lead", callout: "score", label: "Every lead scored: engagement, affordability and intent", at: { left: "-8%", bottom: "-12%" }, width: "34%" },
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
    url: "portal.propflowapp.com/campaigns/all/cmp-0001",
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
    url: "portal.propflowapp.com/campaigns/pages/lp-0001",
    lenses: [
      { callout: "phone", label: "See it exactly as buyers will on their phones", at: { right: "-8%", top: "10%" }, width: "30%" },
      { callout: "sections", label: "Ready-made sections: prices, payment plan, approvals, location", at: { left: "-8%", bottom: "-10%" }, width: "24%" },
    ],
  },
  {
    id: "operations",
    tab: "Installments",
    icon: "calendar-check-line",
    eyebrow: "Bookings & installments",
    title: "Every booking, from token to handover",
    text: "A booking moves from token to KYC, allotment and handover, with its payment plan worked out from your price list. Receipts go to the oldest installment first, cheques wait in clearing, and overdue buyers show up before they become defaulters.",
    points: [
      "Payment schedules with down payment, monthly or quarterly installments and balloon payments",
      "Receipts by cash, bank transfer, pay order or cheque, each with a printed receipt",
      "Cheques in clearing: cleared counts the payment, bounced makes the installment due again",
      "Allotment letters once KYC is in and the down payment is paid, and dealer commission with tax withheld",
    ],
    screen: "booking",
    url: "portal.propflowapp.com/operations/bookings/bk-2025-000018",
    lenses: [
      { callout: "progress", label: "Where the booking stands, and what's received and still due", at: { right: "-8%", top: "-12%" }, width: "38%" },
      { screen: "installments", callout: "tiles", label: "Overdue, defaulters and what to collect, across every booking", at: { left: "-8%", bottom: "-12%" }, width: "40%" },
      { screen: "cheques", callout: "actions", label: "Clear or bounce cheques in one click", at: { right: "-8%", bottom: "-8%" }, width: "26%" },
    ],
  },
  {
    id: "estate",
    tab: "Transfers & NDC",
    icon: "arrow-left-right-line",
    eyebrow: "Estate Management",
    title: "Transfers, NDCs and possession without the file chasing",
    text: "Every transfer, NDC, possession and complaint is a request with an owner, a due date and a checklist. Dues and a valid NDC are checked automatically, fees are recorded once, and the letter is printed when the last box is ticked.",
    points: [
      "Transfer checklists: application, CNICs and papers, NDC, fee and biometric verification",
      "NDCs issued only when the buyer has no dues, with a validity date",
      "Possession with demarcation and the possession letter",
      "Transfer, NDC and possession fees posted to your books when they're paid",
    ],
    screen: "estate-request",
    url: "portal.propflowapp.com/estate-management/requests/sr-00065",
    lenses: [
      { callout: "blocker", label: "What's still needed before the transfer can be completed", at: { left: "-8%", top: "-12%" }, width: "40%" },
      { callout: "ndc", label: "A valid NDC on the file, checked automatically", at: { right: "-8%", top: "28%" }, width: "34%" },
      { callout: "checklist", label: "A checklist for every transfer", at: { left: "-8%", bottom: "-12%" }, width: "32%" },
    ],
  },
  {
    id: "finance",
    tab: "Finance",
    icon: "bank-line",
    eyebrow: "Finance & accounts",
    title: "Books that keep themselves in step",
    text: "Bookings, receipts, cleared and bounced cheques, cancellations, refunds, commissions and service fees post to your accounts as they happen, in double entry. Payments and refunds can wait for an approver, and the trial balance always balances.",
    points: [
      "Cash and bank balances, cheques in clearing and what buyers still owe",
      "Vouchers for payments, receipts, transfers and journals, with approvals",
      "Vendors and dealers with income tax withheld",
      "Trial balance, profit & loss, balance sheet, ledgers and receivables aging",
    ],
    screen: "finance-overview",
    url: "portal.propflowapp.com/finance",
    lenses: [
      { callout: "tiles", label: "Cash and bank, cheques in clearing and receivables, in Crore", at: { right: "-8%", top: "-12%" }, width: "44%" },
      { screen: "trial-balance", callout: "totals", label: "Debits and credits that always match", at: { left: "-8%", bottom: "-12%" }, width: "38%" },
      { screen: "approvals", callout: "cheque", label: "Cheques, refunds and payments signed off before they count", at: { right: "-8%", bottom: "-10%" }, width: "34%" },
    ],
  },
  {
    id: "reports",
    tab: "Reports",
    icon: "file-chart-line",
    eyebrow: "Reports",
    title: "Reports your MD will actually open",
    text: "Ready-made reports for inventory, dealers, sales, collections, campaigns and accounts: filtered by project or campaign and exported to Excel or PDF in one click.",
    points: [
      "Availability by block, stock by size and premium units",
      "Dealer quotas and holds about to lapse",
      "Cost per lead by channel and campaign, and how fast agents call new leads",
      "Excel, PDF and print, with your company name on every page",
    ],
    screen: "report",
    url: "portal.propflowapp.com/campaigns/reports/channels",
    lenses: [
      { callout: "cpl", label: "Cost per lead for every channel", at: { right: "-8%", bottom: "-10%" }, width: "22%" },
      { callout: "tiles", label: "Leads, spend and bookings for the period", at: { left: "-8%", top: "-10%" }, width: "40%" },
    ],
  },
]

const PAKISTAN = [
  { icon: "ruler-2-line", title: "Marla, Kanal & sq ft", text: "With your society's marla size, used for every rate and report." },
  { icon: "money-rupee-circle-line", title: "Lac & Crore", text: "Every price, budget and total in the format your buyers use." },
  { icon: "government-line", title: "LDA, CDA, RDA, DHA", text: "Approval status and NOC numbers on every project." },
  { icon: "file-list-3-line", title: "Files & balloting", text: "Open files and balloted plots in the same inventory." },
  { icon: "calendar-check-line", title: "Installment plans", text: "Schedules, overdue alerts, cheques in clearing and defaulters." },
  { icon: "shield-check-line", title: "NDC & transfers", text: "Dues checked, fees taken and letters printed in one flow." },
  { icon: "shake-hands-line", title: "Dealer quotas", text: "Dealers get their own login, limited to their allocated units." },
  { icon: "percent-line", title: "Tax withheld", text: "Income tax withheld on dealer commission and vendor payments." },
]

const FAQ = [
  {
    q: "Is PropFlow a real estate CRM or an ERP?",
    a: "Both. The CRM handles leads, follow-ups and site visits; the rest of PropFlow runs what happens around them: inventory and price lists, bookings and installment plans, transfers and NDCs, and the accounts. You can start with the CRM and add the other apps as you grow.",
  },
  {
    q: "Does it handle open files and plot balloting?",
    a: "Yes. Unballoted files and balloted plots sit in the same project inventory, in Marla and Kanal with your society's marla size, so a file can be sold, held and transferred like any plot.",
  },
  {
    q: "Can it manage installment plans and cheques?",
    a: "Yes. Each booking gets its payment plan (down payment, monthly or quarterly installments, balloon payments). Receipts are applied to the oldest installment first, cheques wait in clearing until they clear or bounce, and overdue buyers are flagged as defaulters.",
  },
  {
    q: "Does PropFlow track LDA, CDA and DHA approvals?",
    a: "Every project keeps its approving authority, approval status and NOC numbers, so your sales team can answer the first question every buyer asks.",
  },
  {
    q: "Does it work with WhatsApp and Facebook leads?",
    a: "Every lead, buyer and owner is one tap away on WhatsApp. Leads from Facebook and Instagram ads come in through your PropFlow lead forms and landing pages, tagged with the campaign and channel they came from.",
  },
  {
    q: "Is PropFlow only for developers?",
    a: "It's built for developers and housing societies first: projects, inventory, price lists, files and balloting. Real estate agencies and dealers can use the same CRM, campaigns and landing pages.",
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
    a: "Project Portfolio, Campaigns, CRM, Operations, Estate Management, Finance, Contacts and Users & Teams are live. HR & Payroll is coming next.",
  },
  {
    q: "Who owns our data?",
    a: "You do. Each company has its own database, and you can export your records to Excel at any time.",
  },
]

export const CONTENT = {
  title: "PropFlow · Real Estate CRM & ERP Software in Pakistan",
  description: "Real estate CRM and ERP for Pakistani developers and housing societies: Marla & Kanal inventory, files and balloting, installments, dealer quotas.",
  keywords: [
    "real estate CRM in Pakistan",
    "real estate ERP software Pakistan",
    "property management software Pakistan",
    "housing society management software",
    "best CRM for builders in Pakistan",
    "marla kanal CRM software Pakistan",
    "open file management software",
    "plot balloting software Pakistan",
    "lac crore real estate software",
    "installment plan management software Pakistan",
    "LDA CDA DHA NOC tracking software",
    "dealer quota management software",
    "WhatsApp CRM for real estate Pakistan",
    "sales pipeline management for real estate developers",
    "inventory hold management software",
    "campaign ROI tracking real estate Pakistan",
    "cost per booking real estate software",
    "landing page builder for real estate",
    "cost per lead real estate Pakistan",
  ],
  nav: NAV,
  hero: {
    eyebrow: "Real estate CRM & ERP for developers, builders and housing societies",
    title: "The real estate CRM and ERP,",
    highlight: "built for Pakistan",
    text: "PropFlow runs your projects from the first enquiry to possession: Marla and Kanal inventory with open files and balloting, a sales pipeline your agents use, installment plans and cheques, dealer quotas, and campaigns that show exactly what each booking cost. All in Lac and Crore.",
    note: "No card needed. For projects in Lahore, Karachi, Islamabad and beyond.",
    lenses: [
      { callout: "stock", label: "Available stock, valued in Crore", at: { right: "-8%", top: "-8%" }, width: "28%" },
      { callout: "approval", label: "LDA approval or NOC status on every project", at: { left: "-8%", bottom: "-12%" }, width: "22%" },
    ],
  },
  builtFor: BUILT_FOR,
  pains: {
    title: "Registers, Excel sheets and WhatsApp groups can only take you so far",
    items: PAINS,
  },
  builder: {
    eyebrow: "Landing page builder",
    title: "A landing page builder for real estate launches, ready in minutes",
    text: "Pick ready-made sections, write over them in place, drop in your photos and logo, and publish. Every page has a lead form, so enquiries land in your CRM tagged with the campaign that brought them.",
    points: [
      { icon: "layout-masonry-line", title: "A library of ready-made sections", text: "Hero, payment plans, amenities, location map, gallery, FAQs and more, each in several layouts." },
      { icon: "edit-box-line", title: "Edit right on the page", text: "Change text, colors and images where they are, and see it on a phone before you publish." },
      { icon: "file-list-3-line", title: "Lead forms built in, with captcha", text: "Every page captures enquiries straight into CRM; spam is kept out." },
      { icon: "line-chart-line", title: "Know what each page brings in", text: "Leads, site visits and bookings per page and campaign, so you can see your cost per booking." },
    ],
    screen: "page-editor",
    url: "portal.propflowapp.com/campaigns/pages/lp-0001",
    lenses: [{ callout: "phone", label: "Preview it exactly as buyers will see it on their phones", at: { right: "-8%", bottom: "-10%" }, width: "30%" }],
  },
  different: {
    eyebrow: "Only in PropFlow",
    title: "What general CRMs and spreadsheets can't do for a Pakistani developer",
    text: "Foreign CRMs track leads. PropFlow also runs the plots, files, installments, dealers and transfers that come after them, and keeps your books in step.",
    columns: ["PropFlow", "General CRMs", "Excel & WhatsApp"],
    rows: DIFFERENT,
  },
  features: FEATURES,
  local: {
    eyebrow: "Made for Pakistan",
    title: "Real estate software that speaks Pakistan's market",
    text: "Not a foreign CRM with a Rupee sign bolted on. PropFlow is built around how property is sold here.",
    items: PAKISTAN,
  },
  apps: APPS.map((a) => ({ ...a, text: a.text.replace("brokers", "dealers").replace("broker", "dealer") })),
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
