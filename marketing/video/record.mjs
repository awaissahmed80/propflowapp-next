// Records the intro videos (marketing/video/intro.html) with headless Chrome. LOCAL ONLY.
//
//   node marketing/video/record.mjs                 both: public/videos/propflow-intro.mp4 and propflow-story.mp4
//   node marketing/video/record.mjs story           just one
//   node marketing/video/record.mjs stills 3 9 20   JPEG stills of both formats at those seconds (to check)
//
// A tiny web server serves the project folder (fetch can't read file:// URLs), Chrome draws the
// animation on a canvas and MediaRecorder encodes it in real time (H.264 MP4 when Chrome can).
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const PORT = 9335
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const [mode = "both", ...rest] = process.argv.slice(2)

// Serve only what the page needs
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "")
  const ok = ["marketing/video/", "public/images/screens/", "public/logo.svg", "src/modules/web/screens.json"].some((p) => path.startsWith(p))
  const file = join(ROOT, path)
  if (!ok || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}/marketing/video/intro.html`

const profile = mkdtempSync(join(tmpdir(), "pf-video-"))
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--window-size=1920,1920",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "about:blank",
])

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
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg)
      waiting.delete(msg.id)
    } else if (msg.method === "Runtime.consoleAPICalled") console.log("  page:", msg.params.args.map((a) => a.value).join(" "))
    else if (msg.method === "Runtime.exceptionThrown") console.error("  page error:", msg.params.exceptionDetails.exception?.description)
  })
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = ++seq
      waiting.set(id, (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await send("Runtime.enable")
  await send("Page.enable")
  await send("Page.bringToFront")
  await send("Emulation.setFocusEmulationEnabled", { enabled: true })
  const open = async (format) => {
    await send("Page.navigate", { url: `${base}?format=${format}` })
    await sleep(800)
    return evaluate("window.ready")
  }

  mkdirSync(join(ROOT, "public/videos"), { recursive: true })
  if (mode === "stills") {
    const dir = join(tmpdir(), "pf-video-stills")
    mkdirSync(dir, { recursive: true })
    for (const format of ["landscape", "story"]) {
      await open(format)
      for (const t of rest.map(Number)) {
        const b64 = await evaluate(`window.still(${t})`)
        const file = join(dir, `${format}-${t}.jpg`)
        writeFileSync(file, Buffer.from(b64, "base64"))
        console.log(file)
      }
    }
  } else {
    for (const format of mode === "both" ? ["landscape", "story"] : [mode]) {
      const info = await open(format)
      console.log(`Recording ${format} (${info.width}×${info.height}, ${info.total.toFixed(1)} s)…`)
      const r = await evaluate("window.record()")
      if (!r?.base64) throw new Error("Nothing was recorded")
      const ext = r.mimeType.includes("mp4") ? "mp4" : "webm"
      const file = join(ROOT, "public/videos", `${format === "story" ? "propflow-story" : "propflow-intro"}.${ext}`)
      writeFileSync(file, Buffer.from(r.base64, "base64"))
      console.log(`  ${file} (${r.mimeType}, ${(Buffer.byteLength(r.base64, "base64") / 1e6).toFixed(1)} MB)`)
    }
  }
  ws.close()
} finally {
  chrome.kill()
  server.close()
  await sleep(300)
  rmSync(profile, { recursive: true, force: true })
}
