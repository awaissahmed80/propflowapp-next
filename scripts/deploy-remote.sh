#!/usr/bin/env bash
# Runs ON THE SERVER, from the app folder (called by .github/workflows/deploy.yml).
#
# The site stays up while this runs: each deploy builds into the other of two folders
# (.next-a / .next-b) and only switches pm2 over once the build and migrations succeed.
# .next-current names the live one. To roll back by hand:
#   echo .next-a > .next-current && pm2 startOrReload ecosystem.config.cjs --update-env
set -euo pipefail
cd "$(dirname "$0")/.."

# Non-interactive SSH doesn't load the login profile: find Node if it came from nvm
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
for cmd in node yarn pm2; do
  command -v "$cmd" >/dev/null || { echo "✗ $cmd is not installed on the server (see docs/deploy.md)"; exit 1; }
done
[ -f .env.production ] || { echo "✗ .env.production is missing"; exit 1; }

live=$(cat .next-current 2>/dev/null || echo "")
next=$([ "$live" = ".next-a" ] && echo ".next-b" || echo ".next-a")
echo "→ Node $(node -v), live build: ${live:-none}, building into $next"

echo "→ Installing packages"
# Dev packages too: Tailwind and the build tools are needed for next build
yarn install --frozen-lockfile --production=false --non-interactive

echo "→ Building"
rm -rf "$next"
NODE_ENV=production NEXT_DIST_DIR="$next" yarn build

# Migrations, then seeders. Every seeder only adds what's missing (new apps, plans, settings,
# roles, lists…) and never changes or removes existing rows, so live data is left alone.
# tenant:migrate runs both for every workspace database.
echo "→ Migrating and seeding databases"
NODE_ENV=production yarn -s db:create   # only creates pf_platform / pf_auth if missing
NODE_ENV=production yarn -s db:migrate platform
NODE_ENV=production yarn -s db:migrate auth
NODE_ENV=production yarn -s db:seed platform
NODE_ENV=production yarn -s db:seed auth
NODE_ENV=production yarn -s tenant:migrate

echo "→ Starting the app with pm2 (starts it on the first deploy, restarts it after that)"
echo "$next" > .next-current
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null   # remembered across reboots once `pm2 startup` has been run (docs/deploy.md)
pm2 list

# The website answers on its own domain (the app picks the site from the Host header)
port=$(grep -oE 'const PORT = [0-9]+' ecosystem.config.cjs | grep -oE '[0-9]+$' || echo 4045)
root=$(grep -E '^ROOT_DOMAIN=' .env.production | cut -d= -f2- | tr -d '"' || true)
echo "→ Checking https://${root:-propflowapp.com} through the app"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null -H "Host: ${root:-propflowapp.com}" -H "X-Forwarded-Proto: https" http://localhost:${port}/; then
    echo "✓ Deployed ($next)"
    exit 0
  fi
  sleep 2
done

echo "✗ The new build didn't answer. Rolling back to ${live:-nothing}."
if [ -n "$live" ] && [ -d "$live" ]; then
  echo "$live" > .next-current
  pm2 startOrReload ecosystem.config.cjs --update-env
fi
pm2 logs propflow --lines 40 --nostream || true
exit 1
