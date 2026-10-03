import "server-only"
import fs from "node:fs"
import path from "node:path"
import { Liquid } from "liquidjs"

// Email templates are Liquid files in ./templates (one per email, plus layouts/ and partials/).
// Each starts with a small header for the subject and inbox preview line, which can use data too:
//   ---
//   subject: "{{ code }} is your PropFlow reset code"
//   preheader: "It works for {{ minutes }} minutes."
//   ---
// Everything printed with {{ }} is HTML-escaped; `| raw` opts out for trusted markup.

export const TEMPLATE_DIR = path.join(process.cwd(), "src/server/mail/templates")
export const LOGO_CID = "propflow-logo"

// The look, in one place: templates use {{ style.p }}, {{ color.brand }} …
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const color = { ink: "#111827", body: "#1f2937", muted: "#6b7280", brand: "#1528A0" }
const style = {
  h1: `font:700 28px/1.25 ${FONT};color:${color.ink};letter-spacing:-0.3px;`,
  p: `font:400 16px/1.6 ${FONT};color:${color.body};`,
  small: `font:400 14px/1.5 ${FONT};color:${color.muted};`,
  label: `font:700 16px/1.4 ${FONT};color:${color.ink};`,
  eyebrow: `font:700 12px/1.4 ${FONT};color:${color.muted};letter-spacing:0.8px;text-transform:uppercase;`,
  item: `font:400 15px/24px ${FONT};color:${color.body};`,
  dot: `width:24px;height:24px;border-radius:12px;text-align:center;font:700 12px/24px ${FONT};`,
  code: `font:700 44px/1 ${FONT};color:${color.ink};letter-spacing:6px;`,
  button: `font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;`,
}

const engine = new Liquid({
  root: TEMPLATE_DIR,
  partials: path.join(TEMPLATE_DIR, "partials"),
  layouts: path.join(TEMPLATE_DIR, "layouts"),
  extname: ".liquid",
  outputEscape: "escape",
  strictFilters: true,
  // Re-read templates on every send in development, so edits show straight away
  cache: process.env.NODE_ENV === "production",
  globals: { style, color },
})

// "Ahmed Raza Khan" → "Ahmed"
engine.registerFilter(
  "first_name",
  (v) =>
    String(v ?? "")
      .trim()
      .split(/\s+/)[0] || v,
)
// A date shown in Pakistan time: "1 Oct 2026, 7:05 pm (Pakistan time)"
engine.registerFilter("pkt_time", (v) => {
  const d = v instanceof Date ? v : new Date(v ?? Date.now())
  if (Number.isNaN(d.getTime())) return ""
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(d)
  return `${text} (Pakistan time)`
})
// A date (no time) in Pakistan: "15 Oct 2026"
engine.registerFilter("pkt_date", (v) => {
  if (!v) return ""
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric" }).format(d)
})
// 14999 → "Rs 14,999"; 201828.4 → "Rs 201,828.40" (paisa always shown with two digits)
engine.registerFilter("rupees", (v) => {
  const n = Number(v) || 0
  const digits = Number.isInteger(n) ? 0 : 2
  return `Rs ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n)}`
})

// "---\nsubject: …\npreheader: …\n---\n<body>" → { meta, body }
function splitHeader(source) {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: {}, body: source }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1")
  }
  return { meta, body: source.slice(m[0].length) }
}

const unescapeHtml = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e])

// Plain-text copy of the HTML for mail apps that don't show HTML (and spam filters that like both)
function toText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<div data-preheader[\s\S]*?<\/div>/i, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const text = label.replace(/<[^>]+>/g, "").trim()
      return href.startsWith("mailto:") || text === href ? text : `${text}: ${href}`
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|div|tr|table)>/gi, "\n\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&(amp|lt|gt|quot|#39);/g, (m) => unescapeHtml(m))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Names of the emails (templates/*.liquid), for the console preview
export function templateNames() {
  return fs
    .readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith(".liquid"))
    .map((f) => f.slice(0, -".liquid".length))
    .sort()
}

// Render one email. logoSrc: "cid:…" when sending (the logo travels inside the email),
// a normal URL for the browser preview. Returns { subject, preheader, html, text }.
export async function renderEmail(name, data = {}, { logoSrc = `cid:${LOGO_CID}` } = {}) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Bad email template name "${name}".`)
  const source = await fs.promises.readFile(path.join(TEMPLATE_DIR, `${name}.liquid`), "utf8")
  const { meta, body } = splitHeader(source)
  const scope = { ...data, year: new Date().getFullYear(), logo_src: logoSrc }
  // Subject and preview are plain text, not HTML: undo the escaping
  const plain = (tpl) => (tpl ? engine.parseAndRender(tpl, scope).then(unescapeHtml) : "")
  const [subject, preheader] = await Promise.all([plain(meta.subject), plain(meta.preheader)])
  const html = await engine.parseAndRender(body, { ...scope, subject, preheader })
  return { subject: subject.trim(), preheader: preheader.trim(), html, text: toText(html) }
}
