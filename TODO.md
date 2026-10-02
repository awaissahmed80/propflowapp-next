# PropFlow: missing pieces and to-do

A running list of what's still missing or worth improving across the SaaS. Tick items off as they
land, add new ones as they come up, and keep each item short enough to act on. Newest decisions
win: if something here contradicts the code, the code is the source of truth.

Last reviewed: 2 October 2026

---

## 1. Apps not built yet

The Vite demo (`../propflowapp`) has these; the Next app doesn't.

- [ ] **Sales**: bookings board on `bookings.stage` (Token → Booking & KYC → Active → Handover → Completed) and `bookings.status`; payment plans (CRM saves bookings with `schedule = "pending"`), installment schedules, receipts, allotment letters, dealer commissions, cancellations and refunds. Build on the existing `bookings` / `booking_installments` tables.
- [ ] **Contacts**: the full directory on the central `contacts` + `contact_links` tables: All contacts, By type, Missing CNIC, Possible duplicates, contact create/edit, CNIC masking grant (`contacts.cnic`). CRM › Contacts already shows lead contacts.
- [ ] **Finance**: chart of accounts exists (`accounts`); vouchers, receipts, bank reconciliation, ledgers, reports.
- [ ] **HR**: employees (link to contacts as `employee`), attendance/shifts, leave (approvals), payroll.
- [ ] **Services**: service requests, ownership transfers, NDC and possession, maintenance/complaints.
- [ ] **Campaigns**: campaigns and cost per lead, lead ads, lead forms, landing pages; leads they create must go through `createLead` (assignment rules, contacts).
- [ ] **Documents**: browse every asset (`assets` + `asset_folders`) across apps.
- [ ] **Estate › Resale & Rentals**: Listings, Rentals, Owners are still ComingSoon pages.
- [ ] **Plot Map** (last, by agreement): upload plan, detect plots, colour → size, swipe numbering, editor, SVG viewer.

## 2. CRM

- [ ] **No background scheduler.** The "reassign leads nobody reached" check runs as CRM pages open (at most every 10 min). Add a real job runner (pm2 cron process or a queue) and move this, expiring holds, reminders and digests onto it.
- [ ] Agent **targets** (per month: bookings, value, visits) and progress on the Leaderboard and My Team.
- [ ] Bulk export: Print and PDF (Excel and preview only today; needs a server print/PDF route).
- [ ] Bulk actions on the Board view (only the List has them).
- [ ] Notify the new agent when a lead is assigned or reassigned (notifications are empty states today).
- [ ] Assignment rules: skip agents on leave (needs HR), working-hours awareness, weighted turns, preview "which rule would this lead hit".
- [ ] Lead import (CSV/Excel) with duplicate check and assignment rules; promised in website copy (`src/modules/web/content.js` FAQ).
- [ ] Lead score: optionally set temperature from the score; score history over time.
- [ ] Merge duplicate leads/contacts.
- [ ] Email: inbound replies aren't captured; only sent emails go on the timeline.
- [ ] "WhatsApp enquiries" feature key still exists in `portal/features.js` with nothing behind it (there's no WhatsApp inbox by decision): remove it or define it.

## 3. Estate Management

- [ ] Full Overview page (holds needing attention, stock by size, dealer quotas); today it shows the projects table.
- [ ] Inventory export with the workspace letterhead.
- [ ] Unit modal: show its booking (once Sales exists).

## 4. Users & Teams, Settings, My Desk

- [ ] Link workspace members and dealer logins to contacts (their names and mobiles live in `pf_auth`).
- [ ] Invite-team step in the Getting started checklist (currently "Soon").
- [ ] Settings › Numbering: edit code formats/sequences.
- [ ] Settings › Recycle bin: restore soft-deleted records (retention period to decide).
- [ ] My Desk: keep adding each app's tasks, approvals and notifications as apps land (CRM follow-ups are in; site visits/meetings due today could be too).
- [ ] Notifications and messages panels: real data instead of empty states.
- [ ] Spotlight (⌘K): search leads, contacts, units, bookings, not just apps.

## 5. Console (platform staff)

- [ ] Confirm payment flow end to end, and "sign in as a user" (impersonation).
- [ ] Workspace self sign-up form (`/signup`) for when self sign-up is switched on.

## 6. Auth and accounts

- [ ] `must_change_password` page.
- [ ] Two-factor sign-in for owners and admins.
- [ ] Session list ("signed in on these devices") with sign-out.

## 7. Platform and quality

- [ ] **Automated tests**: none yet. Start with server actions that move money or ownership (bookings, assignment, archive/restore), lead scoring and report maths.
- [ ] Background jobs and retries (emails, PDF generation, provisioning).
- [ ] Error monitoring and alerts in production (e.g. Sentry) and uptime checks.
- [ ] Database backups per tenant, with a tested restore.
- [ ] File storage: decide disk vs S3-compatible; today files are on disk.
- [ ] Rate limits on public forms and server actions beyond sign-in/reset.
- [ ] Audit: every gated action logged to `activity_log` (most are; review Sales/Finance when built).
- [ ] Performance: leads list loads up to 5,000 rows and scores them on each request; paginate or cache once workspaces grow.
- [ ] Accessibility pass (keyboard, focus, contrast) on the newer CRM screens.
- [ ] Urdu: UI strings are English and not yet central; plan extraction before it grows further.
- [ ] Marketing screenshots (`public/images/screens`) still come from the Vite demo and show portal brands; recapture from the Next app.

## 8. Launch checklist

- [ ] Production env: `APP_ENV=production`, `NEXT_PUBLIC_ROOT_DOMAIN=propflowapp.com`, `APP_PROTOCOL=https`, `GA_MEASUREMENT_ID`.
- [ ] Google Analytics: check Realtime, mark `generate_lead` as a key event, register `step_name` and `cta_location` custom dimensions.
- [ ] Search Console: verify the domain, submit `/sitemap.xml`, link to GA.
- [ ] Legal pages (`src/modules/web/legal.js`) reviewed by a lawyer; decide a public contact email.
- [ ] Rotate the Google service-account key that was shared in chat.

## 9. Decisions still open

- [ ] Booking numbering per project or company-wide; FY vs calendar resets; whether code formats are editable.
- [ ] Recycle-bin retention period.
- [ ] One app vs monorepo; MySQL version and hosting for scale.
