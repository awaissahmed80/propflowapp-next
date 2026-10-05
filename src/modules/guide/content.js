// The User Guide (/guide): what each app is for and how to do the everyday tasks in it. The guide
// page shows the apps a role opens and marks each task by whether the role can do it.
//   need: { action } — that permission in the app · { grant } — a named permission (APP_PERMISSIONS)
//         { admin } — administrators (full access) · { setup } — setup rights (owner, admin, settings)
//   to:   the page the task starts on (a portal path)

export const BASICS = [
  {
    id: "find-your-way",
    title: "Find your way around",
    icon: "compass-3-line",
    points: [
      "My Desk is your home page: tasks due today, approvals waiting for you, and shortcuts to the apps your role opens.",
      "Open another app from the app switcher (the grid at the top) or from My Desk. Each app has its own sidebar; collapse it with the button at its top.",
      "Your name at the bottom of the sidebar (or top right) opens your menu: theme, My Desk, the tour, this guide, switching workspace, lock screen and sign out.",
      "Lists remember how you sort them. Click a row to open it; tick the boxes on the left to act on several rows at once.",
    ],
  },
  {
    id: "search",
    title: "Search everything",
    icon: "search-line",
    points: [
      "Press ⌘K on a Mac (Ctrl K on Windows) anywhere to open search.",
      "Type a name, mobile number or code to jump to a lead, contact, project, unit, booking or employee, or to a page in any app.",
      "Results only include records your role can see.",
    ],
  },
  {
    id: "approvals",
    title: "Approvals",
    icon: "checkbox-multiple-line",
    points: [
      "Some changes need someone else's OK: extra discounts, refunds, transfers, price lists, vouchers and payroll.",
      "If your role can approve, you act straight away. If not, your request is sent for approval and you're told when it's decided.",
      "Everything waiting for you is in My Desk › Approvals.",
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: "notification-3-line",
    points: [
      "The bell at the top shows what needs your attention: new leads assigned to you, follow-ups due, approvals and their decisions, expiring documents.",
      "Click one to open the record it's about. Mark them read one at a time or all at once.",
    ],
  },
  {
    id: "print-export",
    title: "Print, PDF and Excel",
    icon: "printer-line",
    points: [
      "Every print (receipts, allotment letters, NDCs, payslips, statements, reports) opens a preview first, with Print and Download PDF.",
      "Lists with an Excel button export what's on screen, with your filters. Exports need the Export permission in that app.",
      "Settings › Import & Export brings leads, contacts, units and employees in from Excel or CSV.",
    ],
  },
  {
    id: "delete",
    title: "Deleting and the recycle bin",
    icon: "delete-bin-line",
    points: [
      "Delete moves a record to the recycle bin with what belongs to it (a lead's history, a project's units). It disappears from every list.",
      "Administrators restore it, or delete it permanently, from Settings › Recycle Bin.",
      "Records the books depend on can't be deleted: bookings are canceled, vouchers are voided, employees' employment is ended.",
    ],
  },
  {
    id: "security",
    title: "Keep your account safe",
    icon: "shield-keyhole-line",
    points: [
      "Lock the screen when you step away: your menu › Lock screen, or Ctrl/⌘ + Shift + L. Set a passcode the first time you lock.",
      "Forgot your password? Use Forgot password on the sign-in page; a reset link is emailed to you.",
      "Never share your password. Ask an administrator to invite a colleague instead.",
    ],
  },
]

// The apps, in launcher order. Each: intro (what it's for) and tasks.
export const APP_GUIDES = {
  desk: {
    intro: "Your own page: what's due, what needs approving and your own records, whatever your role.",
    tasks: [
      {
        id: "today",
        title: "See what's due today",
        to: "/",
        steps: ["Open My Desk.", "Work through Tasks: follow-ups, site visits, meetings and reminders due today and overdue.", "Click a task to open its lead, booking or request."],
      },
      {
        id: "approve",
        title: "Approve or reject a request",
        to: "/approvals",
        steps: ["Open My Desk › Approvals.", "Open a request to see what's asked and why.", "Approve, or Reject with a reason. The person who asked is notified."],
      },
      { id: "leave", title: "Apply for leave", to: "/my-leave", steps: ["Open My Desk › My leave.", "Pick the leave type and dates and add a reason.", "Your manager approves it; you're notified either way."] },
      { id: "pay", title: "See your payslips", to: "/my-pay", steps: ["Open My Desk › My pay.", "Open a month to see the payslip, then Print or Download PDF."] },
      {
        id: "profile",
        title: "Check your profile",
        to: "/profile",
        steps: ["Open My Desk › Profile.", "See your email, mobile, role, team and designation. Ask an administrator to change them.", "Set your lock-screen passcode there too."],
      },
    ],
  },
  portfolio: {
    intro: "Your projects and everything you sell in them: phases, blocks, plots, houses, apartments and shops, with their prices.",
    tasks: [
      {
        id: "project",
        title: "Add a project",
        need: { action: "create" },
        to: "/project-portfolio/projects",
        steps: ["Open Projects › New project.", "Fill in the name, type, location, authority and approval status.", "Add its phases and blocks, then photos and documents."],
      },
      {
        id: "inventory",
        title: "Add inventory a series at a time",
        need: { action: "create" },
        to: "/project-portfolio/inventory",
        steps: [
          "Open Inventory › Add inventory.",
          "Pick the project, phase and block.",
          "Give the numbering (e.g. 1 to 120), type, size and premiums (corner, park facing…).",
          "Check the preview and add them. Prices come from the active price list.",
        ],
      },
      {
        id: "price-list",
        title: "Set prices with a price list",
        need: { action: "edit" },
        to: "/project-portfolio/price-lists",
        steps: ["Open Price Lists and start a new version for the project.", "Set rates per size, premiums, charges and payment plans.", "Activate it. Without the Approve permission it waits for approval first."],
      },
      {
        id: "hold",
        title: "Hold, block or revise units",
        need: { action: "edit" },
        to: "/project-portfolio/inventory",
        steps: ["Tick units in Inventory.", "Hold them for a buyer (with an expiry), block them, give them to a dealer's quota or revise their price."],
      },
      {
        id: "progress",
        title: "Post construction progress",
        need: { action: "edit" },
        to: "/project-portfolio/projects",
        steps: ["Open a project › Progress.", "Update each phase's progress and post an update with photos.", "Add events such as balloting or possession dates."],
      },
    ],
  },
  campaigns: {
    intro: "Marketing: campaigns with budgets and goals, lead forms, landing pages and lead ads, all feeding leads into CRM.",
    tasks: [
      {
        id: "campaign",
        title: "Plan a campaign",
        need: { action: "create" },
        to: "/campaigns/all",
        steps: ["Open Campaigns › New campaign.", "Set the objective, project, dates, budget, channels and goals.", "Launch it on its start date; results fill in as leads arrive."],
      },
      {
        id: "form",
        title: "Build a lead form",
        need: { action: "create" },
        to: "/campaigns/forms",
        steps: ["Open Lead Forms › New form.", "Add questions; name and mobile always create the lead.", "Choose who new leads go to.", "Share its link or embed it on your website."],
      },
      {
        id: "page",
        title: "Publish a landing page",
        need: { action: "create" },
        to: "/campaigns/pages",
        steps: ["Open Landing Pages › New page.", "Build it from sections: hero, gallery, payment plan, map, form.", "Publish it and use the tracking links in your ads."],
      },
      {
        id: "lead-ads",
        title: "Connect lead ads",
        need: { action: "edit" },
        to: "/campaigns/integrations",
        steps: ["Open Integrations and connect your Facebook page.", "Pick the lead forms to bring in and the campaign they belong to.", "New leads arrive in CRM within moments, assigned by your rules."],
      },
      { id: "results", title: "See what's working", to: "/campaigns/reports", steps: ["Open Reports for leads, site visits, bookings and cost per lead by campaign, form and channel."] },
    ],
  },
  crm: {
    intro: "Leads from first enquiry to booking: follow-ups, site visits, meetings and the pipeline.",
    tasks: [
      {
        id: "add-lead",
        title: "Add a lead",
        need: { action: "create" },
        to: "/crm/leads?new=1",
        steps: [
          "Open Leads › New lead.",
          "Enter the name and mobile; PropFlow warns you if the person is already a lead.",
          "Add their interest: project, size, budget and source.",
          "Save. It's assigned by your workspace's rules, or to you.",
        ],
      },
      {
        id: "work-lead",
        title: "Work a lead",
        need: { action: "edit" },
        to: "/crm/leads",
        steps: [
          "Open the lead from the list or the board.",
          "Log every call, visit or meeting with its outcome.",
          "Plan the next follow-up so it shows on your desk when it's due.",
          "Move the status along: New, Contacted, Interested, Site visit scheduled, Negotiation.",
        ],
      },
      {
        id: "close",
        title: "Close a deal",
        need: { action: "edit" },
        to: "/crm/leads",
        steps: ["Open the lead › Close deal.", "Won: book a unit (it carries on in Operations). Lost: give the reason.", "Archive leads that go quiet; restore them from the Archived tab."],
      },
      {
        id: "assign",
        title: "Assign leads to people",
        need: { grant: "crm.reassign" },
        to: "/crm/leads",
        steps: ["Tick leads in the list.", "Assign them to a person, or let the assignment rules share them out in turn."],
      },
      {
        id: "follow-ups",
        title: "Keep on top of follow-ups",
        to: "/crm/follow-ups",
        steps: ["Open Follow-ups for what's due and overdue; Site visits and Meetings for the calendar.", "The Leaderboard shows who's converting."],
      },
      {
        id: "import",
        title: "Import leads from Excel",
        need: { action: "create" },
        to: "/settings/import-export",
        steps: ["Download the template from Settings › Import & Export (or the list's ⋮ menu).", "Fill it in and upload it; match the columns.", "Choose who gets the leads and what to do with duplicates."],
      },
    ],
  },
  operations: {
    intro: "Sales after the token: bookings, payment plans, installments, receipts, allotment and commissions.",
    tasks: [
      {
        id: "booking",
        title: "Book a unit",
        need: { action: "create" },
        to: "/operations/bookings",
        steps: [
          "Book from a won lead, or Bookings › New booking.",
          "Pick the unit, buyer and payment plan; add any discount your role allows.",
          "Record the token payment. The booking moves through Token, KYC, Active, Handover and Completed.",
        ],
      },
      {
        id: "receipt",
        title: "Record a payment",
        need: { grant: "operations.receipts" },
        to: "/operations/receipts",
        steps: ["Open the booking › Payments › Record payment.", "Enter the amount, method and cheque or transfer details.", "It's matched to the oldest dues first; print the receipt from the preview."],
      },
      {
        id: "installments",
        title: "Chase installments",
        to: "/operations/installments",
        steps: ["Open Installments for what's due and overdue by project and buyer.", "Reminders go out by SMS automatically when the workspace has SMS connected."],
      },
      {
        id: "allot",
        title: "Issue an allotment letter",
        need: { grant: "operations.allot" },
        to: "/operations/bookings",
        steps: ["Open the booking once KYC is complete.", "Issue the allotment letter and print it from the preview."],
      },
      {
        id: "cancel",
        title: "Cancel a booking",
        need: { grant: "operations.cancel" },
        to: "/operations/bookings",
        steps: ["Open the booking › Cancel.", "PropFlow works out the refund under your rules; the unit goes back on sale.", "Finance pays the refund."],
      },
      {
        id: "commissions",
        title: "Commissions",
        need: { grant: "operations.commissions" },
        to: "/operations/commissions",
        steps: ["Open Commissions to see what agents and dealers have earned on their bookings.", "Those who can pay commissions create payouts here."],
      },
    ],
  },
  estate: {
    intro: "After-sales: the service desk, transfers, NDCs, possession, complaints, resale listings and rentals.",
    tasks: [
      {
        id: "request",
        title: "Log a service request",
        need: { action: "create" },
        to: "/estate-management/requests",
        steps: ["Open Service desk › New request.", "Pick the buyer's unit and the request type.", "Assign it and track it to done; the buyer's history keeps it."],
      },
      {
        id: "transfer",
        title: "Transfer a file",
        need: { grant: "estate.transfer" },
        to: "/estate-management/transfers",
        steps: ["Start a transfer from the unit's owner.", "Collect the buyer's and seller's documents and the transfer fee.", "Approve and complete it: the file moves to the new owner."],
      },
      {
        id: "ndc",
        title: "Issue an NDC",
        need: { grant: "estate.ndc" },
        to: "/estate-management/ndc",
        steps: ["Open NDC and pick the unit.", "PropFlow checks the buyer has no overdue dues.", "Issue it and print it from the preview."],
      },
      {
        id: "possession",
        title: "Hand over possession",
        need: { grant: "estate.possession" },
        to: "/estate-management/possession",
        steps: ["Open Possession for units ready to hand over.", "Record the handover with its documents and date."],
      },
      { id: "complaints", title: "Handle complaints", to: "/estate-management/complaints", steps: ["Open Complaints, assign each one and record what was done until it's closed."] },
    ],
  },
  finance: {
    intro: "One set of books: receipts, cheques, payments, vouchers, refunds, vendors, banks and reports. Money in from Operations posts by itself.",
    tasks: [
      { id: "receipts", title: "See money in", to: "/finance/receipts", steps: ["Open Receipts for every payment recorded in Operations, already posted to the books."] },
      {
        id: "cheques",
        title: "Clear or bounce cheques",
        need: { grant: "finance.cheques" },
        to: "/finance/cheques",
        steps: ["Open Cheques for those in hand and deposited.", "Mark each cleared or bounced; a bounced cheque reopens the buyer's dues."],
      },
      {
        id: "voucher",
        title: "Pay an expense",
        need: { action: "create" },
        to: "/finance/vouchers",
        steps: ["Open Vouchers › New voucher.", "Pick the vendor, the expense account and the bank or cash account.", "With Approve it posts at once; otherwise it waits in Approvals."],
      },
      {
        id: "requests",
        title: "Handle payment requests",
        need: { action: "approve" },
        to: "/finance/payment-requests",
        steps: ["Open Payment requests raised by other apps (refunds, commissions, fees).", "Pay or reject each one."],
      },
      { id: "refund", title: "Pay a refund", need: { grant: "finance.refunds" }, to: "/finance/refunds", steps: ["Open Refunds for canceled bookings.", "Pay the refund from a bank or cash account."] },
      { id: "void", title: "Void a voucher", need: { grant: "finance.void" }, to: "/finance/vouchers", steps: ["Open the voucher › Void.", "A reversing entry is posted; nothing is deleted."] },
      { id: "reports", title: "Run reports", need: { action: "export" }, to: "/finance/reports", steps: ["Open Reports: trial balance, ledgers, cash book, receivables and more.", "Print or download any report."] },
    ],
  },
  hr: {
    intro: "Your people: employees, leave, duty rosters and attendance, payroll, loans and advances.",
    tasks: [
      {
        id: "employee",
        title: "Add an employee",
        need: { action: "create" },
        to: "/hrm/employees",
        steps: ["Open Employees › New employee.", "Fill in their details, designation, team, project and salary.", "Link their portal login if they have one, so they see their own leave and payslips."],
      },
      { id: "leave", title: "Approve leave", need: { grant: "hr.approve-leave" }, to: "/hrm/leave", steps: ["Open Leave for pending requests.", "Approve or reject each one; balances update by themselves."] },
      {
        id: "roster",
        title: "Plan the duty roster",
        need: { grant: "hr.roster" },
        to: "/hrm/roster",
        steps: ["Open Duty roster.", "Set each post's pattern and swap shifts for a day.", "Mark attendance against the roster."],
      },
      {
        id: "payroll",
        title: "Run payroll",
        need: { grant: "hr.payroll" },
        to: "/hrm/payroll",
        steps: ["Open Payroll › New run for the month.", "Check attendance, allowances, deductions and loan repayments.", "Approve it to post salaries; payslips appear in each person's My Desk."],
      },
      { id: "loans", title: "Give a loan or advance", need: { grant: "hr.loans" }, to: "/hrm/loans", steps: ["Open Loans & advances › New.", "Set the amount and monthly deduction; payroll takes it back."] },
      { id: "end", title: "End someone's employment", need: { action: "edit" }, to: "/hrm/employees", steps: ["Open the employee › ⋮ › End employment.", "Give the last day and reason. Their record and history stay."] },
    ],
  },
  dashboards: {
    intro: "The numbers at a glance: executive summary, sales and marketing, collections and finance, inventory, after-sales and people.",
    tasks: [
      {
        id: "read",
        title: "Read a dashboard",
        to: "/dashboards",
        steps: [
          "Open Dashboards and pick one from the sidebar.",
          "Change the period at the top: this month, quarter, financial year or a custom range.",
          "Hover a chart for exact figures; each figure is compared with the period before.",
        ],
      },
    ],
  },
  contacts: {
    intro: "Every person and firm the company deals with, in one place: leads, buyers, dealers, vendors and employees.",
    tasks: [
      { id: "find", title: "Find someone", to: "/contacts/all", steps: ["Open All contacts and search by name, mobile, CNIC or company.", "Open a contact to see their leads, bookings, requests and one timeline."] },
      { id: "add", title: "Add a contact", need: { action: "create" }, to: "/contacts/all", steps: ["Open All contacts › New contact.", "Fill in their details and what they are (buyer, dealer, vendor…)."] },
      {
        id: "duplicates",
        title: "Merge duplicates",
        need: { action: "edit" },
        to: "/contacts/duplicates",
        steps: ["Open Possible duplicates (same CNIC, mobile or name).", "Preview what moves, then merge them into one."],
      },
      { id: "cnic", title: "Fill in missing CNICs", need: { action: "edit" }, to: "/contacts/missing-cnic", steps: ["Open Missing CNIC and add them; full numbers are only shown to roles allowed to see them."] },
    ],
  },
  documents: {
    intro: "Company documents with versions and expiry dates, plus files from every app, shared safely when needed.",
    tasks: [
      {
        id: "upload",
        title: "Upload a document",
        need: { action: "create" },
        to: "/documents",
        steps: ["Open All documents › Upload.", "Drop the files (PDF, images, Word, Excel up to 20 MB) and pick the type.", "Add an expiry date for licenses, NOCs and agreements to be reminded 30 days before."],
      },
      { id: "version", title: "Add a new version", need: { action: "edit" }, to: "/documents", steps: ["Open the document › New version.", "Earlier versions stay in its history and can be restored."] },
      {
        id: "share",
        title: "Share outside the company",
        need: { grant: "documents.share" },
        to: "/documents/shared",
        steps: ["Open the document › Share.", "Set when the link expires; every open is logged.", "Revoke it from Shared links at any time. Buyer and HR files can't be shared."],
      },
      { id: "expiring", title: "Watch expiring documents", to: "/documents/expiring", steps: ["Open Expiring for what runs out in the next 30 days."] },
    ],
  },
  users: {
    intro: "Who works in the workspace: people, teams, roles and permissions, dealer logins and the activity log.",
    tasks: [
      {
        id: "invite",
        title: "Invite a colleague",
        need: { action: "create" },
        to: "/users/invitations",
        steps: ["Open Invitations › Invite.", "Enter their email, role and team.", "They get an email to set their password and join."],
      },
      { id: "team", title: "Set up teams", need: { action: "edit" }, to: "/users/teams", steps: ["Open Teams › New team.", "Pick the lead and members, and set targets. Team leads see their team's work."] },
      {
        id: "roles",
        title: "Change what a role can do",
        need: { action: "edit" },
        to: "/users/roles",
        steps: [
          "Open Roles & Permissions and pick a role.",
          "Tick the actions per app, choose which records it sees (own, team or everything) and its special permissions.",
          "Changes apply to everyone with that role at once.",
        ],
      },
      {
        id: "dealers",
        title: "Give a dealer a login",
        need: { action: "create" },
        to: "/users/dealers",
        steps: ["Open Dealer Accounts and add the firm.", "Invite its people; they only see their quota, leads, bookings and commissions."],
      },
      { id: "activity", title: "See who did what", to: "/users/activity", steps: ["Open Activity Log and filter by person, app or date."] },
    ],
  },
  settings: {
    intro: "The workspace itself: company profile, billing, lists and labels, app settings, data, integrations and email.",
    tasks: [
      { id: "profile", title: "Company profile and logo", need: { setup: true }, to: "/settings", steps: ["Open Company Profile.", "Add the name, NTN, addresses and logo printed on letters and receipts."] },
      {
        id: "lists",
        title: "Customize lists and labels",
        need: { setup: true },
        to: "/settings/lists",
        steps: ["Open Lists & Labels.", "Add, rename, color or hide choices such as lead sources, unit types and statuses."],
      },
      { id: "apps", title: "Tune each app", need: { setup: true }, to: "/settings/apps", steps: ["Open App Settings for each app's rules: lead assignment, booking fees, reminders and more."] },
      {
        id: "integrations",
        title: "Connect SMS, lead ads and email",
        need: { setup: true },
        to: "/settings/integrations",
        steps: ["Open Integrations and connect the services your company uses.", "Set up Email to send from your own address."],
      },
      {
        id: "bin",
        title: "Restore deleted records",
        need: { admin: true },
        to: "/settings/recycle-bin",
        steps: ["Open Recycle Bin.", "Restore a record with everything deleted along with it, or delete it permanently."],
      },
      { id: "billing", title: "Plan and invoices", need: { admin: true }, to: "/settings/billing", steps: ["Open Subscription & Billing for your plan, apps, usage and invoices."] },
    ],
  },
}

// Setup for a new workspace (owners and administrators)
export const OWNER_START = [
  { title: "Complete workspace setup", text: "Company profile, logo, bank and cash accounts and preferences.", to: "/setup" },
  { title: "Add your projects and inventory", text: "Project Portfolio › Projects, then Inventory and a price list.", to: "/project-portfolio/projects" },
  { title: "Invite your team", text: "Users & Teams › Invitations. Pick each person's role; the defaults fit most companies.", to: "/users/invitations" },
  { title: "Check the roles", text: "Users & Teams › Roles & Permissions. Adjust what each role can do and see.", to: "/users/roles" },
  { title: "Bring in your data", text: "Settings › Import & Export for existing leads, contacts, units and employees.", to: "/settings/import-export" },
  { title: "Connect your channels", text: "Settings › Integrations for SMS reminders and lead ads.", to: "/settings/integrations" },
]
