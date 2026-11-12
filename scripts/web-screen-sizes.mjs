// Smaller copies of the portal screenshots for the website (srcset in src/modules/web/site/crop.jsx):
// public/images/screens/<name>.webp (2880 wide) → <name>-640.webp, -1080.webp and -1600.webp.
// Light captures only (the website has one light theme). Run after `yarn screens`.
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const DIR = "public/images/screens"
export const WIDTHS = [640, 1080, 1600]
const skip = (f) => !f.endsWith(".webp") || f.includes("-dark") || f.startsWith("mobile-") || /-\d+\.webp$/.test(f)
for (const f of fs.readdirSync(DIR).filter((f) => !skip(f))) {
  const src = path.join(DIR, f)
  for (const w of WIDTHS) await sharp(src).resize({ width: w }).webp({ quality: 80 }).toFile(path.join(DIR, f.replace(".webp", `-${w}.webp`)))
}
console.log("done")
