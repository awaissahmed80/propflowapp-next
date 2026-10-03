# PropFlow: missing pieces and to-do

A running list of what's still missing or worth improving across the SaaS. Tick items off as they
land, add new ones as they come up, and keep each item short enough to act on. Newest decisions
win: if something here contradicts the code, the code is the source of truth.

Last reviewed: 3 October 2026 (Sales)

---

## 1. Apps not built yet

The Vite demo (`../propflowapp`) has these; the Next app doesn't.

- [x] **Sales (first pass, 3 Oct 2026)**: Overview, Bookings (list), booking page (stage stepper, plan from price list, buyer KYC + nominee, receipts with cheque clearing/bounce, allotment letter, handover → possession, hold, cancel with refund), Installments, Receipts, Lists & Labels; statement / receipt / allotment letter print previews; My Desk tasks.
- [ ] Sales: **New booking** straight from Sales (walk-ins: unit → buyer → plan → token/down payment), not only via CRM's Close deal.
- [ ] Sales: approvals instead of a hard "no" for extra discount over the role's limit and for cancellation without `sales.cancel` (approvals table + handlers).
- [x] Sales: **booking ownership** (sold by vs handled by), Customize › Assignment rules by stage, Settings, header reassign; seller keeps visibility; notifications (bell) for booking events.
- [x] Sales: **Commissions** (dealer / sold-by agent, rate saved per booking, dealer agreed rate, trigger setting, payouts PO-YYYY with sec. 233 withholding, vouchers, clawback → recovered) and **Reports** (sales register, collections, aging, defaulters, by project, by agent & dealer, cancellations, cheque register; CSV export).
- [ ] Sales: post commission payouts to Finance (Dr commission expense, Cr bank, Cr tax withheld) once Finance exists; dealer tax certificates.
- [ ] Sales: reports as PDF/print (CSV export works); scheduled email of the defaulters list.
- [x] App URLs (3 Oct 2026): app codes renamed with names: estate→portfolio (Project Portfolio, /project-portfolio), sales→operations (Operations), services→estate (Estate Management, /estate-management), hr at /hrm. Permissions, role JSON, approvals/notifications/assets/activity data and settings keys migrated (platform 030, tenant 045); old URLs 308-redirect. Default role Estate Officer. Launcher descriptions 52–58 chars, new icons. Table names and JS identifiers (salesContext…) still use old words.
- [x] Themed error pages: 404 / 500 / 403 (root, portal, and in-app inside each app's frame), global error fallback.
- [x] **Campaigns (3 Oct 2026)**: campaigns (goals, channels, UTM tracking, results from CRM leads), lead forms (builder, hosted + embed.js, entries → CRM leads with rules/round-robin), landing pages (section library with ~20 types and layouts, per-section style, theme, SEO, image uploads, undo, device preview, full-width builder; public at campaigns.<domain>/<workspace>/<slug>).
- [ ] Campaigns: Integrations (Meta lead ads, Google Ads) is ComingSoon (Reports done: 8 reports with print/PDF/Excel); custom domains for landing pages; A/B tests; page versions.
- [ ] Notifications: only Sales booking events so far; add CRM (lead assigned/tagged), approvals, mentions; email/WhatsApp digests.
- [ ] Sales: Download PDF for statement / receipt / allotment letter (preview + print work; needs react-pdf documents like price lists).
- [ ] Sales: late payment surcharge (rate per month on overdue amounts), waivers; refund payment record for cancellations; (transfers with NDC are done in Customer Care).
- [ ] Sales: statuses refresh only when a booking is touched (a payment, plan change…); a daily job should recompute overdue/defaulter (same scheduler gap as CRM).
- [ ] Sales: post receipts and bookings to Finance (chart of accounts) once Finance exists.
- [ ] Estate › unit: link to its booking.
- [ ] **Contacts**: the full directory on the central `contacts` + `contact_links` tables: All contacts, By type, Missing CNIC, Possible duplicates, contact create/edit, CNIC masking grant (`contacts.cnic`). CRM › Contacts already shows lead contacts.
- [x] **Finance (4 Oct 2026)**: double-entry vouchers (JV/CRV/CPV/BRV/BPV, `{TYPE}-{FY}-{SEQ}`) posted automatically from Operations (booking sale, receipts, cheque clear/bounce, cancellation, refunds, commission payouts) and Estate Management fees (src/modules/finance/server/posting.js; `yarn finance:post` back-posts old records); manual vouchers (payment with vendor WHT, receipt, transfer, journal) and void by reversal; receipts & cheques registers, refunds, vendors, payment requests (invoices) with print/PDF; overview, bank & cash, chart of accounts, statements; 10 reports (trial balance, P&L, balance sheet, GL, cash book, voucher register, receivables aging, collections, tax withheld, vendor payments); closed-period lock date; default account. Approvals: without the grant, receipts / cheque status / cancellations / commission payouts / vouchers / refunds go to Approvals (finance approvers).
- [ ] Finance: not yet exercised end to end in the browser with real postings (pages render; posting engine tested in a rolled-back script).
- [ ] Finance: opening balances are one-sided (reports add an "Opening balances" equity line) — post an opening JV against capital instead; year-end close into retained earnings; bank reconciliation; escrow per project; vendor bills (payables); payroll posting once HR exists; `finance.*` grants for existing workspaces' Accountant role (seed only adds missing roles).
- [ ] **HR**: employees (link to contacts as `employee`), attendance/shifts, leave (approvals), payroll.
- [x] **Estate Management, was Customer Care (3 Oct 2026)** (code `services`, URL /estate-management): service desk (list + board), transfers (checklist, NDC on file, fee, biometric; completes by moving the file to the purchaser, or via Approvals without `services.transfer`), NDC (number, validity), possession (ready-owners list, demarcation, letter; booking → Completed), documents, record updates, complaints (priority SLA hours); fees & timelines in Customize; NDC certificate / transfer letter / possession letter with print + PDF; My Desk tasks for requests due within a day.
- [ ] Estate Management (services): not yet tested signed-in in the browser; fees post to Finance once it exists; file attachments on request notes; customer portal / online requests; record updates don't apply the change to the contact automatically.
- [ ] Estate Management (services): pages with New request load every booking (up to 5,000) on each visit; load them when the dialog opens.
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
- [ ] My Desk (now the middle of the launcher, not an app): keep adding each app's to-dos, and mark urgent ones `critical` so they show in the Critical column (CRM follow-ups, holds and approvals do; site visits/meetings due today could too).
- [ ] The platform app catalog (pf_platform `apps`, console Plans/Workspace apps) still lists "My Desk" as an always-on app; the portal hides it. Remove it from the catalog and console screens.
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

## 8. Marketing website & SEO

- [x] Home page reworked (4 Oct 2026) for B2B keywords (real estate CRM / ERP Pakistan, housing society software, files & balloting, installments, dealer quotas, NOC tracking, cost per booking): title, 146-char description, keyword headings, "Only in PropFlow" comparison table, landing page builder spotlight, six pain cards, keyword FAQ, `en-PK`, OG image text, scroll-reveal + animated callouts.
- [x] Demo workspace (3 Oct 2026): `yarn demo:seed` builds "Skyline Developers" (slug `skyline`, owner `owner@skyline-demo.test`, password at the top of `scripts/demo-seed.mjs`) from the Vite TEN-001 data: 3 projects, 426 units, price lists, 226 bookings with schedules, receipts, cheques (clearing, bounced), cancellations and refunds, commission payouts, CRM leads, campaigns, forms, published landing pages, Estate Management requests, vendors and manual vouchers, all posted to Finance in date order. `--reset` rebuilds it, `--check` runs counts, the trial balance and the app's queries. Not imported (no Next tables yet): resale listings, owners, tenancies, HR, documents, images.
- [x] Numbering (4 Oct 2026): yearly/fiscal sequences count per period (`sequence_periods`, seeded from codes already issued), so back-dated codes continue their own period instead of restarting at 1.
- [x] Screenshots recaptured (4 Oct 2026) from the demo workspace with `yarn screens` (17 screens, light + dark; callouts measured into `src/modules/web/screens.json`). Re-run after UI changes.
- [ ] Keyword landing pages from one template, each with its own title, description, H1, FAQ and structured data, linked from the home page and in the sitemap: `/real-estate-crm-pakistan`, `/housing-society-management-software`, `/plot-balloting-software`, `/installment-management-software`, `/dealer-quota-management` (also: open file management, NOC tracking, WhatsApp CRM, cost per booking).
- [ ] City pages for PPC/local intent (Lahore, Karachi, Islamabad) combining location + type + action.
- [ ] Blog / guides (balloting explained, NDC and transfer steps, installment plan best practices) for long-tail search.
- [ ] Show prices (console) so `SoftwareApplication` structured data carries an AggregateOffer (rich results need an offer or rating); add reviews/rating once there are customers.
- [ ] PPC: negative keywords (free, download, jobs, tutorial, houses for sale, rent near me, how to become).
- [ ] Facebook / Meta lead ads sync (Campaigns › Integrations) before advertising "Facebook lead integration".

### Issues the screenshots exposed (fix, then `yarn screens`)
- [ ] Project Portfolio sidebar still shows "Resale & Rentals" (Listings, Rentals, Owners) and the app description says "resale and rentals", but these aren't built; hide them until they are (also in the hero screenshot). Website quiz (`src/modules/web/quote.js`) still offers resale/rentals options.
- [ ] Price list: shop rate shows "Rs 2,990,000/sq ft" for marla-sized shops (per-marla price labeled per sq ft, not in Lac) — `rateText`/`ratePrice` in src/modules/portfolio/pricing.js.
- [ ] Booking overview: Payments card truncates labels ("Ins…", "Next due 11 Oc…") at 1440px; address shows "Lahore, Lahore"; documents 0/6 on an active booking.
- [ ] Activity panels (booking, lead Log tab) open scrolled to the bottom; lead's sticky follow-up card overlaps the timeline.
- [ ] Campaign "Leads per day" chart shows fractional y-axis ticks for whole counts.
- [ ] Trial balance totals in full Rupees while rows are in Lac/Crore.
- [ ] Installments list shows raw +92 phone numbers (format as 0300 1234567); "Installment 6 of 24" wraps.
- [ ] Inventory board: Block C units 1–36 then "214"; inventory "All" view opens on sold units.
- [ ] Project Portfolio overview is a sparse 3-row table with lots of empty space.
- [ ] Cheques "Into" column truncates; estate request breadcrumb says "Service desk" while the back link says "Transfers".
- [ ] Launcher "Finish setting up" card shows while setup is complete until the optional logo is uploaded.

## 9. Launch checklist

- [ ] Production env: `APP_ENV=production`, `NEXT_PUBLIC_ROOT_DOMAIN=propflowapp.com`, `APP_PROTOCOL=https`, `GA_MEASUREMENT_ID`.
- [ ] Google Analytics: check Realtime, mark `generate_lead` as a key event, register `step_name` and `cta_location` custom dimensions.
- [ ] Search Console: verify the domain, submit `/sitemap.xml`, link to GA.
- [ ] Legal pages (`src/modules/web/legal.js`) reviewed by a lawyer; decide a public contact email.
- [ ] Rotate the Google service-account key that was shared in chat.

## 10. Decisions still open

- [ ] Booking numbering per project or company-wide; FY vs calendar resets; whether code formats are editable.
- [ ] Recycle-bin retention period.
- [ ] One app vs monorepo; MySQL version and hosting for scale.
