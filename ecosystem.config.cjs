// pm2 process for production: `pm2 startOrReload ecosystem.config.cjs --update-env`.
// Serves the build named in .next-current (see scripts/deploy-remote.sh), only on localhost:
// nginx in front handles HTTPS and the subdomains. Bind to "localhost", not 127.0.0.1: Next.js
// calls its own address localhost, and the subdomain rewrites (src/proxy.js) only stay inside
// the app when the two match. With 127.0.0.1 every page is proxied to itself and fails.
const fs = require("node:fs")
const path = require("node:path")

const distDir = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, ".next-current"), "utf8").trim() || ".next"
  } catch {
    return ".next"
  }
})()

// nginx proxies to this port (upstream propflow_app)
const PORT = 4045

module.exports = {
  apps: [
    {
      name: "propflow",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: `start -H localhost -p ${PORT}`,
      env: { NODE_ENV: "production", NEXT_DIST_DIR: distDir },
      max_memory_restart: "1G",
      time: true,
    },
  ],
}
