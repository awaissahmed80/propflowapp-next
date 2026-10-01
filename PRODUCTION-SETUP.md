# PropFlow · Production setup

How to prepare a server for PropFlow. Steps marked **(planned)** depend on the Next.js app and its scripts, which are still being built.

## 1. What you need

| Piece | Recommended |
|---|---|
| Node.js | Current LTS (22.x) |
| MySQL | **8.4 LTS** (avoid 9.x short-support releases in production) |
| Web server / proxy | Nginx or Caddy in front of Next.js, with HTTPS |
| TLS certificate | One certificate covering `propflowapp.com` and `*.propflowapp.com` |
| Email | Resend account with the sending domain verified |
| File storage | S3-compatible bucket (Cloudflare R2, DigitalOcean Spaces or AWS S3), or local disk to start |

## 2. DNS

| Record | Name | Points to |
|---|---|---|
| A | `propflowapp.com` | server IP |
| A | `*.propflowapp.com` | server IP (covers `auth.`, `portal.`, `console.`, `campaigns.`) |

A wildcard certificate needs a DNS challenge (Let's Encrypt with your DNS provider's API, or Caddy's DNS plugin).

## 3. MySQL

### Server settings (`my.cnf`)

```ini
[mysqld]
character-set-server = utf8mb4
collation-server     = utf8mb4_unicode_ci
default-time-zone    = '+00:00'
sql_mode             = STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
max_connections      = 500
```

`max_connections`: each active tenant uses up to `DB_TENANT_POOL_MAX` connections (5 by default) while it's busy, plus the central pools. Raise it as the number of active subscribers grows.

### Users

Never run the app as `root`. Create two users (choose strong passwords, and restrict the host to the app server instead of `%` if MySQL runs elsewhere):

```sql
-- Everyday app user: works inside pf_ databases, cannot create or drop them
CREATE USER 'pf_app'@'%' IDENTIFIED BY 'change-me-1';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES,
      CREATE TEMPORARY TABLES, LOCK TABLES
  ON `pf\_%`.* TO 'pf_app'@'%';

-- Provisioning user: creates a database for each new subscriber
CREATE USER 'pf_provision'@'%' IDENTIFIED BY 'change-me-2';
GRANT ALL PRIVILEGES ON `pf\_%`.* TO 'pf_provision'@'%';

FLUSH PRIVILEGES;
```

### Databases

| Database | Holds |
|---|---|
| `pf_platform` | Tenants registry, plans, invoices, platform staff, audit |
| `pf_auth` | Users, memberships, sessions, one-time codes |
| `pf_<tenant code>` | One per subscriber, e.g. `pf_ten00042` |

`pf_platform` and `pf_auth` are reserved names. Subscriber databases are created automatically at sign-up; never create them by hand.

## 4. Environment

Copy `.env.example` to `.env` on the server and fill it in. Production differences:

| Variable | Production value |
|---|---|
| `APP_ENV` | `production` |
| `ROOT_DOMAIN`, `NEXT_PUBLIC_ROOT_DOMAIN` | `propflowapp.com` |
| `COOKIE_DOMAIN` | `.propflowapp.com` |
| `DB_USER` / `DB_PASSWORD` | the `pf_app` user |
| `DB_PROVISION_USER` / `DB_PROVISION_PASSWORD` | the `pf_provision` user |
| `DB_SSL` | `true` if MySQL is on another machine |
| `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` | new values, never the development ones |
| `STORAGE_DRIVER` | `s3`, with the `S3_*` values filled in |

Generate each secret with:

```bash
openssl rand -base64 32
```

Keep `.env` out of git and readable only by the app's system user (`chmod 600 .env`). **Changing `ENCRYPTION_KEY` later makes stored encrypted values unreadable**, so back it up somewhere safe.

## 5. Email (Resend)

1. Add the sending domain in Resend and add its DNS records: SPF (TXT), DKIM (CNAME/TXT), and a DMARC record such as `v=DMARC1; p=quarantine; rua=mailto:dmarc@propflowapp.com`.
2. Wait until Resend shows the domain as verified.
3. Set `MAIL_FROM` to an address on that domain, e.g. `PropFlow <no-reply@propflowapp.com>`.
4. Optional: add a webhook in Resend pointing to `https://propflowapp.com/api/webhooks/resend` and put its signing secret in `RESEND_WEBHOOK_SECRET` **(planned)**.

### Sign in with Google (optional)

1. Google Cloud Console → APIs & Services → **OAuth consent screen**: app name PropFlow, support email, logo, and the domain `propflowapp.com` as an authorised domain. Scopes: `openid`, `email`, `profile` only. Publish the app (move it out of "Testing") so anyone can sign in.
2. **Credentials → Create credentials → OAuth client ID**, type *Web application*:
   - Authorised JavaScript origin: `https://auth.propflowapp.com`
   - Authorised redirect URI: `https://auth.propflowapp.com/api/auth/google/callback`
3. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI=https://auth.propflowapp.com/api/auth/google/callback`.

For local development use a separate OAuth client. Google rejects `.test` addresses, so register `http://localhost:5190/api/auth/google/callback` as its redirect URI (no JavaScript origin needed) and keep that in the local `GOOGLE_REDIRECT_URI`; the app forwards the sign-in from localhost to `https://auth.propflowapp.test` to finish it.

Leaving the keys empty hides the Google button.

### Email templates

Emails are Liquid templates in `src/server/mail/templates/` (a shared layout, parts like the button and code box, and one file per email with its subject at the top). They're read from disk when an email is sent, so deploy that folder and `public/images/email/propflow-logo.png` with the app. Staff can preview every email, and send themselves a test, in the console under **Emails**.

## 6. First-time setup

```bash
yarn install --frozen-lockfile
yarn build
yarn db:create               # pf_platform and pf_auth, if missing (uses the provisioning user)
yarn db:migrate platform
yarn db:migrate auth
yarn db:seed platform        # app catalogue, plans, numbering, settings
yarn db:seed auth            # platform owner from PLATFORM_OWNER_* (console owner)
```

`yarn db:check` confirms both databases connect and shows their migrations. Seeders only add defaults; no sample or demo data is ever seeded. If `PLATFORM_OWNER_PASSWORD` is empty, the auth seeder prints a one-time password that must be changed at first sign-in. Sign in at `console.propflowapp.com` and change it.

Run the app with a process manager (e.g. PM2 or systemd) behind the proxy, on `NODE_ENV=production`.

## 7. New subscribers (planned)

Sign-up does this automatically in the background:

1. Creates the tenant in `pf_platform` (status `provisioning`) and the owner in `pf_auth`.
2. Creates `pf_<tenant code>`, runs the tenant migrations, then the default seeders (roles, lists & labels, numbering, chart of accounts, payroll, service and approval rules).
3. Marks the tenant `active`.

If a step fails, the tenant stays `provisioning`; retry from the console or with:

```bash
yarn tenant:provision --code TEN00042
```

## 8. Every deploy (planned)

```bash
git pull
yarn install --frozen-lockfile
yarn build
yarn db:migrate platform
yarn db:migrate auth
yarn tenant:migrate --all     # brings every subscriber database up to date
# then restart the app
```

Run migrations before restarting, so the new code never runs against old tables. `tenant:migrate --all` reports any tenant that failed without stopping the others.

## 9. Scheduled jobs (planned)

Call the job routes from cron with the `CRON_SECRET` header:

| When | Job |
|---|---|
| Every 15 minutes | Token expiries, reminders, provisioning retries |
| Daily 01:00 PKT | Installment reminders, document expiry alerts, recycle-bin purge |
| Monthly | Payroll draft for the new month |

## 10. Backups

- Nightly `mysqldump --single-transaction` of **each** database separately (`pf_platform`, `pf_auth`, every `pf_ten…`), so one subscriber can be restored without touching the others.
- Keep 7 daily, 4 weekly and 12 monthly copies off the server (a separate bucket).
- Back up the file storage bucket and the `.env` (secrets) separately and securely.
- Test a restore every quarter.

- Back up the `storage/` folder (or the S3 bucket) as well: payment proofs and workspace logos live there, not in MySQL.

## 11. Security checklist

- [ ] App connects as `pf_app`, never `root`
- [ ] MySQL not reachable from the internet (firewall), or only over SSL from the app server
- [ ] HTTPS everywhere; HTTP redirects to HTTPS
- [ ] Production secrets are new and stored only on the server
- [ ] `.env` permissions `600`, not in git
- [ ] Resend domain verified with SPF, DKIM and DMARC
- [ ] Backups running and a restore tested
- [ ] Server and Node.js updates applied regularly
