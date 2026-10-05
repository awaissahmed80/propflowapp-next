// SMS templates and automatic messages, shared by the server and the browser. A workspace edits
// the text (English or Urdu, one language per template) and switches each automatic message on in
// Settings › Integrations › SMS gateway; saved under SMS_AUTOMATION_KEY in its settings.

export const SMS_AUTOMATION_KEY = "sms_automation"

// Placeholders: {name} in a template, filled from the installment, receipt and workspace
export const PLACEHOLDERS = {
  buyer: "Buyer's name",
  amount: "Amount",
  installment: "Installment (e.g. Installment 3)",
  due_date: "Due date",
  unit: "Unit / plot",
  project: "Project",
  booking: "Booking code",
  receipt: "Receipt number",
  date: "Payment date",
  balance: "Balance left on the booking",
  company: "Your company name",
}

export const TEMPLATES = [
  {
    key: "installment-before",
    label: "Installment due soon",
    when: "Days before the due date",
    vars: ["buyer", "amount", "installment", "due_date", "unit", "project", "booking", "company"],
    en: "Dear {buyer}, your {installment} of {amount} for {unit}, {project} is due on {due_date}. Please pay on time. {company}",
    ur: "محترم {buyer}، {project} میں {unit} کی {installment} ({amount}) کی آخری تاریخ {due_date} ہے۔ براہ کرم بروقت ادائیگی کریں۔ {company}",
  },
  {
    key: "installment-due",
    label: "Installment due today",
    when: "On the due date",
    vars: ["buyer", "amount", "installment", "due_date", "unit", "project", "booking", "company"],
    en: "Dear {buyer}, your {installment} of {amount} for {unit}, {project} is due today. Please pay today. {company}",
    ur: "محترم {buyer}، {project} میں {unit} کی {installment} ({amount}) آج واجب الادا ہے۔ براہ کرم آج ادائیگی کریں۔ {company}",
  },
  {
    key: "installment-overdue",
    label: "Installment overdue",
    when: "Days after the due date, if still unpaid",
    vars: ["buyer", "amount", "installment", "due_date", "unit", "project", "booking", "company"],
    en: "Dear {buyer}, your {installment} of {amount} for {unit}, {project} was due on {due_date} and is still unpaid. Please pay at the earliest. {company}",
    ur: "محترم {buyer}، {project} میں {unit} کی {installment} ({amount}) کی تاریخ {due_date} گزر چکی ہے اور ادائیگی باقی ہے۔ براہ کرم جلد ادائیگی کریں۔ {company}",
  },
  {
    key: "receipt",
    label: "Payment received",
    when: "When a payment clears",
    vars: ["buyer", "amount", "receipt", "date", "unit", "project", "booking", "balance", "company"],
    en: "Dear {buyer}, we have received {amount} for {unit}, {project} on {date} (receipt {receipt}). Balance: {balance}. Thank you. {company}",
    ur: "محترم {buyer}، {project} میں {unit} کے لیے {amount} کی ادائیگی {date} کو موصول ہو گئی (رسید {receipt})۔ بقایا: {balance}۔ شکریہ۔ {company}",
  },
]
export const templateByKey = (key) => TEMPLATES.find((t) => t.key === key) ?? null

// What's switched on, and the saved text of each template
export const DEFAULT_AUTOMATION = {
  before: { on: false, days: 3 },
  due: { on: false },
  overdue: { on: false, days: 3 },
  receipt: { on: false },
  // { key: { lang: "en" | "ur", body } }; a missing one uses the default English text
  templates: {},
  lastReminderDay: null, // the day (PKT) reminders last ran, so they run once a day
}

export function mergeAutomation(saved) {
  const v = saved && typeof saved === "object" ? saved : {}
  const days = (n, d) => Math.min(30, Math.max(1, Math.round(Number(n) || d)))
  return {
    before: { on: Boolean(v.before?.on), days: days(v.before?.days, 3) },
    due: { on: Boolean(v.due?.on) },
    overdue: { on: Boolean(v.overdue?.on), days: days(v.overdue?.days, 3) },
    // since: when it was switched on, so older receipts aren't messaged
    receipt: { on: Boolean(v.receipt?.on), since: v.receipt?.on ? (v.receipt?.since ?? null) : null },
    templates: v.templates && typeof v.templates === "object" ? v.templates : {},
    lastReminderDay: v.lastReminderDay ?? null,
  }
}

// A template's text as the workspace has it → { lang, body }
export function templateText(automation, key) {
  const t = templateByKey(key)
  const saved = automation.templates?.[key]
  const lang = saved?.lang === "ur" ? "ur" : "en"
  return { lang, body: saved?.body?.trim() ? saved.body : t[lang] }
}

// Fill {placeholders}; unknown ones are left as they are so a typo shows in the preview
export const render = (body, vars) => String(body).replace(/\{([a-z_]+)\}/g, (m, k) => (vars[k] != null && vars[k] !== "" ? String(vars[k]) : m))

// Example values for previews
export const SAMPLE = {
  buyer: "Ahmed Raza",
  amount: "Rs 125,000",
  installment: "Installment 3",
  due_date: "15 Oct 2026",
  unit: "Plot 245",
  project: "Skyline Enclave",
  booking: "BK-2026-000245",
  receipt: "RCT-2627-00412",
  date: "5 Oct 2026",
  balance: "Rs 2,375,000",
  company: "Skyline Developers",
}
