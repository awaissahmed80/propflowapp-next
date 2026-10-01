// Every site (marketing, auth, portal, console, campaigns) is served by this one app,
// picked by hostname. In development Valet proxies https://*.propflowapp.test to port 5190:
//   valet proxy propflowapp "http://[::1]:5190" --secure  (dev server binds localhost)
const rootDomain = process.env.ROOT_DOMAIN || "propflowapp.test"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Production deploys build into .next-a / .next-b and switch over when ready (scripts/deploy-remote.sh)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Let the dev server answer the root domain and its subdomains
  allowedDevOrigins: [rootDomain, `*.${rootDomain}`],
  // Load these with Node's own require instead of bundling: Knex refers to every database
  // driver it supports, and mysql2 uses Node-only features
  serverExternalPackages: ["knex", "mysql2", "liquidjs", "@react-pdf/renderer"],
  experimental: {
    // Uploads through server actions (e.g. proof of payment, up to 10 MB plus form overhead)
    serverActions: { bodySizeLimit: "11mb" },
  },
}

export default nextConfig
