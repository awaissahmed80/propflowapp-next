import { APP_FEATURES } from "../portal/features.js"

// The get-started wizard on the website (when prices are hidden) and how the console shows its
// leads. Visitors answer what they need PropFlow to do (NEEDS); each answer maps to the modules
// behind it, so the console can suggest a plan. Business types preselect their usual needs.
export const BUSINESS_TYPES = [
  { value: "developer", label: "Developer", hint: "Housing societies, plots and files", icon: "community-line", modules: ["estate", "crm", "sales", "services", "finance", "campaigns"] },
  { value: "builder", label: "Builder", hint: "Construction, towers and houses", icon: "building-2-line", modules: ["estate", "sales", "finance", "hr"] },
  { value: "agency", label: "Real estate agency", hint: "Buying, selling and renting for clients", icon: "store-3-line", modules: ["crm", "estate", "contacts", "campaigns"] },
  { value: "marketing", label: "Marketing agency", hint: "Campaigns and leads for developers", icon: "megaphone-line", modules: ["campaigns", "crm", "dashboards"] },
  { value: "investor", label: "Investor or landlord", hint: "Your own properties and rentals", icon: "safe-2-line", modules: ["estate", "finance", "documents"] },
  { value: "other", label: "Something else", hint: "Tell us in your own words", icon: "question-line", modules: ["crm", "estate"] },
]
export const businessType = (v) => BUSINESS_TYPES.find((b) => b.value === v) ?? null

export const PROJECT_COUNTS = ["1", "2–3", "4–10", "More than 10"]
export const TEAM_SIZES = ["1–5", "6–15", "16–40", "More than 40"]
export const CALL_TIMES = ["Morning", "Afternoon", "Evening", "Any time"]

// What PropFlow can do for them, in their words, grouped. features: the app features each one
// needs (see portal/features.js); an app's core feature comes with any of its features.
export const NEED_GROUPS = [
  {
    title: "Getting leads",
    question: "Where do your leads come from?",
    hint: "Pick every way you get enquiries.",
    needs: [
      { value: "facebook-leads", label: "Get leads from Facebook and Instagram ads", icon: "facebook-circle-line", features: ["campaigns.lead-ads", "crm.leads"] },
      { value: "whatsapp", label: "Handle enquiries on WhatsApp", icon: "whatsapp-line", features: ["crm.whatsapp"] },
      { value: "web-forms", label: "Collect leads from Google Forms or your website", icon: "file-list-3-line", features: ["campaigns.lead-forms", "crm.leads"] },
      { value: "landing-pages", label: "Make landing pages for projects and offers", icon: "pages-line", features: ["campaigns.landing-pages"] },
      { value: "site-visits", label: "Plan and track site visits", icon: "map-pin-user-line", features: ["crm.site-visits"] },
    ],
  },
  {
    title: "Selling",
    question: "What do you need for selling, and after the sale?",
    hint: "Inventory, bookings, installments, transfers and more.",
    needs: [
      { value: "inventory", label: "Keep plots, files, houses or shops with live availability", icon: "layout-grid-line", features: ["estate.projects"] },
      { value: "price-lists", label: "Price lists and payment plans", icon: "price-tag-3-line", features: ["estate.price-lists"] },
      { value: "bookings", label: "Book units and issue allotment letters", icon: "file-paper-2-line", features: ["sales.bookings", "sales.allotments"] },
      { value: "installment-plans", label: "Installment plans and schedules for buyers", icon: "calendar-check-line", features: ["sales.installments"] },
      { value: "dealers", label: "Work with dealers: quotas, logins and commissions", icon: "shake-hands-line", features: ["sales.dealers", "users.dealers"] },
      { value: "rentals", label: "Resale listings and rentals", icon: "key-2-line", features: ["estate.resale"] },
      { value: "transfers", label: "Ownership transfers, NDC and possession", icon: "arrow-left-right-line", features: ["services.transfers", "services.ndc-possession"] },
      { value: "complaints", label: "Maintenance requests and complaints", icon: "customer-service-2-line", features: ["services.complaints"] },
    ],
  },
  {
    title: "Accounts & staff",
    question: "Do you want to use Ledgers and Vouchers, and HR & Payroll, for your workspace?",
    hint: "Accounts, collections and your team.",
    needs: [
      { value: "ledgers", label: "Ledgers and vouchers for your accounts", icon: "book-2-line", features: ["finance.ledger"] },
      { value: "collections", label: "Collect installments with receipts and reminders", icon: "money-dollar-circle-line", features: ["finance.collections", "sales.installments"] },
      { value: "vendors", label: "Pay contractors and vendors", icon: "bill-line", features: ["finance.vendors"] },
      { value: "staff", label: "Staff records, attendance and leave", icon: "contacts-line", features: ["hr.employees", "hr.attendance", "hr.leave"] },
      { value: "payroll", label: "Payroll, loans and advances", icon: "wallet-3-line", features: ["hr.payroll"] },
    ],
  },
]
export const NEEDS = NEED_GROUPS.flatMap((g) => g.needs)
export const need = (v) => NEEDS.find((n) => n.value === v) ?? null
const ASKED = new Set(NEEDS.flatMap((n) => n.features))

// Features behind a set of answers → apps (codes) and, per app, its optional features they
// didn't ask for: { apps, off } (a package for console Workspaces / invites)
export function packageFor(needs) {
  const wanted = [...new Set(needs.flatMap((v) => need(v)?.features ?? []))]
  const apps = [...new Set(wanted.map((f) => f.split(".")[0]))]
  const off = {}
  for (const app of apps) {
    // Only leave out what a question could have asked for (e.g. Reports stay in)
    const keys = (APP_FEATURES[app] ?? []).filter((f) => !f.core && ASKED.has(`${app}.${f.key}`) && !wanted.includes(`${app}.${f.key}`)).map((f) => f.key)
    if (keys.length) off[app] = keys
  }
  return { apps, off }
}
// The features a set of answers needs ("estate.price-lists"…)
export const featuresFor = (needs) => [...new Set(needs.flatMap((v) => need(v)?.features ?? []))]
// Apps behind a set of answers
export const modulesFor = (needs) => packageFor(needs).apps

// What each kind of business usually needs (preselected)
export const NEEDS_FOR = {
  developer: ["facebook-leads", "whatsapp", "site-visits", "inventory", "price-lists", "bookings", "installment-plans", "dealers", "transfers", "collections"],
  builder: ["inventory", "price-lists", "bookings", "installment-plans", "collections", "ledgers", "vendors"],
  agency: ["facebook-leads", "whatsapp", "site-visits", "rentals"],
  marketing: ["facebook-leads", "web-forms", "landing-pages"],
  investor: ["inventory", "rentals", "ledgers"],
  other: ["whatsapp"],
}
