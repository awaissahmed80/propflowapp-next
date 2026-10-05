// Rich parts of the User Guide, shown before each app's tasks (content.js has the tasks):
//   { type: "screen", id, caption, callouts: { calloutId: "what it is" } }   a screenshot from
//        src/modules/web/screens.json (captured by `yarn screens`), with numbered markers
//   { type: "flow", title, steps: [{ label, text?, icon?, tone? }], branches?: [{ from, label, text?, tone? }] }
//   { type: "table", title, columns: [..], rows: [[..]] }   a cell may be { badge, color }
//   { type: "callout", tone: "tip" | "note" | "warning", title?, text }
// Keep labels in step with the apps (and Lists & Labels defaults) when they change.

const b = (badge, color = "gray") => ({ badge, color })

// Shown on the guide's front page, under The basics
export const BASICS_BLOCKS = [
  {
    type: "flow",
    title: "How an approval works",
    steps: [
      { label: "You ask", text: "A discount, refund, voucher or transfer your role can't do alone", icon: "send-plane-line" },
      { label: "Waiting", text: "It shows in the approver's My Desk › Approvals", icon: "time-line", tone: "amber" },
      { label: "Approved", text: "It goes through, and you're notified", icon: "checkbox-circle-line", tone: "green" },
    ],
    branches: [{ from: 1, label: "Rejected", text: "Nothing changes; you see the reason", tone: "red" }],
  },
  {
    type: "flow",
    title: "What happens when you delete",
    steps: [
      { label: "Delete", text: "From the record's ⋮ menu or the bulk bar", icon: "delete-bin-line" },
      { label: "Recycle Bin", text: "Hidden everywhere, with everything that belongs to it", icon: "inbox-archive-line", tone: "amber" },
      { label: "Restore", text: "An administrator brings it back as it was", icon: "arrow-go-back-line", tone: "green" },
    ],
    branches: [{ from: 1, label: "Delete permanently", text: "Removed for good with its history and files", tone: "red" }],
  },
  {
    type: "table",
    title: "Keyboard shortcuts",
    columns: ["Keys", "What it does"],
    rows: [
      ["⌘K / Ctrl K", "Search everything"],
      ["⌘ Shift L / Ctrl Shift L", "Lock the screen"],
      ["Esc", "Close a dialog, panel or menu"],
      ["← / →", "Previous / next photo in a gallery"],
    ],
  },
  {
    type: "table",
    title: "What a role can do in an app",
    columns: ["Permission", "Means"],
    rows: [
      [b("View"), "Open the app and see its records"],
      [b("Create"), "Add new records"],
      [b("Edit"), "Change existing records"],
      [b("Delete", "red"), "Move records to the recycle bin"],
      [b("Approve", "amber"), "Act straight away on what others need approved"],
      [b("Export"), "Export to Excel and print reports"],
    ],
  },
  {
    type: "table",
    title: "Which records a role sees",
    columns: ["Data access", "Sees"],
    rows: [
      ["Own records", "Only what's assigned to them"],
      ["Their team's", "Their own and their team's (or the team they lead)"],
      ["Everything", "Every record in the workspace"],
      ["Linked to their work", "Contacts behind the leads and bookings they can see"],
    ],
  },
]

export const APP_BLOCKS = {
  desk: [
    {
      type: "screen",
      id: "guide-desk",
      caption: "My Desk, the page you land on",
      callouts: {
        shortcuts: "Your own pages: approvals, leave, pay, roster, profile and this guide",
        now: "Needs you now: the most urgent things waiting for you",
        todo: "To-do: tasks the apps raise for you, with a link to each",
        signoff: "Waiting for your sign-off: approvals in order",
      },
    },
    { type: "callout", tone: "tip", text: "Start every day on My Desk. Anything overdue is at the top, so nothing slips." },
  ],

  portfolio: [
    {
      type: "screen",
      id: "project",
      caption: "A project page",
      callouts: { approval: "Name, code and approval status", availability: "What's available, held and sold", authority: "Authority details and approval numbers", phases: "Phases and blocks" },
    },
    { type: "screen", id: "inventory", caption: "Inventory", callouts: { premium: "Premiums such as corner or park facing", stock: "Stock by status", status: "Filter by status" } },
    {
      type: "flow",
      title: "From project to sale",
      steps: [
        { label: "Project", text: "Phases and blocks", icon: "building-line" },
        { label: "Inventory", text: "Units added a series at a time", icon: "layout-grid-line" },
        { label: "Price list", text: "Rates, premiums, plans", icon: "price-tag-3-line", tone: "amber" },
        { label: "On sale", text: "Held, booked or allotted to a dealer", icon: "store-2-line", tone: "green" },
      ],
    },
    { type: "callout", tone: "note", text: "Only one price list per project is active at a time. A new version needs approval unless your role can approve." },
  ],

  campaigns: [
    {
      type: "screen",
      id: "guide-forms",
      caption: "A lead form",
      callouts: { stats: "Views, entries and conversion", tabs: "Build, settings, share and entries", preview: "Live preview, exactly as visitors see it", status: "Pause the form or save changes" },
    },
    { type: "screen", id: "campaign", caption: "A campaign", callouts: { cpl: "Cost per lead", goals: "Progress against goals", funnel: "From leads to bookings" } },
    {
      type: "flow",
      title: "How a lead gets from an ad to sales",
      steps: [
        { label: "Ad or link", text: "Facebook, Google or your website", icon: "megaphone-line" },
        { label: "Lead form", text: "Name, mobile and interest", icon: "survey-line" },
        { label: "CRM", text: "A lead, with its source and campaign", icon: "user-star-line", tone: "amber" },
        { label: "Assigned", text: "By your rules, in turn", icon: "user-shared-line", tone: "green" },
      ],
    },
  ],

  crm: [
    {
      type: "screen",
      id: "guide-leads",
      caption: "Leads",
      callouts: {
        tabs: "Open, due today, booked and lost at a glance",
        find: "Search and filter",
        select: "Tick leads to assign, move or delete several at once",
        row: "Click a lead to open it",
        add: "Import / Export and New lead",
      },
    },
    { type: "screen", id: "lead", caption: "A lead", callouts: { score: "Score: how likely it is to buy", header: "Who, and how to reach them", followups: "Activity and the next follow-up" } },
    {
      type: "flow",
      title: "The lead pipeline",
      steps: [
        { label: "New" },
        { label: "Contacted" },
        { label: "Interested" },
        { label: "Site visit scheduled" },
        { label: "Negotiation", tone: "amber" },
        { label: "Booked", tone: "green", icon: "checkbox-circle-line" },
      ],
      branches: [{ from: 4, label: "Lost", text: "With the reason", tone: "red" }],
    },
    { type: "screen", id: "guide-follow-ups", caption: "Follow-ups", callouts: { who: "Yours, or everyone's", row: "What to do and for which lead", done: "Mark it done when it's handled" } },
    { type: "callout", tone: "tip", title: "Never leave a lead without a next step", text: "Every time you log a call, plan the next follow-up. Leads with nothing planned go stale and show up in reports." },
    { type: "callout", tone: "note", text: "The status names and colors can be changed in Settings › Lists & Labels; this guide shows the defaults." },
  ],

  operations: [
    { type: "screen", id: "guide-bookings", caption: "Bookings", callouts: { search: "Find by buyer, booking, unit, CNIC or mobile", stage: "Where each booking is", new: "New booking" } },
    { type: "screen", id: "booking", caption: "A booking", callouts: { progress: "Paid so far against the plan", receipts: "Payments received", cleared: "Cheques and their clearing" } },
    {
      type: "flow",
      title: "Booking stages",
      steps: [
        { label: "Token", icon: "hand-coin-line" },
        { label: "Booking & KYC", text: "Down payment, CNIC, photos" },
        { label: "Active", text: "Installments running", tone: "amber" },
        { label: "Handover", text: "Paid in full, possession" },
        { label: "Completed", tone: "green", icon: "checkbox-circle-line" },
      ],
    },
    {
      type: "table",
      title: "Booking status (separate from the stage)",
      columns: ["Status", "Means"],
      rows: [
        [b("Current", "green"), "Paying on time"],
        [b("Overdue", "amber"), "An installment is late"],
        [b("Defaulter", "red"), "Late beyond your workspace's limit"],
        [b("On hold"), "Paused, e.g. a dispute or a pending transfer"],
        [b("Transferred"), "Moved to a new owner"],
        [b("Canceled"), "Canceled; the unit is back on sale"],
      ],
    },
    { type: "screen", id: "installments", caption: "Installments", callouts: { tiles: "What's due and collected", remind: "Send reminders", overdue: "Who's overdue" } },
  ],

  estate: [
    { type: "screen", id: "guide-transfers", caption: "Transfers", callouts: { tabs: "Open, overdue, yours and closed", checklist: "How far each transfer's checklist is", new: "New transfer" } },
    {
      type: "flow",
      title: "A transfer, step by step",
      steps: [
        { label: "Application", text: "Signed by both parties" },
        { label: "Papers", text: "CNICs, photos, original allotment letter" },
        { label: "NDC", text: "Checked automatically", tone: "amber" },
        { label: "Fee", text: "Checked automatically", tone: "amber" },
        { label: "Biometric", text: "Both parties verified" },
        { label: "New owner", tone: "green", icon: "checkbox-circle-line" },
      ],
    },
    {
      type: "table",
      title: "Request types and their checklists",
      columns: ["Request", "Checklist"],
      rows: [
        ["Transfer", "Application · CNICs, photos, allotment letter · NDC · fee · biometric"],
        ["NDC", "Application · no overdue dues · NDC fee"],
        ["Possession", "Paid in full · phase open · possession charges · plot demarcated"],
        ["Document", "Application · supporting papers · document fee"],
        ["Record update", "Application · supporting papers · verified by the office"],
        ["Complaint", "Logged, assigned and closed with what was done"],
      ],
    },
    { type: "screen", id: "estate-request", caption: "A request", callouts: { checklist: "Its checklist", ndc: "NDC status", blocker: "What's holding it up" } },
    { type: "callout", tone: "warning", text: "Items marked automatic (NDC, fees, paid in full) tick themselves from live data and can't be ticked by hand." },
  ],

  finance: [
    {
      type: "screen",
      id: "finance-overview",
      caption: "Finance overview",
      callouts: { tiles: "Money in, out and in hand", chart: "Cash flow by month", approval: "Waiting for approval", banks: "Bank and cash balances" },
    },
    { type: "screen", id: "guide-vouchers", caption: "Vouchers", callouts: { waiting: "Waiting for approval: not in the books yet", new: "New voucher", types: "Voucher type and number" } },
    {
      type: "table",
      title: "Voucher types",
      columns: ["Type", "Used for"],
      rows: [
        [b("CRV", "green"), "Cash receipt"],
        [b("BRV", "green"), "Bank receipt"],
        [b("CPV", "amber"), "Cash payment"],
        [b("BPV", "amber"), "Bank payment"],
        [b("JV", "violet"), "Journal voucher: transfers and adjustments"],
      ],
    },
    {
      type: "flow",
      title: "A payment, from entry to the books",
      steps: [
        { label: "Entered", text: "New voucher", icon: "edit-line" },
        { label: "Waiting", text: "If your role can't approve", tone: "amber" },
        { label: "Posted", text: "In the ledgers and reports", tone: "green", icon: "checkbox-circle-line" },
      ],
      branches: [{ from: 2, label: "Void", text: "A reversing entry; nothing is deleted", tone: "red" }],
    },
    { type: "screen", id: "cheques", caption: "Cheques", callouts: { clearing: "Cheques in clearing", actions: "Clear or bounce", approval: "Needs approval" } },
    { type: "callout", tone: "note", text: "Payments recorded in Operations post to the books by themselves. You never enter them twice." },
  ],

  hr: [
    {
      type: "screen",
      id: "guide-employee",
      caption: "An employee",
      callouts: { actions: "Apply for leave, edit, more", salary: "Salary breakdown (only if your role sees salaries)", leave: "Leave balances and requests", personal: "Personal details" },
    },
    { type: "screen", id: "guide-leave", caption: "Leave", callouts: { tabs: "Waiting, away now and all", decide: "Approve or reject", apply: "Apply for someone" } },
    {
      type: "table",
      title: "Leave types (defaults)",
      columns: ["Type", "Notes"],
      rows: [
        [b("Annual leave", "green"), "Earned through the year"],
        [b("Casual leave", "sky"), "Short notice, a day or two"],
        [b("Sick leave", "amber"), "With a reason"],
        [b("Unpaid leave"), "No allowance: each day is deducted in payroll"],
      ],
    },
    {
      type: "flow",
      title: "Running payroll",
      steps: [
        { label: "New run", text: "For the month", icon: "calendar-line" },
        { label: "Check", text: "Attendance, unpaid days, bonuses, loans" },
        { label: "Approve", tone: "amber" },
        { label: "Paid", text: "Voucher, bank file and payslips", tone: "green", icon: "checkbox-circle-line" },
      ],
    },
    { type: "screen", id: "guide-payroll", caption: "A payroll run", callouts: { totals: "People, gross, deductions and net pay", files: "Its voucher, bank file and payslips", table: "Each person's pay" } },
  ],

  dashboards: [
    { type: "screen", id: "guide-dashboard", caption: "The executive dashboard", callouts: { filters: "Period, project and compare", card: "Each figure, with a link to its app", tv: "TV mode for the office screen" } },
    { type: "callout", tone: "tip", text: "Turn on Compare to see every figure against the period before." },
  ],

  contacts: [
    {
      type: "screen",
      id: "guide-contact",
      caption: "A contact",
      callouts: { actions: "Call, message, edit or start a new lead", tabs: "Timeline, leads, bookings and requests", details: "Mobile, email, CNIC and address" },
    },
    { type: "callout", tone: "note", text: "One person, one contact: their leads, bookings and requests all hang off it. Merge duplicates rather than keeping two." },
  ],

  documents: [
    { type: "screen", id: "guide-documents", caption: "All documents", callouts: { types: "Company documents by type", upload: "Upload", expiring: "What expires soon" } },
    {
      type: "flow",
      title: "A document's life",
      steps: [
        { label: "Uploaded", icon: "upload-2-line" },
        { label: "New versions", text: "Old ones kept in its history" },
        { label: "Expiry reminder", text: "30 days before", tone: "amber" },
        { label: "Renewed", tone: "green" },
      ],
    },
    { type: "callout", tone: "warning", text: "Buyer and HR files can never be shared outside the workspace." },
  ],

  users: [
    {
      type: "screen",
      id: "guide-roles",
      caption: "Roles & Permissions",
      callouts: { list: "Roles, with how many people have each", matrix: "What the role can do in each app", data: "Which records it sees and its limits" },
    },
    { type: "callout", tone: "tip", text: "Change a role, not a person: everyone with the role gets the change at once." },
  ],

  settings: [
    { type: "screen", id: "guide-import", caption: "Import & Export", callouts: { card: "Import, template and export for each kind of data", history: "Past imports and the rows that failed" } },
    {
      type: "flow",
      title: "Importing data",
      steps: [
        { label: "Template", text: "Download it", icon: "download-2-line" },
        { label: "Fill in", text: "In Excel" },
        { label: "Upload", text: "Match the columns" },
        { label: "Duplicates", text: "Skip or update", tone: "amber" },
        { label: "Imported", tone: "green", icon: "checkbox-circle-line" },
      ],
    },
    { type: "screen", id: "guide-recycle-bin", caption: "Recycle Bin", callouts: { filter: "Filter by app", rows: "What was deleted, by whom and when", actions: "Restore, or delete permanently" } },
  ],
}
