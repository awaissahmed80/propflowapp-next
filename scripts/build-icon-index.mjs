// Builds src/lib/remix-icons.json: every Remix icon (from node_modules/remixicon/icons/<Category>/)
// as { n: base name, c: category, s: styles available ("l" line, "f" fill) }, for IconPicker.
// Run again after upgrading remixicon:  node scripts/build-icon-index.mjs
import { readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve("node_modules/remixicon/icons")
const icons = new Map()
for (const category of readdirSync(root)) {
  for (const file of readdirSync(path.join(root, category))) {
    const name = file.replace(/\.svg$/, "")
    const m = /^(.*)-(line|fill)$/.exec(name)
    const base = m ? m[1] : name
    const style = m ? m[2][0] : ""
    const entry = icons.get(base) ?? { n: base, c: category, s: "" }
    if (style && !entry.s.includes(style)) entry.s += style
    icons.set(base, entry)
  }
}
const list = [...icons.values()].sort((a, b) => a.n.localeCompare(b.n))
writeFileSync("src/lib/remix-icons.json", JSON.stringify(list))
console.log(`${list.length} icons in ${new Set(list.map((i) => i.c)).size} categories`)
