// Demo workspace for marketing screenshots and sales demos (LOCAL DEVELOPMENT). The console builds
// the same workspace on any server: Console › Workspaces › Demo workspace.
//
//   yarn demo:seed            create the "Skyline Developers" workspace once (does nothing if it exists)
//   yarn demo:seed --reset    drop its database and demo users, then build it again
//   yarn demo:seed --check    counts, trial balance and a few app queries against the demo workspace
//   yarn demo:seed --hr-people | --hr-roster | --hr-payroll | --documents
//                             one part on its own, for the existing demo workspace
//
// Sign in at portal.propflowapp.test with the demo owner:
//   email     owner@skyline-demo.test
//   password  a3X6-2HWm-Hh2K   (local test value; every @skyline-demo.test team member uses it too)
//
// The workspace itself is built by src/server/tenants/demo-workspace/seed.js, from the sample data
// in src/server/tenants/demo-workspace/data.
import { registerHooks } from "node:module"
import nextEnv from "@next/env"
import { resolve as appResolve } from "./lib/app-imports.mjs"

// App code also reaches Next.js entry points ("next/navigation"): give them their file extension
const NEXT_ENTRIES = ["next/navigation", "next/headers", "next/cache", "next/server"]
registerHooks({
  resolve(specifier, context, next) {
    if (NEXT_ENTRIES.includes(specifier)) return next(`${specifier}.js`, context)
    return appResolve(specifier, context, next)
  },
})
if (process.env.NODE_ENV === "production") {
  console.error("demo:seed is for local development only. On a server, use Console › Workspaces › Demo workspace.")
  process.exit(1)
}
nextEnv.loadEnvConfig(process.cwd(), true)

const { closeAll } = await import("../src/server/db/connections.js")
const { cli } = await import("../src/server/tenants/demo-workspace/seed.js")

const args = process.argv.slice(2)
try {
  if (args.includes("--check")) await cli.check()
  else if (args.includes("--hr-people")) await cli.seedHrPeople()
  else if (args.includes("--hr-roster")) await cli.seedHrRoster()
  else if (args.includes("--hr-payroll")) await cli.seedHrPayroll()
  else if (args.includes("--documents")) await cli.seedDocuments()
  else await cli.run({ reset: args.includes("--reset") })
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await closeAll()
}
