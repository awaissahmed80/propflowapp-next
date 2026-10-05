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
- [x] **Facebook & Instagram lead ads (4 Oct 2026)**: Campaigns › Integrations and Settings › Integrations (same view, every third-party connection). Facebook Login (`/api/meta/start` → `/api/meta/callback`, signed state cookie, long-lived user token + Page tokens sealed with ENCRYPTION_KEY), Pages switched on subscribe to `leadgen`; one webhook `/api/meta/webhook` (verify token, X-Hub-Signature-256, answered at once, lead fetched in `after()`), routed by platform `meta_pages` (a Page feeds one workspace). Each Facebook form links to a PropFlow lead form (`lead_forms.provider = 'meta'`, hidden from Lead Forms/public) so leads go through `submitEntry` (contact, open-lead note, assignment rules, 15-min call); custom questions map to budget/size/property type/payment plan/notes. New forms picked up on their own; `meta_leads` log (idempotent by leadgen id) with retry, paused forms keep leads waiting, "Fetch missed leads" (90 days), "Send a test lead". Tenant migration 052, platform 033.
- [x] **Integrations cards + console (4 Oct 2026)**: card grid (Meta, WhatsApp Business, Google Lead Forms, SMS gateway) from `modules/integrations/catalog.js`; (i) popover with "What you need"; Meta "Configure" modal with Lead settings (sync check 15m/hourly/daily, default owner, default stage, notify, dedupe by email, note source; `settings.meta_lead_settings`). Console › Integrations sets each Live / Coming soon / Hidden (only built ones can be live; platform `integrations`, migration 034); Console › Workspaces › a workspace › Integrations switches one off with a reason (`tenant_integrations`; Meta webhooks then hold leads as paused) and disconnects Facebook. Campaign detail has a "Lead ads" tab: the Facebook forms feeding the campaign (leads in 30 days, last lead), "Link a Facebook form" (moves a form from another campaign) and Unlink (`setMetaFormCampaign`). Page pictures from graph.facebook.com/<page>/picture.
- [ ] Schedule `GET /api/cron/meta-sync` every 15 minutes with `Authorization: Bearer $CRON_SECRET` (the lead settings' "check every…" needs it).
- [ ] Meta lead ads, before launch: create the Meta app, add META_APP_ID / META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN, register the redirect + webhook (dev needs a tunnel for the webhook), App Review for the permissions + Business Verification; deauthorize + data-deletion callbacks; reminder before the user token's 60 days end (Page tokens keep leads flowing); scheduled "fetch missed leads".
- [ ] Campaigns: Google Ads lead forms and SMS gateway integrations (shown as "Coming next"); custom domains for landing pages; A/B tests; page versions.
- [ ] Notifications: only Sales booking events so far; add CRM (lead assigned/tagged), approvals, mentions; email/WhatsApp digests.
- [ ] Sales: Download PDF for statement / receipt / allotment letter (preview + print work; needs react-pdf documents like price lists).
- [ ] Sales: late payment surcharge (rate per month on overdue amounts), waivers; refund payment record for cancellations; (transfers with NDC are done in Customer Care).
- [ ] Sales: statuses refresh only when a booking is touched (a payment, plan change…); a daily job should recompute overdue/defaulter (same scheduler gap as CRM).
- [ ] Sales: post receipts and bookings to Finance (chart of accounts) once Finance exists.
- [ ] Estate › unit: link to its booking.
- [x] **Contacts (4 Oct 2026)**: /contacts app on `contacts` + `contact_links`: Overview, All contacts, By type, Missing CNIC and Possible duplicates (same CNIC / mobile / name with honorifics stripped) with Merge (preview what moves, then confirm), contact page with leads, bookings, Estate Management requests, payment requests, dealer firm, employee, login and one timeline; create/edit (types set by hand are self-links `linkable_type "contact"`, migration 049 adds role to the unique key), delete (only with no records), Excel export; CNICs masked without `contacts.cnic` (CRM contact page too). Contact card's View contact and CRM's contact page open it; New lead opens /crm/leads?new=1&contact=ct-… prefilled.
- [ ] Contacts: not yet exercised signed-in in the browser (queries and actions tested by script on TEN00002); "Not the same person" dismissal for name-only duplicates; merging two leads' contacts doesn't merge the leads themselves.
- [x] **Finance (4 Oct 2026)**: double-entry vouchers (JV/CRV/CPV/BRV/BPV, `{TYPE}-{FY}-{SEQ}`) posted automatically from Operations (booking sale, receipts, cheque clear/bounce, cancellation, refunds, commission payouts) and Estate Management fees (src/modules/finance/server/posting.js; `yarn finance:post` back-posts old records); manual vouchers (payment with vendor WHT, receipt, transfer, journal) and void by reversal; receipts & cheques registers, refunds, vendors, payment requests (invoices) with print/PDF; overview, bank & cash, chart of accounts, statements; 10 reports (trial balance, P&L, balance sheet, GL, cash book, voucher register, receivables aging, collections, tax withheld, vendor payments); closed-period lock date; default account. Approvals: without the grant, receipts / cheque status / cancellations / commission payouts / vouchers / refunds go to Approvals (finance approvers).
- [ ] Finance: not yet exercised end to end in the browser with real postings (pages render; posting engine tested in a rolled-back script).
- [ ] Finance: opening balances are one-sided (reports add an "Opening balances" equity line) — post an opening JV against capital instead; year-end close into retained earnings; bank reconciliation; escrow per project; vendor bills (payables); payroll posting once HR exists; `finance.*` grants for existing workspaces' Accountant role (seed only adds missing roles).
- [x] **Screen lock (4 Oct 2026)**: portal privacy lock (⌘/Ctrl+Shift+L, "Lock screen" in the user menu, auto-lock when idle: off/5/10/15/30/60 min). Settings in My Desk › Profile (4- or 6-digit passcode, argon2 like passwords, on `users`); the lock is on the session row (`sessions.locked_at`, `unlock_attempts`) so a reload stays locked; 5 wrong tries end the session; tabs lock together (BroadcastChannel). Not while staff are signed in as a member. Locking needs a passcode: without one, Lock screen / the shortcut open a "Set a passcode first" dialog that locks once it's saved; `lockSession` refuses, auto-lock stays off, and removing the passcode turns auto-lock off. The password still unlocks as a fallback. Animated lock screen (drifting aurora, rise-in, breathing avatar halo, shake on a wrong try, padlock opens and fades into the app on unlock; still under reduced motion).
- [ ] Screen lock: the page underneath is still rendered (hidden, inert) after a reload while locked, so its data is in the HTML; and other server actions still work on a locked session. Make requireTenant refuse (or pages render empty) while `locked_at` is set if that matters.
- [x] **HR & Payroll (4 Oct 2026)** (code `hr`, URL /hrm): employees (optional portal login, linked to contacts as `employee`), leave with balances and approvals, duty roster (posts, shifts, rotating patterns, cover, attendance feeding payroll), loans & advances (My Desk advance requests via Approvals), monthly payroll (tax slabs, EOBI, PF, medical exemption, unpaid days, part months, loan recovery; HR approves, Finance pays → posted to Finance), payslips print/PDF, bank file, 7 HR reports, My Desk My leave / My pay / My roster. Demo: `yarn demo:seed --hr-people`, `--hr-roster`, `--hr-payroll` (not wired into `--reset`).
- [ ] HR: tax slabs default to tax year 2025-26 — verify against the current Finance Act each July; gazetted holidays and overtime rules; statutory deposits (FBR CPR, EOBI) as Finance payments; final settlement on leaving; browser-test payroll pay flow with real clicks.
- [x] **Estate Management, was Customer Care (3 Oct 2026)** (code `services`, URL /estate-management): service desk (list + board), transfers (checklist, NDC on file, fee, biometric; completes by moving the file to the purchaser, or via Approvals without `services.transfer`), NDC (number, validity), possession (ready-owners list, demarcation, letter; booking → Completed), documents, record updates, complaints (priority SLA hours); fees & timelines in Customize; NDC certificate / transfer letter / possession letter with print + PDF; My Desk tasks for requests due within a day.
- [ ] Estate Management (services): not yet tested signed-in in the browser; fees post to Finance once it exists; file attachments on request notes; customer portal / online requests; record updates don't apply the change to the contact automatically.
- [ ] Estate Management (services): pages with New request load every booking (up to 5,000) on each visit; load them when the dialog opens.
- [x] **Documents (4 Oct 2026)** (code `documents`, URL /documents): company documents (assets with app "documents", category = editable "document-type" lookup with a "Who can see" rule, enforced in pages, actions and the file route); sidebar items per type with counts and a read-only "From apps" group (project files, booking files in Operations' scope, landing page images, each linking back); upload (drag & drop, up to 20 MB, PDF/images/Word/Excel, via /api/documents/upload), edit/move, versions (new version, restore), soft delete of the whole chain; expiry dates with an Expiring page, My Desk tasks and a once-a-day 30-day notification (assets.reminded_at); expiring share links (documents.share, never buyer/HR/finance types; revoke; opens logged) at campaigns.<root>/d/<workspace>/<token>; Customize › Document types. Demo: `yarn demo:seed --documents`.
- [ ] Documents: virtual folders (`asset_folders`) inside a type, bulk move/download, and a recycle bin to restore deleted documents.
- [x] **Dashboards (4 Oct 2026)** (code `dashboards`, URL /dashboards): six role dashboards (Executive, Sales & marketing, Collections & finance, Projects & inventory, After-sales, People), 61 cards in src/modules/dashboards/server/cards.js, each read through its source app's context (scope, feature, grant; pay needs `hr.salaries`), dashboards with no visible card left out of the sidebar; filters in the URL (period incl. July–June financial year and custom range, project, compare with the previous equal stretch, Pakistan days); per-person hide / show / drag-to-reorder saved in `dashboard_layouts` (tenant migration 051) with Reset; TV mode (`?tv=1`, 5-minute refresh, `&rotate=1` every minute, full screen). Features `dashboards.executive|sales|finance|inventory|after-sales|people`.
- [ ] Dashboards: campaign spend isn't dated, so cost per lead / per booking are "to date" for campaigns that ran in the period; payroll counts paid runs by month (this month shows nothing until it's paid); not yet tried signed-in on the demo workspace (cards tested by script on TEN00002, pages in the browser on TEN00001); drag and drop is mouse-only (touch uses the arrow buttons).
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
- [ ] Merge duplicate leads (contacts merge in Contacts › Possible duplicates).
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
- [x] **Spotlight (⌘K) search (4 Oct 2026)**: apps, pages from every app's sidebar (locked ones left out, ranked by page name), My Desk pages, and records from the server (`portal/server/search-actions.js` → `search.js`): leads, contacts, bookings, projects, units, estate requests, vouchers, accounts, payment requests, employees, documents, campaigns. Each group uses its app's own `scoped()` rules; matches code, name, phone (0300…/+92…), CNIC (only with the `contacts.cnic` grant); 5 per group; a query with a digit lists records first. Placeholder "Search…".
- [ ] Spotlight: not searched yet: files stored by other apps (Documents › From apps), users, dealers.

## 5. Console (platform staff)

- [ ] Confirm payment flow end to end.
- [x] Console "Sign in as" a member (4 Oct 2026): owner/admin/support staff, any active member, reason required, 60-minute session, amber banner with Exit in the portal, staff console session restored on exit/sign-out/time-out, start/end in console audit + pf_platform.impersonations; full access (user's choice), no workspace notification. Not yet clicked through in a browser.
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
- [x] Demo workspace (3 Oct 2026): `yarn demo:seed` builds "Skyline Developers" (slug `skyline`, owner `owner@skyline-demo.test`, password at the top of `scripts/demo-seed.mjs`) from the Vite TEN-001 data: 3 projects, 426 units, price lists, 226 bookings with schedules, receipts, cheques (clearing, bounced), cancellations and refunds, commission payouts, CRM leads, campaigns, forms, published landing pages, Estate Management requests, vendors and manual vouchers, all posted to Finance in date order. `--reset` rebuilds it, `--check` runs counts, the trial balance and the app's queries. Not imported (no Next tables yet): resale listings, owners, tenancies, HR, images. Documents: `--documents`.
- [x] Numbering (4 Oct 2026): yearly/fiscal sequences count per period (`sequence_periods`, seeded from codes already issued), so back-dated codes continue their own period instead of restarting at 1.
- [x] Screenshots recaptured (4 Oct 2026) from the demo workspace with `yarn screens` (17 screens, light + dark; callouts measured into `src/modules/web/screens.json`). Re-run after UI changes.
- [ ] Keyword landing pages from one template, each with its own title, description, H1, FAQ and structured data, linked from the home page and in the sitemap: `/real-estate-crm-pakistan`, `/housing-society-management-software`, `/plot-balloting-software`, `/installment-management-software`, `/dealer-quota-management` (also: open file management, NOC tracking, WhatsApp CRM, cost per booking).
- [ ] City pages for PPC/local intent (Lahore, Karachi, Islamabad) combining location + type + action.
- [ ] Blog / guides (balloting explained, NDC and transfer steps, installment plan best practices) for long-tail search.
- [ ] Show prices (console) so `SoftwareApplication` structured data carries an AggregateOffer (rich results need an offer or rating); add reviews/rating once there are customers.
- [ ] PPC: negative keywords (free, download, jobs, tutorial, houses for sale, rent near me, how to become).
- [ ] Advertise "Facebook & Instagram lead ads" once the Meta app passes App Review.

### Issues the screenshots exposed (fix, then `yarn screens`)
- [x] Resale & rentals moved to Estate Management (4 Oct 2026): sidebar group Listings / Rentals / Owners (placeholders) at /estate-management/*, feature `estate.resale` (platform migration 032 moved switched-off settings), app descriptions updated; old /project-portfolio/listings… redirect. Build the module later. Website quiz updated.
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
