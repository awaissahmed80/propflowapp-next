import fs from "node:fs/promises"
import path from "node:path"

// Files on this server's disk, under STORAGE_LOCAL_PATH (default ./storage), outside public/.
// Keys are checked by the caller (storage/index.js) before they reach here.
export function localDriver() {
  const root = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH || "./storage")
  const file = (key) => path.join(root, key)
  return {
    name: "local",
    async put(key, buffer) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true, mode: 0o750 })
      await fs.writeFile(file(key), buffer, { mode: 0o640, flag: "wx" })
    },
    get: (key) => fs.readFile(file(key)),
    remove: (key) => fs.rm(file(key), { force: true }),
  }
}
