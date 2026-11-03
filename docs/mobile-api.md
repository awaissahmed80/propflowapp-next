# PropFlow mobile API

The API the PropFlow app (`~/Documents/MobileApps/propflow-app`, forked from the School360 app)
talks to. It follows the same contract as School360's mobile API: base URL, headers, error
shape, sign-in steps, sessions and push all match, so the app's client code, auth screens and
push handling are shared.

Code: routes in `src/app/api/mobile/v1/`, plumbing in `src/modules/mobile/server/` (`api.js`,
`sign-in.js`, `profile.js`, `ops.js`), sessions in `src/server/auth/mobile-session.js`, push in
`src/server/push/`. Check it with `node scripts/mobile-smoke.mjs` (demo workspace).

## Basics

- **Base URL**: `https://auth.<ROOT_DOMAIN>/api/mobile/v1`
  - Local: `https://auth.propflowapp.test/api/mobile/v1`
  - Production: `https://auth.propflowapp.com/api/mobile/v1`
  - Any other host answers 404.
- **Bodies**: JSON in, JSON out. Every answer is `Cache-Control: private, no-store`.
- **Headers**
  - `Authorization: Bearer <token>`: every route except the sign-in steps.
  - `X-App-Version: 1.4.0`: the app's version. Below `MOBILE_MIN_VERSION`, every route answers
    426 `upgrade`.
- **Codes in paths, never ids**: leads by their code (`/leads/ld-00427`), projects by theirs
  (`/projects/ske/units`), approvals by theirs. Any case works. Ids that are not codes, such as a
  planned activity's id or a notification's id, go in the body.
- **Times**: ISO 8601 in UTC. Inputs the web takes in Pakistan time say so: activity `at` is
  `"yyyy-MM-ddTHH:mm"` PKT, and `nextTime` is `"HH:mm"` PKT.
- **Same rules as the browser**: a mobile request runs as its session (`runAsMobile` in
  `server/auth/dal.js`). That means the portal's own contexts and server actions answer it, with the
  same role permissions, lead scope (own, team or all), plan features and approval rules as in a
  browser.

## Errors

```json
{ "error": { "code": "invalid", "message": "Enter their mobile number.", "field": "phone" } }
```

`message` is a sentence the app can show as it is. `field` is present when one field is wrong, and
`values` fills in placeholders, as in `password_weak` → `{ "minLength": 8 }`.

| Code | Status | When |
|---|---|---|
| `invalid` | 400 | The request or one of its fields is wrong (`field`) |
| `invalid_credentials` | 401 | Wrong email or password |
| `unauthorised` | 401 | No token, or an unknown, expired or revoked one: sign in again |
| `no_access` | 401 | No longer a member, or the workspace is closed (the session is ended) |
| `ticket_expired` | 401 | A sign-in step's ticket is used or older than 10 minutes |
| `google_invalid` / `google_not_linked` / `google_mismatch` | 401 / 404 / 409 | Google sign-in |
| `inactive` | 403 | The account is switched off |
| `workspace_suspended` | 403 | The workspace is suspended |
| `no_workspace` | 403 | The account is in no workspace (PropFlow staff) |
| `password_change` | 403 | A temporary password must be changed first |
| `password_weak` / `password_same` | 400 | A new password is refused |
| `forbidden` | 403 | The role can't do this (or can't open this app) |
| `feature_off` | 403 | The workspace's plan leaves this out |
| `not_found` | 404 | Not there, or not this person's to see |
| `duplicate` | 409 | An open lead already has this mobile (see `POST /leads`) |
| `op_conflict` | 409 | This `opId` was used for a different change |
| `locked` | 423 | Too many wrong passwords |
| `upgrade` | 426 | The app is older than `MOBILE_MIN_VERSION` |
| `too_many` | 429 | Rate limit (sign-in: 10 per email and address per 15 minutes) |
| `server` | 500 | A bug; outside production `message` carries the reason |
| `maintenance` / `google_unavailable` | 503 | |

## Sign-in

Each step answers one of these:

```js
{ token, expiresAt, sessionId, user, workspace }        // signed in
{ next: "change_password", ticket, policy: { minLength } }
{ next: "choose", ticket, workspaces: [{ key, code, name, city }] }
{ error: { code, … } }
```

| Route | Body |
|---|---|
| `POST /auth/sign-in` | `{ email, password, device }` |
| `POST /auth/google` | `{ idToken, device }`: an ID token from Google Sign-In on the phone; existing accounts only |
| `POST /auth/change-password` | `{ ticket, password }` |
| `POST /auth/choose` | `{ ticket, workspaceKey }` |
| `POST /auth/switch` | `{ workspaceKey }` (signed in): another of their workspaces; a new token replaces this one |
| `POST /auth/sign-out` | ends this phone's session |
| `POST /auth/push-token` | `{ pushToken }`: the FCM token, or `null` to stop pushes |
| `GET /dev/demo-accounts` | Development only. The demo workspace's sign-ins: `{ workspace, password, people: [{ name, email, role }] }` |

`device` is `{ name, platform: "ios" | "android", appVersion, pushToken? }`.

`user` is `{ id, name, email, phone, avatarUrl }`.

`workspace` is `{ key, code, name, city, role: { code, name }, apps }`:
- `apps` lists only the apps the workspace has and the role can open. Each entry is
  `{ actions: ["view", "create", "edit", …], off: [features the plan leaves out] }`.
- The phone has screens for `crm`, `portfolio` and `contacts` (`operations` is listed for bookings to come).

Sessions are rows in `pf_auth.sessions` with `kind = "mobile"`. Only a SHA-256 hash of the token is
stored. A session lasts `MOBILE_SESSION_DAYS` (60 by default) and is extended each time it is used.

## Account

| Route | Answer |
|---|---|
| `GET /me` | `{ user, workspace, session, minAppVersion }`. Ask at start and on return to the foreground |
| `GET /workspaces` | `{ workspaces: [{ key, code, name, city, open, current }] }` |
| `GET /me/sessions` | `{ sessions: [{ key, kind: phone \| browser, name, platform, ip, lastSeenAt, createdAt, current }] }` |
| `DELETE /me/sessions` | `{ key }` signs one session out; `{ others: true }` signs out every session except this phone |

## My Desk

| Route | Answer |
|---|---|
| `GET /home` | `{ me, counts: { tasks, approvals, mine, holds }, critical, tasks, approvals, recent }` |
| `GET /tasks` | `{ tasks: [{ id, app, icon, title, detail, href, critical }] }` |

`href` is a portal path such as `/crm/leads?lead=ld-00427`. The app opens the paths it has screens for
and sends the rest to the browser.

## CRM

| Route | |
|---|---|
| `GET /crm/lists` | `{ lists, projects, agents, can: { create, edit, reassign } }`. `lists` holds the workspace's pick-lists (lead status, source, temperature, activity types and outcomes, follow-up options, loss reasons…), each `[{ value, label, color?, icon? }]` |
| `GET /leads` | One page of leads, the same as the web list. Query: `tab` (open, due, booked, lost, archived), `q`, `status`, `source`, `priority`, `project` (codes or `none`), `agent` (ids or `none`) as comma lists, `sort` (name, status, next, added), `dir`, `page`, `size` (10–100). Answers `{ rows, total, page, size, counts: { open, due, booked, lost, archived }, overdue, any, scoring }` |
| `POST /leads` | `{ lead: { name, phone, whatsapp?, email?, city?, source?, priority?, projectCode?, unitType?, sizeValue?, sizeUnit?, budgetMin?, budgetMax?, paymentPlan?, purpose?, notes?, assignedTo? }, force?, opId? }` → `{ ok, code }`. If an open lead has the same mobile: 409 `duplicate` with `duplicate: [{ code, name, status, … }]`; send again with `force: true` to add it anyway |
| `GET /leads/<code>` | `{ lead, can }`. `lead` has the contact, interest, agent, next, score, `planned` (open items with their `id`), `history` (newest first) and `booking` |
| `PATCH /leads/<code>` | `{ lead: { …only the fields to change }, opId? }` → `{ ok }` |
| `POST /leads/<code>/status` | `{ status, lossReason?, note?, opId? }` → `{ ok }`. `lost` needs `lossReason`; `note` is required when Settings › CRM asks for one |
| `POST /leads/<code>/activities` | Log something that just happened: `{ kind: "log", type, outcome?, notes?, next?, nextType?, nextTime?, statusTo?, lossReason?, projectCode?, opId? }` → `{ ok, status }`. This completes whatever was due and moves the status forward |
| | Plan a follow-up: `{ kind: "plan", type, at? \| next?, notes?, projectCode?, opId? }` → `{ ok }`. It replaces the open item; a site visit needs a project |
| `PATCH /leads/<code>/activities` | `{ id, action: done \| reschedule \| missed \| cancel, outcome?, notes?, next?, nextType?, nextTime?, opId? }` → `{ ok }` |
| | **Voice note:** either activity call can be sent as `multipart/form-data` instead: a `data` field holding the same JSON, plus a `voice` file (m4a/AAC, up to 5 MB). It is stored on the activity and shows in `history[].voice.url` |
| `GET /files/<code>` | A stored file (voice notes, documents) with the bearer token. Paths in responses (such as `voice.url`) are relative: join them to the API origin. Supports byte ranges; `?download=1` for an attachment |
| `GET /follow-ups` | `?kind=follow-ups \| site-visits \| meetings&mine=1` → `{ items: [{ id, type, status, at, doneAt, outcome, notes, by, project, lead }] }`. Covers planned items on open leads plus the last 30 days of done ones |

## Contacts

The workspace directory: one record per person or firm (`CT-00012`), with types from what they are
linked to (lead, customer, dealer, employee…) plus the ones set by hand. The role's scope applies:
`linked` sees contacts on their own leads and bookings and the ones they added; `all` sees everyone.
CNICs come masked (`35202-•••••••-1`) unless the role has the full-CNIC grant.

| Route | |
|---|---|
| `GET /contacts/lists` | `{ lists: { contact-type, city }, can: { create, edit, review } }` |
| `GET /contacts` | Query: `view` (`all`, `type:<type>`, or `missing-cnic` with the review feature), `q` (name, company, code, email or mobile in any form), `page`, `size` (up to 100). Answers `{ rows: [{ code, kind, name, phone, whatsapp, email, cnic, hasCnic, city, overseas, company, designation, createdAt, types, leads: { total, open }, bookings }], total, page, size, counts: { all, types: { <type>: n }, missingCnic? }, can }`. Newest first |
| `POST /contacts` | `{ contact: { kind?: person \| company, name, phone, whatsapp?, email?, cnic?, city?, overseas?, address?, company?, designation?, guardianRelation?, guardianName?, notes?, types }, opId? }` → `{ ok, code }`. A mobile or CNIC someone else has: 409 `duplicate` with `clash: { code, name }` |
| `GET /contacts/<code>` | `{ contact, can: { edit } }`. `contact` has the details, `types` (`ownTypes` set by hand, `linkedTypes` from records), `leads`, `bookings`, `requests`, `paymentRequests`, `dealers`, `employees`, `logins` (only what this person's apps let them see; `hiddenLeads`… count the rest) and a `timeline` across apps |
| `PATCH /contacts/<code>` | `{ contact: { …only the fields to change }, opId? }` → `{ ok, code }`. Sending back the masked CNIC keeps it |

## Inventory (read only)

| Route | |
|---|---|
| `GET /projects` | `{ projects: [{ code, name, color, type, city, status, coverUrl, unitTypes, phaseCount, blockCount, stats }] }` |
| `GET /projects/<code>/units` | Query: `status`, `type` (comma lists), `q` (number or street), `page`, `size` (up to 200). Answers `{ project, rows: [{ code, number, type, category, sizeValue, sizeUnit, street, floor, bedrooms, features, price, status, block, phase, hold }], total, page, size, counts }`. `counts` gives units per status, ignoring the status filter |

## Approvals

| Route | |
|---|---|
| `GET /approvals` | `{ waiting, mine, decided }`, each `[{ code, type, status, title, details, amount, link, reason, note, requestedAt, decidedAt, requester, decider }]` |
| `POST /approvals/<code>` | `{ decision: approved \| rejected, note?, opId? }` → `{ ok, message }`. Rejecting needs a note. Approving runs the change in its app, as this person |

## Notifications

| Route | |
|---|---|
| `GET /notifications` | `?page=&size=` → `{ items: [{ id, app, kind, title, body, href, icon, read, at }], unread, page, size, more }` |
| `POST /notifications/read` | `{ ids? }` → `{ ok }`. With no ids, everything is marked read |

## Writes made once (`opId`)

Every write accepts an `opId` (8–36 characters: letters, digits and `-`, such as a UUID).
- The app makes one per change and sends the same one again, unchanged, until it gets an answer.
- A repeat gets the first answer back with `replayed: true`, and nothing is done twice.
- The same `opId` used for a different change, or by someone else, answers 409 `op_conflict`.
- Only changes that succeeded are remembered (tenant table `sync_ops`), so a refused change can be
  corrected and sent again with the same `opId`.

## Push notifications

Every `notify()` (`src/server/notifications.js`), which is every bell notification in every app,
also pushes to that person's phones signed in to that workspace. The push is sent after the
response and is best-effort; dead tokens are removed.

- **Sending**: Firebase Cloud Messaging HTTP v1 with a service account (`FCM_SERVICE_ACCOUNT`, a
  file path or base64 of the JSON). No Firebase SDK is used on the server. If the variable isn't
  set, pushes are off and the bell still works.
- **Message**: `notification: { title, body }`. `data` carries `{ notificationId, app, kind, tenant, href, url, unread }`.
- **Android channels** (Notifee): `approvals`, `leads`, `payments`, `general`.
- **iOS**: `aps.badge` is set to the person's unread count.

## Settings (`.env`)

| Variable | |
|---|---|
| `MOBILE_MIN_VERSION` | Oldest app version allowed (426 below it) |
| `MOBILE_SESSION_DAYS` | Days a phone stays signed in without use (default 60) |
| `FCM_SERVICE_ACCOUNT` | Push notifications |
| `GOOGLE_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` | Google sign-in audiences |
