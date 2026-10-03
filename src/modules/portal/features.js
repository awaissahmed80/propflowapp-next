// Features inside each app, so a plan or a single workspace can have an app without some of its
// parts (e.g. Project Portfolio without Resale & rentals). Each app has one core feature that
// can't be switched off. Plans and workspaces store only what's switched OFF (offFeatures), so
// every feature is on unless someone took it away, and new features reach existing workspaces.
// Feature ids are "app.key", e.g. "portfolio.resale". Used by the server, the browser and seeds, so
// no path aliases here.

export const APP_FEATURES = {
  portfolio: [
    { key: "projects", label: "Projects & inventory", core: true },
    { key: "price-lists", label: "Price lists & payment plans" },
    { key: "resale", label: "Resale & rentals" },
    { key: "reports", label: "Reports" },
  ],
  crm: [
    { key: "leads", label: "Leads & follow-ups", core: true },
    { key: "whatsapp", label: "WhatsApp enquiries" },
    { key: "site-visits", label: "Site visits" },
    { key: "assignment", label: "Assignment rules" },
    { key: "reports", label: "Reports" },
  ],
  campaigns: [
    { key: "campaigns", label: "Campaigns & cost per lead", core: true },
    { key: "lead-ads", label: "Facebook & Instagram lead ads" },
    { key: "lead-forms", label: "Lead forms (website, Google Forms)" },
    { key: "landing-pages", label: "Landing pages" },
  ],
  operations: [
    { key: "bookings", label: "Bookings", core: true },
    { key: "installments", label: "Installment plans & schedules" },
    { key: "allotments", label: "Allotment letters" },
    { key: "dealers", label: "Dealer quotas & commissions" },
  ],
  estate: [
    { key: "requests", label: "Service requests", core: true },
    { key: "transfers", label: "Ownership transfers" },
    { key: "ndc-possession", label: "NDC & possession" },
    { key: "complaints", label: "Maintenance & complaints" },
  ],
  finance: [
    { key: "ledger", label: "Ledger & vouchers", core: true },
    { key: "collections", label: "Installment collections & receipts" },
    { key: "banking", label: "Cheques & banking" },
    { key: "vendors", label: "Vendor payments" },
  ],
  hr: [
    { key: "employees", label: "Staff records", core: true },
    { key: "attendance", label: "Attendance & duty rosters" },
    { key: "leave", label: "Leave" },
    { key: "payroll", label: "Payroll & loans" },
  ],
  users: [
    { key: "people", label: "Users, teams & roles", core: true },
    { key: "dealers", label: "Dealer accounts" },
  ],
}

export const featuresOf = (app) => APP_FEATURES[app] ?? []
export const optionalFeatures = (app) => featuresOf(app).filter((f) => !f.core)
export const featureLabel = (id) => {
  const [app, key] = String(id).split(".")
  return featuresOf(app).find((f) => f.key === key)?.label ?? id
}

// offFeatures as stored ([keys] for one app) → only optional keys that exist
export const cleanOff = (app, off) => [...new Set((Array.isArray(off) ? off : []).filter((k) => optionalFeatures(app).some((f) => f.key === k)))]

// "Project Portfolio without Resale & rentals"
export const withoutText = (app, off) => {
  const names = cleanOff(app, off).map((k) => featuresOf(app).find((f) => f.key === k)?.label)
  return names.length ? `without ${names.join(", ")}` : ""
}
