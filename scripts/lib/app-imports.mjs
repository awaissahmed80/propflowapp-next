// Lets scripts import the app's server modules: "@/x" resolves to src/x(.js), extensionless
// relative imports inside src get their .js, and "server-only" (a Next.js guard) is a no-op. Register it before importing app code:
//   import { register } from "node:module"
//   register("./lib/app-imports.mjs", import.meta.url)
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src")

const fileFor = (base) => [`${base}.js`, `${base}.mjs`, path.join(base, "index.js"), base].find((f) => existsSync(f) && path.extname(f))

export function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true }
  if (specifier.startsWith("@/")) {
    const file = fileFor(path.join(SRC, specifier.slice(2)))
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
  }
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith(pathToFileURL(SRC).href)) {
    const file = fileFor(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier))
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
  }
  return next(specifier, context)
}
