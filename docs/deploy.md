# Deploying PropFlow

Every push to `main` deploys to production (Hostinger VPS) through `.github/workflows/deploy.yml`.
You can also run it by hand: GitHub → Actions → Deploy → Run workflow.

What a deploy does:

1. Lints the code on GitHub's runner. A lint error stops the deploy.
2. Copies the code to the server with rsync. `node_modules`, builds, `storage/` (uploads) and `.env*` are never touched.
3. Writes `.env.production` from the `ENV_PRODUCTION` secret.
4. On the server (`scripts/deploy-remote.sh`):
   - installs packages;
   - builds into the spare folder (`.next-a` / `.next-b`) while the site keeps running;
   - migrates and seeds the platform, auth and every workspace database. Seeders only add what's missing, such as new apps, settings, roles and lists. They never change or delete existing rows.
   - switches pm2 to the new build;
   - checks that the site answers, and rolls back by itself if it doesn't.

## GitHub settings

Settings → Environments → `production`:

| Name | Kind | Value |
|---|---|---|
| `ENV_PRODUCTION` | Secret | The whole `.env.production` file |
| `SSH_PRIVATE_KEY` | Secret | The private key GitHub logs in with (e.g. the contents of your `~/.ssh/id_rsa`) |
| `SSH_HOST` | Variable | Server IP |
| `SSH_USER` | Variable | The user the app runs as |
| `SSH_PORT` | Variable | `22` unless changed |
| `DEPLOY_PATH` | Variable | App folder, e.g. `/node-hosting/propflow` |

The matching public key (e.g. `id_rsa.pub`) must be in `~/.ssh/authorized_keys` of `SSH_USER` on the server.

## One-time server setup

Run these as `SSH_USER` on the server.

**Node, Yarn and pm2.** Next.js 16 needs Node 20.9 or newer; 24 LTS is recommended.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 24
npm install -g yarn pm2
```

**The app folder.** The marker file tells the workflow this folder is safe to sync into. The sync deletes files that aren't in the repo, so never put the marker in a folder shared with other sites.

```bash
sudo mkdir -p /node-hosting/propflow && sudo chown "$USER": /node-hosting/propflow
touch /node-hosting/propflow/.propflow-app
```

**Uploads.** With `STORAGE_DRIVER=local`, uploads go to `STORAGE_LOCAL_PATH`. Point it at a folder outside the app, e.g. `/node-hosting/propflow-storage`, so a deploy or a fresh copy of the app can never touch it. Create the folder and set the path in the `ENV_PRODUCTION` secret.

**First deploy.** Nothing extra: the deploy creates the central databases if they're missing (`yarn db:create`), then migrates and seeds them, including the platform owner from `PLATFORM_OWNER_*`. Workspace databases are created when a workspace is created.

**Start pm2 on boot.** Run this, then the `sudo …` line it prints:

```bash
pm2 startup
pm2 save
```

## nginx

nginx proxies to the app on port 4045 (`ecosystem.config.cjs`). The app binds to `localhost` on purpose; see the note in that file.

Check what `localhost` means on the server:

```bash
getent hosts localhost
```

If it shows `127.0.0.1` (usual on Ubuntu), use `server 127.0.0.1:4045;` in the `upstream` block. If it shows `::1`, use `server [::1]:4045;`.

nginx must pass `Host`, `X-Forwarded-Host` and `X-Forwarded-Proto`. The app picks the site from the hostname.

## Day to day

```bash
pm2 status              # is it running?
pm2 logs propflow       # live logs
cat .next-current       # which build is live
```

**Roll back to the previous build:**

```bash
cd /node-hosting/propflow
echo .next-a > .next-current    # the other one of .next-a / .next-b
pm2 startOrReload ecosystem.config.cjs --update-env
```

A rollback only switches the code. Database migrations stay applied.
