// Product screenshots for the marketing site (LOCAL DEVELOPMENT ONLY).
//
//   yarn screens                 capture every screen in scripts/screens.config.json, light and dark
//   yarn screens lead campaign   only these screen ids
//
// Needs the dev server (portal at https://portal.<ROOT_DOMAIN>) and the demo workspace from
// `yarn demo:seed`. Instead of signing in, it opens a session for the demo owner directly in
// pf_auth.sessions, hands headless Chrome the cookie, and deletes the row again at the end.
// Each screen is captured at 1440×900 @2× into public/images/screens/<id>.webp and <id>-dark.webp,
// and the boxes of its callouts go to src/modules/web/screens.json (percentages of the image),
// which the site uses for highlighted areas and zoomed-in lenses.
import { registerHooks } from "node:module"
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import nextEnv from "@next/env"
import { resolve as appResolve } from "./lib/app-imports.mjs"

registerHooks({ resolve: appResolve })
if (process.env.NODE_ENV === "production") {
  console.error("screens is for local development only.")
  process.exit(1)
}
nextEnv.loadEnvConfig(process.cwd(), true)

const { platformDb, authDb, closeAll } = await import("../src/server/db/connections.js")
const { newToken, hashToken } = await import("../src/server/auth/secrets.js")
const { THEME_COOKIE, THEME_KEY } = await import("../src/lib/theme.js")

const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const PORT = 9334
const ROOT = process.env.ROOT_DOMAIN || "propflowapp.test"
const BASE = `${process.env.APP_PROTOCOL || "https"}://portal.${ROOT}`
const W = 1440
const H = 900
const OUT = "public/images/screens"
const MAP = "src/modules/web/screens.json"
const TENANT = "TEN00002"
const OWNER = "owner@skyline-demo.test"

// Screen: { id, path, wait?, before?: JS run on the page, scroll?: px, callouts: [...] }
// Callout: { id, find: text the element starts with, within?: CSS selector to climb to, index?,
//            to?: second element (the box covers both), toWithin?, toIndex?, pad? }
//       or { id, sel: CSS selector of the element }
//       or { id, rect: [x, y, w, h] } in CSS px of the 1440×900 viewport
const SCREENS = JSON.parse(readFileSync("scripts/screens.config.json", "utf8"))
const only = process.argv.slice(2)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- a session for the demo owner ----------

const tenant = await platformDb()("tenants").where({ code: TENANT }).whereNull("deletedAt").first("id", "name")
const owner = await authDb()("users").where({ email: OWNER }).whereNull("deletedAt").first("id")
if (!tenant || !owner) {
  console.error(`The demo workspace ${TENANT} isn't there. Run yarn demo:seed first.`)
  await closeAll()
  process.exit(1)
}
const token = newToken()
const [sessionId] = await authDb()("sessions").insert({
  tokenHash: hashToken(token),
  userId: owner.id,
  kind: "tenant",
  tenantId: tenant.id,
  userAgent: "capture-screens",
  lastSeenAt: new Date(),
  expiresAt: new Date(Date.now() + 2 * 3_600_000),
})

// ---------- headless Chrome over the DevTools protocol ----------

const profile = mkdtempSync(join(tmpdir(), "pf-shots-"))
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--ignore-certificate-errors",
  "about:blank",
])

async function cleanup() {
  await authDb()("sessions").where({ id: sessionId }).delete()
  await closeAll()
  chrome.kill()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}

async function json(path, method = "GET") {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json()
    } catch {
      await sleep(200)
    }
  }
  throw new Error("Chrome didn't start")
}

try {
  const target = await json("/json/new?about:blank", "PUT")
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener("open", r, { once: true }))
  let seq = 0
  const waiting = new Map()
  // Requests in flight, to wait for the network to go quiet
  const inflight = new Set()
  let lastNet = Date.now()
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg)
      waiting.delete(msg.id)
    } else if (msg.method === "Network.requestWillBeSent") {
      inflight.add(msg.params.requestId)
      lastNet = Date.now()
    } else if (msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") {
      inflight.delete(msg.params.requestId)
      lastNet = Date.now()
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      waiting.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value
  // Network quiet for 600ms (dev-server HMR sockets stay open, so a few long requests are ignored after 8s)
  async function settle(extra) {
    const start = Date.now()
    while (Date.now() - start < 15_000) {
      const quiet = Date.now() - lastNet > 600
      if (quiet && (inflight.size === 0 || Date.now() - start > 8000)) break
      await sleep(100)
    }
    await evaluate("document.fonts.ready.then(() => true)")
    await sleep(extra)
  }

  await send("Page.enable")
  await send("Network.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false })
  const cookie = (name, value) => send("Network.setCookie", { name, value, domain: `.${ROOT}`, path: "/", secure: true, sameSite: "Lax" })
  await cookie(process.env.SESSION_COOKIE_NAME || "pf_session", token)
  await cookie("sidebar_state", "true")
  // No Next.js dev indicator, toasts or cursor carets in the shots
  const css = `nextjs-portal, [data-nextjs-toast], [data-sonner-toaster] { display: none !important } * { caret-color: transparent !important }`
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(css)}; document.head.append(s) })`,
  })
  let themeScript = null

  const map = existsSync(MAP) ? JSON.parse(readFileSync(MAP, "utf8")) : {}
  let problems = 0

  for (const theme of ["light", "dark"]) {
    await cookie(THEME_COOKIE, `${theme}.${theme}`)
    if (themeScript) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: themeScript })
    themeScript = (await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem(${JSON.stringify(THEME_KEY)}, "${theme}") } catch {}` })).identifier

    for (const screen of SCREENS) {
      if (only.length && !only.includes(screen.id)) continue
      await send("Page.navigate", { url: BASE + screen.path })
      await settle(screen.wait ?? 1500)
      if (screen.before) {
        await evaluate(`(async () => { ${screen.before} })()`)
        await settle(800)
      }
      if (screen.scroll) {
        await evaluate(
          `(() => { const el = [...document.querySelectorAll("main, [data-slot=scroll-area-viewport], [data-slot=sidebar-inset]")].find((e) => e.scrollHeight > e.clientHeight + 10); (el ?? window).scrollTo(0, ${screen.scroll}); window.scrollTo(0, ${screen.scroll}) })()`,
        )
        await sleep(600)
      }
      const where = await evaluate("location.href")
      const callouts = await evaluate(`(() => {
        const find = (text, within, index = 0) => {
          const all = [...document.querySelectorAll("body *")].filter((el) => {
            if (el.children.length >= 60 || !el.textContent.trim().startsWith(text)) return false
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < ${H}
          })
          let el = all.sort((a, b) => a.textContent.length - b.textContent.length)[index]
          if (el && within) el = el.closest(within) ?? el
          return el?.getBoundingClientRect()
        }
        return ${JSON.stringify(screen.callouts ?? [])}.map((c) => {
          let r
          if (c.rect) r = { left: c.rect[0], top: c.rect[1], right: c.rect[0] + c.rect[2], bottom: c.rect[1] + c.rect[3] }
          else if (c.sel) {
            r = document.querySelector(c.sel)?.getBoundingClientRect()
            if (!r) return { id: c.id, missing: true }
          } else {
            const a = find(c.find, c.within, c.index)
            const b = c.to ? find(c.to, c.toWithin ?? c.within, c.toIndex) : a
            if (!a || !b) return { id: c.id, missing: true }
            r = { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }
          }
          const pad = c.pad ?? 8
          const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad)
          const w = Math.min(${W}, r.right + pad) - x, h = Math.min(${H}, r.bottom + pad) - y
          return { id: c.id, x: +(x / ${W} * 100).toFixed(2), y: +(y / ${H} * 100).toFixed(2), w: +(w / ${W} * 100).toFixed(2), h: +(h / ${H} * 100).toFixed(2) }
        })
      })()`)
      const shot = await send("Page.captureScreenshot", { format: "webp", quality: 88 })
      writeFileSync(`${OUT}/${screen.id}${theme === "dark" ? "-dark" : ""}.webp`, Buffer.from(shot.data, "base64"))
      // Both themes share one layout, so callouts come from the light pass
      if (theme === "light")
        map[screen.id] = {
          src: `/images/screens/${screen.id}.webp`,
          srcDark: `/images/screens/${screen.id}-dark.webp`,
          width: W * 2,
          height: H * 2,
          callouts,
        }
      const missing = callouts.filter((c) => c.missing).map((c) => c.id)
      const moved = !where.startsWith(BASE + screen.path.split("?")[0])
      if (missing.length || moved) problems++
      console.log(`${theme.padEnd(6)} ${screen.id.padEnd(20)} ${screen.path}${moved ? `  (ended up at ${where})` : ""}${missing.length ? `  (missing: ${missing.join(", ")})` : ""}`)
    }
  }

  // Drop screens no longer in the config
  for (const id of Object.keys(map)) if (!SCREENS.some((s) => s.id === id)) delete map[id]
  writeFileSync(MAP, JSON.stringify(map, null, 2) + "\n")
  ws.close()
  if (problems) process.exitCode = 1
} finally {
  await cleanup()
}
