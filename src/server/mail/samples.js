import "server-only"
import { siteUrl } from "@/lib/sites"

// Example data for each email template, used by the console's Emails preview and test sends.
// Add an entry here whenever you add a template to ./templates.
export const EMAIL_SAMPLES = {
  invoice: {
    title: "Invoice",
    when: "An invoice is issued (or resent) to a workspace from the console",
    data: {
      name: "Usman Tariq",
      company: "Skyline Developers",
      code: "INV-2026-00001",
      issued_at: new Date(),
      due_at: new Date(Date.now() + 14 * 86_400_000),
      period_start: new Date(),
      period_end: new Date(Date.now() + 365 * 86_400_000),
      lines: [
        { description: "Growth plan, yearly (10 months charged)", quantity: 1, unit_price: 149990, amount: 149990 },
        { description: "Extra app: Finance", quantity: 12, unit_price: 2000, amount: 24000 },
      ],
      subtotal: 173990,
      tax_rate: 16,
      tax: 27838.4,
      total: 201828.4,
      notes: "Thank you for choosing PropFlow.",
      bank: {
        bankName: "Meezan Bank",
        accountTitle: "PropFlow (Pvt) Ltd",
        accountNumber: "0101-0104567890",
        iban: "PK36MEZN0001010104567890",
        branch: "Gulberg III, Lahore",
        instructions: "Payments are confirmed within one working day.",
      },
    },
  },
  "reset-code": {
    title: "Password reset code",
    when: "Someone asks to reset their password on the sign-in page",
    data: { name: "Ayesha Khan", code: "482913", minutes: 15, ip: "203.0.113.24", requested_at: new Date(), google_only: false },
  },
  "password-changed": {
    title: "Password changed",
    when: "Right after a password is reset",
    data: { name: "Ayesha Khan", ip: "203.0.113.24", changed_at: new Date(), reset_url: siteUrl("auth", "/forgot-password") },
  },
  "team-invite": {
    title: "Console team invitation",
    when: "The platform owner invites someone to the console team",
    data: { name: "Bilal Ahmed", inviter: "Awais Ahmed", role: "Finance", link: siteUrl("auth", "/invite/example-link"), days: 7 },
  },
  "member-invite": {
    title: "Workspace member invitation",
    when: "Someone in a workspace invites a person from Users & Teams",
    data: { name: "Farhan Saeed", inviter: "Awais Ahmed", workspace: "Skyline Developers", role: "Sales Agent", link: siteUrl("auth", "/invite/example-link"), days: 7 },
  },
  "workspace-invite": {
    title: "Workspace invitation",
    when: "Someone is invited from Workspaces to set up a new workspace",
    data: {
      contact_name: "Usman Tariq",
      company: "Skyline Developers",
      inviter: "Awais Ahmed",
      plan: "Growth",
      trial_days: 15,
      link: siteUrl("auth", "/setup/example-link"),
      days: 14,
    },
  },
  "enquiry-received": {
    title: "Enquiry received (to the visitor)",
    when: "A visitor finishes the Create workspace wizard, or sends the Talk to sales or trial form",
    data: {
      name: "Hira Khalid",
      code: "ENQ-26-0001",
      kind: "quote",
      company: "Green Valley Housing",
      needs: [
        "Get leads from Facebook and Instagram ads",
        "Handle enquiries on WhatsApp",
        "Keep plots, files, houses or shops with live availability",
        "Book units and issue allotment letters",
        "Installment plans and schedules for buyers",
      ],
      trial_days: 15,
    },
  },
  "enquiry-alert": {
    title: "New enquiry (to sales)",
    when: "A website enquiry arrives and SALES_NOTIFY_EMAIL is set",
    data: {
      kind_label: "Trial request",
      code: "ENQ-26-0001",
      company: "Green Valley Housing",
      name: "Hira Khalid",
      email: "hira@example.com",
      phone: "0300 1234567",
      city: "Lahore",
      plan: "Growth, monthly",
      projects: "2–3",
      team_size: "6–15",
      call_time: "Afternoon",
      message: "Two housing projects near Raiwind Road, about 600 plots.\nSelling through dealers.",
      console_url: siteUrl("console", "/enquiries"),
    },
  },
}
