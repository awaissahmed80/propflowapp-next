// Import & export: what can be imported and exported, and the fields of each, shared by the server
// and the browser. aliases: column headings in people's own files that mean this field (matched
// without case, spaces or punctuation), so most files map themselves. example: a template row.

export const MAX_IMPORT_ROWS = 5000

export const ENTITIES = {
  leads: {
    key: "leads",
    app: "crm",
    label: "Leads",
    one: "lead",
    icon: "user-star-line",
    href: "/crm/leads",
    matchBy: "An open lead on the same mobile number",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["full name", "customer", "client", "lead name", "customer name", "client name"], example: "Ahmed Raza" },
      { key: "phone", label: "Mobile", required: true, aliases: ["phone", "mobile no", "mobile number", "cell", "contact", "contact no", "contact number", "whatsapp", "phone number", "number"], example: "0300 1234567" },
      { key: "email", label: "Email", aliases: ["email address", "e-mail"], example: "ahmed@example.com" },
      { key: "city", label: "City", aliases: ["location", "area"], example: "Lahore" },
      { key: "source", label: "Source", aliases: ["lead source", "channel", "platform", "medium"], example: "Facebook ads", lookup: "lead-source" },
      { key: "status", label: "Status", aliases: ["stage", "lead status"], example: "New", lookup: "lead-status" },
      { key: "priority", label: "Temperature", aliases: ["priority", "hot warm cold", "rating"], example: "Warm", lookup: "lead-priority" },
      { key: "project", label: "Project", aliases: ["society", "scheme", "project name", "interested in"], example: "Skyline Enclave" },
      { key: "unitType", label: "Property type", aliases: ["unit type", "type", "plot type", "property"], example: "Plot", lookup: "unit-type" },
      { key: "size", label: "Size", aliases: ["plot size", "unit size", "marla", "area size"], example: "10 Marla" },
      { key: "budget", label: "Budget", aliases: ["price range", "budget range", "amount", "price"], example: "50 lakh - 1 crore" },
      { key: "paymentPlan", label: "Payment plan", aliases: ["payment", "plan", "installments", "cash or installments"], example: "Installments" },
      { key: "assignedTo", label: "Agent", aliases: ["assigned to", "assignee", "owner", "sales person", "salesperson", "sales agent", "agent email"], example: "Sana Javed" },
      { key: "notes", label: "Notes", aliases: ["remarks", "comments", "message", "requirement", "details", "note"], example: "Wants a corner plot" },
      { key: "createdAt", label: "Lead date", aliases: ["date", "created", "created at", "enquiry date", "lead date", "received"], example: "2026-09-15", type: "date" },
      { key: "oldId", label: "Old ID", aliases: ["id", "lead id", "old id", "ref", "reference", "external id", "crm id"], example: "1042" },
      {
        key: "nextFollowUp",
        label: "Next follow-up",
        aliases: ["follow up", "follow-up", "next follow up", "follow up date", "next due", "due date", "reminder", "callback date"],
        example: "2026-10-08 11:00",
        type: "datetime",
      },
      { key: "followUpType", label: "Follow-up type", aliases: ["follow up type", "next action", "action"], example: "Call", lookup: "activity-type" },
      { key: "followUpNote", label: "Follow-up note", aliases: ["follow up note", "follow up notes", "next step", "reminder note"], example: "Share the payment plan" },
    ],
  },
  activities: {
    key: "activities",
    app: "crm",
    label: "Lead activities",
    one: "activity",
    icon: "history-line",
    href: "/crm/follow-ups",
    matchBy: "The same lead, type, time and notes (already imported)",
    note: "History and follow-ups for leads already in PropFlow: import the leads first. Each row finds its lead by Old ID, mobile or lead code.",
    fields: [
      { key: "lead", label: "Lead", required: true, aliases: ["lead id", "old id", "id", "lead code", "mobile", "phone", "lead mobile", "lead phone", "ref"], example: "1042" },
      { key: "type", label: "Type", required: true, aliases: ["activity", "activity type", "action"], example: "Call", lookup: "activity-type" },
      { key: "at", label: "Date & time", required: true, aliases: ["date", "time", "datetime", "when", "activity date", "due", "due date", "created at"], example: "2026-09-20 15:30", type: "datetime" },
      { key: "status", label: "Done or planned", aliases: ["status", "state", "done"], example: "Done" },
      { key: "outcome", label: "Outcome", aliases: ["result", "response", "disposition"], example: "Interested", lookup: "activity-outcome" },
      { key: "notes", label: "Notes", aliases: ["remarks", "comments", "description", "details", "note", "summary"], example: "Discussed 10 marla options" },
      { key: "by", label: "By", aliases: ["agent", "user", "done by", "assigned to", "owner", "sales person"], example: "Imran Nawaz" },
    ],
  },
  contacts: {
    key: "contacts",
    app: "contacts",
    label: "Contacts",
    one: "contact",
    icon: "contacts-book-2-line",
    href: "/contacts/all",
    matchBy: "The same CNIC, or the same mobile number",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["full name", "contact name", "customer name"], example: "Ayesha Malik" },
      { key: "phone", label: "Mobile", aliases: ["phone", "mobile no", "cell", "contact no", "whatsapp", "phone number", "number"], example: "0321 7654321" },
      { key: "cnic", label: "CNIC", aliases: ["cnic no", "cnic number", "nic", "id card", "national id"], example: "35202-1234567-1" },
      { key: "email", label: "Email", aliases: ["email address", "e-mail"], example: "ayesha@example.com" },
      { key: "type", label: "Contact type", aliases: ["type", "role", "category", "contact type"], example: "Customer", lookup: "contact-type" },
      { key: "kind", label: "Person or company", aliases: ["kind", "individual or company"], example: "Person" },
      { key: "company", label: "Company", aliases: ["organization", "organisation", "firm", "business"], example: "" },
      { key: "designation", label: "Designation", aliases: ["title", "job title", "position"], example: "" },
      { key: "guardianRelation", label: "Relation (S/O, D/O, W/O)", aliases: ["relation", "s/o d/o w/o", "son of daughter of wife of"], example: "D/O" },
      { key: "guardianName", label: "Father / husband name", aliases: ["father name", "fathers name", "husband name", "guardian", "guardian name"], example: "Tariq Malik" },
      { key: "city", label: "City", aliases: ["location"], example: "Lahore" },
      { key: "address", label: "Address", aliases: ["postal address", "home address", "residential address"], example: "House 12, Street 4, DHA Phase 5" },
      { key: "notes", label: "Notes", aliases: ["remarks", "comments"], example: "" },
    ],
  },
  units: {
    key: "units",
    app: "portfolio",
    label: "Units",
    one: "unit",
    icon: "layout-grid-line",
    href: "/project-portfolio/inventory",
    matchBy: "The same unit number in the same block",
    fields: [
      { key: "project", label: "Project", required: true, aliases: ["project name", "project code", "society", "scheme"], example: "SKE" },
      { key: "phase", label: "Phase", aliases: ["phase name"], example: "Phase 1" },
      { key: "block", label: "Block", required: true, aliases: ["block name", "sector", "tower", "building"], example: "Block A" },
      { key: "number", label: "Unit number", required: true, aliases: ["plot no", "plot number", "unit no", "number", "file no", "shop no", "flat no", "house no"], example: "101" },
      { key: "type", label: "Type", required: true, aliases: ["unit type", "property type", "plot type"], example: "Plot", lookup: "unit-type" },
      { key: "size", label: "Size", required: true, aliases: ["plot size", "unit size", "area"], example: "10 Marla" },
      { key: "rate", label: "Base rate", required: true, aliases: ["rate", "rate per marla", "rate per sq ft", "per marla", "per sqft"], example: "750000" },
      { key: "features", label: "Features", aliases: ["premiums", "corner park facing", "feature"], example: "Corner, Park facing" },
      { key: "street", label: "Street", aliases: ["street no", "road"], example: "Street 4" },
      { key: "floor", label: "Floor", aliases: ["floor no", "level"], example: "", type: "int" },
      { key: "bedrooms", label: "Bedrooms", aliases: ["beds", "bed rooms", "rooms"], example: "", type: "int" },
      { key: "status", label: "Status", aliases: ["availability"], example: "Available" },
    ],
  },
  employees: {
    key: "employees",
    app: "hr",
    label: "Employees",
    one: "employee",
    icon: "team-line",
    href: "/hrm/employees",
    matchBy: "The same CNIC (or the same mobile number) among current employees",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["full name", "employee name", "staff name"], example: "Bilal Ahmed" },
      { key: "joinedOn", label: "Joining date", required: true, aliases: ["joined", "joining", "date of joining", "doj", "start date", "joined on"], example: "2025-03-01", type: "date" },
      { key: "cnic", label: "CNIC", aliases: ["cnic no", "nic", "id card"], example: "35202-7654321-3" },
      { key: "phone", label: "Mobile", aliases: ["phone", "mobile no", "cell", "contact no", "phone number"], example: "0333 1112233" },
      { key: "email", label: "Email", aliases: ["email address", "e-mail"], example: "bilal@example.com" },
      { key: "designation", label: "Designation", aliases: ["title", "job title", "position", "post"], example: "Sales Manager", lookup: "designation" },
      { key: "department", label: "Department", aliases: ["dept", "team"], example: "Sales", lookup: "department" },
      { key: "employmentType", label: "Employment type", aliases: ["type", "employment", "job type"], example: "Permanent", lookup: "employment-type" },
      { key: "gender", label: "Gender", aliases: ["sex"], example: "Male" },
      { key: "guardianRelation", label: "Relation (S/O, D/O, W/O)", aliases: ["relation"], example: "S/O" },
      { key: "guardianName", label: "Father / husband name", aliases: ["father name", "fathers name", "husband name", "guardian name"], example: "Ahmed Khan" },
      { key: "dateOfBirth", label: "Date of birth", aliases: ["dob", "birth date", "birthday"], example: "1992-06-15", type: "date" },
      { key: "payMethod", label: "Pay by", aliases: ["payment method", "pay method", "salary by"], example: "Bank" },
      { key: "bankName", label: "Bank", aliases: ["bank name"], example: "Meezan Bank" },
      { key: "accountTitle", label: "Account title", aliases: ["account name", "title of account"], example: "Bilal Ahmed" },
      { key: "iban", label: "IBAN", aliases: ["account number", "account no", "iban no"], example: "PK36MEZN0001234567890123" },
      { key: "basic", label: "Basic salary", aliases: ["basic", "basic pay"], example: "60000", type: "money", salary: true },
      { key: "house", label: "House rent", aliases: ["house rent allowance", "hra"], example: "27000", type: "money", salary: true },
      { key: "utilities", label: "Utilities", aliases: ["utility allowance"], example: "6000", type: "money", salary: true },
      { key: "medical", label: "Medical", aliases: ["medical allowance"], example: "6000", type: "money", salary: true },
      { key: "fuel", label: "Fuel / conveyance", aliases: ["fuel", "conveyance", "transport", "petrol"], example: "5000", type: "money", salary: true },
      { key: "other", label: "Other allowance", aliases: ["other", "allowance", "other allowances"], example: "", type: "money", salary: true },
      { key: "eobiNo", label: "EOBI no.", aliases: ["eobi", "eobi number"], example: "" },
      { key: "ntn", label: "NTN", aliases: ["ntn no", "tax number"], example: "" },
      { key: "address", label: "Address", aliases: ["home address"], example: "" },
      { key: "notes", label: "Notes", aliases: ["remarks", "comments"], example: "" },
    ],
  },
}

export const entityByKey = (key) => ENTITIES[key] ?? null

// "Mobile No." → "mobileno"
const squash = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

// File headings → { fieldKey: columnIndex }, by label, key or alias; each column used once
export function autoMap(entity, headers) {
  const used = new Set()
  const map = {}
  for (const f of entity.fields) {
    const names = [f.label, f.key, ...(f.aliases ?? [])].map(squash)
    const i = headers.findIndex((h, idx) => !used.has(idx) && names.includes(squash(h)))
    if (i >= 0) {
      map[f.key] = i
      used.add(i)
    }
  }
  return map
}

// The template: headings and one example row
export const templateRows = (entity, { salary = true } = {}) => {
  const fields = entity.fields.filter((f) => salary || !f.salary)
  return [fields.map((f) => f.label), fields.map((f) => f.example ?? "")]
}
