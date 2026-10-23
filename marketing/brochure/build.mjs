// PropFlow two-page brochure (A4 PDF) from the product screenshots. LOCAL ONLY.
//
//   node marketing/brochure/build.mjs   → marketing/brochure/PropFlow-Brochure.pdf (+ brochure.html)
//
// Screens and their callout boxes come from `yarn screens` (public/images/screens,
// src/modules/web/screens.json); fonts and icons from the project. Chrome prints the page.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")
const OUT = join(ROOT, "marketing/brochure")
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const SCREENS = JSON.parse(readFileSync(join(ROOT, "src/modules/web/screens.json"), "utf8"))
const LOGO = readFileSync(join(ROOT, "public/logo.svg"), "utf8")
const logo = (color) => LOGO.replace(/fill="#0049B5"/gi, `fill="${color}"`).replace("<svg", '<svg class="logo-svg"')
const img = (id) => `../../public/images/screens/${id}.webp`

// A part of a screenshot (around a callout, with some room) filling a box of the given aspect
function crop(id, callout, { aspect, zoom = 1.25 }) {
  const s = SCREENS[id]
  const c = s.callouts.find((k) => k.id === callout && !k.missing) ?? { x: 20, y: 20, w: 60, h: 40 }
  const ratio = s.width / s.height // image aspect (1440 / 900)
  // Region in % of the image: around the callout, then widened to the box's aspect
  let rw = Math.min(100, c.w * zoom)
  let rh = Math.min(100, c.h * zoom)
  if ((rw * ratio) / rh < aspect) rw = Math.min(100, (rh * aspect) / ratio)
  else rh = Math.min(100, (rw * ratio) / aspect)
  if ((rw * ratio) / rh > aspect + 0.01) rw = (rh * aspect) / ratio
  const cx = c.x + c.w / 2
  const cy = c.y + c.h / 2
  const x = Math.max(0, Math.min(100 - rw, cx - rw / 2))
  const y = Math.max(0, Math.min(100 - rh, cy - rh / 2))
  const pos = (v, size) => (size >= 100 ? 0 : (v / (100 - size)) * 100)
  return `background-image:url(${img(id)});background-size:${(10000 / rw).toFixed(2)}% ${(10000 / rh).toFixed(2)}%;background-position:${pos(x, rw).toFixed(2)}% ${pos(y, rh).toFixed(2)}%`
}

const PAINS = [
  ["file-copy-2-line", "The same plot sold twice", "One live inventory. Token holds expire on their own, and dealers only see their quota."],
  ["timer-flash-line", "Leads going cold", "Every lead gets an agent and a first call planned within minutes, with overdue alerts."],
  ["question-line", "No idea what a booking cost", "Spend, leads, site visits and bookings for every campaign and channel, in Rupees."],
  ["bank-card-2-line", "Installments chased from a register", "Every buyer's schedule, SMS reminders and a cheque register: cleared or bounced."],
  ["arrow-left-right-line", "Transfers and NDCs that take weeks", "A checklist for every transfer, NDC and possession; dues checked, letter printed."],
  ["shake-hands-line", "Dealers selling stock you don't have", "Dealer quotas on live inventory, their own login, commission worked out with tax."],
]
const FLOW = [
  ["megaphone-line", "Campaigns", "Ads, forms, pages"],
  ["user-star-line", "CRM", "Leads & site visits"],
  ["hand-coin-line", "Booking", "Token, KYC, allotment"],
  ["calendar-check-line", "Installments", "Receipts & cheques"],
  ["arrow-left-right-line", "Transfers & NDC", "After-sales"],
  ["key-2-line", "Possession", "Handover"],
]
const SHOTS = [
  ["crm-board", "card", "A pipeline your agents actually use", "Leads from Facebook, your website and walk-ins get an agent, a score and the next call, on a board everyone shares."],
  ["booking", "progress", "Every booking, from token to handover", "Payment plans with premiums, receipts and cheques, allotment letters and SMS reminders before each installment."],
  ["estate-request", "checklist:0.95", "Transfers and NDCs without the chasing", "Checklists with dues and fees checked automatically, biometric and papers ticked off, letters printed at the end."],
  ["campaign", "cpl", "Know what every booking cost", "Budget, leads, site visits and bookings for each campaign, so you spend where buyers actually come from."],
]
const ONLY = [
  ["Plots, files and units in Marla, Kanal and sq ft", "with your own marla size", "no", "partly"],
  ["Open files and balloting in one inventory", "files and plots side by side", "no", "partly"],
  ["Token holds that expire on their own", "no plot sold twice", "no", "no"],
  ["Price lists with premiums, in Lac and Crore", "corner, park-facing, boulevard", "no", "partly"],
  ["Installment plans, cheque clearing, SMS reminders", "overdue alerts by themselves", "no", "partly"],
  ["Transfers, NDC and possession letters", "checklists, fees, printed letters", "no", "no"],
  ["LDA, CDA, RDA and DHA approvals on record", "NOC numbers per project", "no", "partly"],
  ["Accounts posted automatically", "bookings, receipts, refunds, commissions", "no", "no"],
]
const APPS = [
  ["community-line", "#f97316", "Project Portfolio"],
  ["megaphone-line", "#f43f5e", "Campaigns"],
  ["user-star-line", "#0ea5e9", "CRM"],
  ["flow-chart", "#2563eb", "Operations"],
  ["home-gear-line", "#0d9488", "Estate Management"],
  ["bank-line", "#059669", "Finance"],
  ["team-line", "#7c3aed", "HR & Payroll"],
  ["dashboard-3-line", "#6366f1", "Dashboards"],
  ["contacts-book-2-line", "#0284c7", "Contacts"],
  ["folder-5-line", "#eab308", "Documents"],
  ["shield-user-line", "#0891b2", "Users & Teams"],
  ["settings-3-line", "#64748b", "Settings"],
]
const TRUST = [
  ["database-2-line", "Your own database", "Never mixed with another company's"],
  ["shield-keyhole-line", "Roles & approvals", "Who can view, edit, approve, export"],
  ["history-line", "Activity log", "Who did what, and when"],
  ["computer-line", "Web, Mac & Windows", "Desktop app included"],
]
const mark = (v) => (v === "yes" ? '<i class="ri-checkbox-circle-fill yes"></i>' : v === "partly" ? '<span class="partly">Partly</span>' : '<i class="ri-close-circle-line no"></i>')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PropFlow · The real estate CRM & ERP, built for Pakistan</title>
<link rel="stylesheet" href="../../node_modules/remixicon/fonts/remixicon.css" />
<style>
@font-face { font-family: Inter; src: url(../video/font-a.woff2) format("woff2"); font-weight: 100 900; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; background: #e5e7eb; }
body { font-family: Inter, system-ui, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.45; }
.page { width: 794px; height: 1123px; margin: 0 auto; background: #fff; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
@media screen { .page { margin: 24px auto; box-shadow: 0 10px 40px rgba(0,0,0,.15); } }
.navy { background: radial-gradient(circle at 15% 10%, rgba(2,112,210,.55), transparent 45%), radial-gradient(circle at 90% 30%, rgba(56,189,248,.25), transparent 40%), linear-gradient(160deg, #05153a 0%, #0a2257 100%); color: #fff; }
.grid-bg { background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 32px 32px; position: absolute; inset: 0; }
.logo-svg { width: 100%; height: 100%; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 20px; letter-spacing: -.01em; }
.brand .mark { width: 34px; height: 34px; }
.pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(125,211,252,.45); background: rgba(56,189,248,.12); color: #7dd3fc; border-radius: 999px; padding: 4px 11px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
h1 { font-size: 38px; line-height: 1.08; letter-spacing: -.025em; margin: 0; font-weight: 800; }
h1 em { font-style: normal; color: #38bdf8; }
h2 { font-size: 21px; line-height: 1.15; letter-spacing: -.02em; margin: 0; font-weight: 800; }
.eyebrow { color: #0270d2; font-weight: 700; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
.muted { color: #64748b; }
.frame { border-radius: 12px; overflow: hidden; background: #fff; border: 1px solid rgba(148,163,184,.35); }
.frame .bar { height: 18px; background: #eef1f5; display: flex; align-items: center; gap: 5px; padding-left: 9px; }
.frame .bar span { width: 7px; height: 7px; border-radius: 50%; }
.frame img { display: block; width: 100%; }
.lens { position: absolute; background: #fff; border-radius: 12px; padding: 5px; border: 2px solid #38bdf8; }
.lens .crop { border-radius: 8px; background-repeat: no-repeat; }
.lens .cap { display: flex; gap: 6px; align-items: center; padding: 6px 4px 2px; font-size: 9.5px; font-weight: 600; color: #0f172a; }
.lens .cap b { flex: none; width: 15px; height: 15px; border-radius: 50%; background: #0270d2; color: #fff; display: grid; place-items: center; font-size: 8.5px; }
.icon { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-size: 15px; flex: none; }
.yes { color: #059669; font-size: 14px; } .no { color: #cbd5e1; font-size: 14px; } .partly { color: #b45309; background: #fef3c7; border-radius: 999px; padding: 1px 7px; font-size: 8.5px; font-weight: 700; }
.foot { position: absolute; left: 44px; right: 44px; bottom: 22px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
</style>
</head>
<body>

<!-- ================= PAGE 1 ================= -->
<section class="page">
  <div class="navy" style="position:absolute;inset:0 0 auto 0;height:560px">
    <div class="grid-bg"></div>
  </div>
  <div style="position:relative;padding:36px 44px 0">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="brand" style="color:#fff"><span class="mark">${logo("#ffffff")}</span>PropFlow</div>
      <span class="pill"><i class="ri-map-pin-2-line"></i> Made for Pakistan</span>
    </div>
    <div style="margin-top:34px;max-width:640px">
      <span class="pill">Real estate CRM &amp; ERP</span>
      <h1 style="margin-top:12px;color:#fff">Run your projects from first enquiry to <em>possession</em>, in one place.</h1>
      <p style="margin:12px 0 0;font-size:12.5px;line-height:1.55;color:rgba(255,255,255,.78);max-width:600px">
        Marla and Kanal inventory with open files and balloting, a sales pipeline your agents actually use, installment plans and cheques,
        transfers and NDCs, dealer quotas and campaigns that show what each booking cost. All in Lac and Crore.
      </p>
    </div>
    <div style="display:flex;flex-wrap:nowrap;gap:5px;margin-top:14px">
      ${[["community-line", "Housing societies"], ["building-2-line", "High-rise apartments"], ["store-2-line", "Commercial plazas"], ["home-8-line", "Farmhouse schemes"], ["hammer-line", "Builders"], ["shake-hands-line", "Agencies & dealers"]]
        .map(([i, t]) => `<span style="display:inline-flex;gap:5px;align-items:center;padding:3px 7px;border-radius:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#e2e8f0;font-size:8.6px;font-weight:600;white-space:nowrap"><i class="ri-${i}" style="color:#7dd3fc"></i>${t}</span>`)
        .join("")}
    </div>
  </div>

  <!-- Hero screenshot with two lenses -->
  <div style="position:absolute;left:84px;right:84px;top:338px">
    <div class="frame"><div class="bar"><span style="background:#ff5f57"></span><span style="background:#febc2e"></span><span style="background:#28c840"></span></div><img src="${img("portfolio-overview")}" /></div>
  </div>
  <div class="lens" style="left:22px;top:470px;width:250px"><div class="crop" style="height:92px;${crop("portfolio-overview", "stock", { aspect: 236 / 92, zoom: 1.1 })}"></div><div class="cap"><b>1</b>Available stock, valued in Crore</div></div>
  <div class="lens" style="right:22px;top:600px;width:240px"><div class="crop" style="height:86px;${crop("project", "approval", { aspect: 226 / 86, zoom: 1.05 })}"></div><div class="cap"><b>2</b>LDA approval or NOC on every project</div></div>

  <!-- Pains → fixes -->
  <div style="position:absolute;left:44px;right:44px;top:772px">
    <div class="eyebrow">Built for how Pakistan sells property</div>
    <h2>Registers, Excel sheets and group chats can only take you so far</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
      ${PAINS.map(
        ([i, t, a]) => `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:11px 12px;background:#f8fafc">
        <div style="display:flex;gap:8px;align-items:center"><span class="icon" style="background:#fee2e2;color:#dc2626"><i class="ri-${i}"></i></span><b style="font-size:11.5px;line-height:1.25">${t}</b></div>
        <div style="display:flex;gap:6px;margin-top:8px;color:#334155"><i class="ri-checkbox-circle-fill" style="color:#059669;font-size:13px;margin-top:-1px"></i><span>${a}</span></div></div>`,
      ).join("")}
    </div>
  </div>
  <div class="foot"><span>PropFlow · The real estate CRM &amp; ERP, built for Pakistan</span><span>propflowapp.com</span></div>
</section>

<!-- ================= PAGE 2 ================= -->
<section class="page">
  <div style="padding:36px 44px 0">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="brand"><span class="mark">${logo("#0049B5")}</span>PropFlow</div>
      <span class="muted" style="font-size:9.5px">One workspace · 12 apps · one login</span>
    </div>

    <div style="margin-top:18px" class="eyebrow">The whole journey</div>
    <h2>From first enquiry to possession, nothing falls between desks</h2>
    <div style="display:flex;align-items:stretch;gap:4px;margin-top:12px">
      ${FLOW.map(
        ([i, t, s], n) => `${n ? '<i class="ri-arrow-right-line" style="align-self:center;color:#94a3b8;font-size:13px"></i>' : ""}<div style="flex:1;border:1px solid ${n === FLOW.length - 1 ? "#6ee7b7" : "#dbeafe"};background:${n === FLOW.length - 1 ? "#ecfdf5" : "#eff6ff"};border-radius:10px;padding:8px 8px;text-align:center">
        <i class="ri-${i}" style="font-size:17px;color:${n === FLOW.length - 1 ? "#059669" : "#0270d2"}"></i>
        <div style="font-weight:700;font-size:10.5px;margin-top:2px">${t}</div><div class="muted" style="font-size:8.5px">${s}</div></div>`,
      ).join("")}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
      ${SHOTS.map(
        ([id, c, t, d]) => `<div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff">
        <div style="height:118px;background:#0a2257;padding:9px 9px 0;position:relative">
          <div style="height:109px;border-radius:9px 9px 0 0;background-repeat:no-repeat;${crop(id, c.split(":")[0], { aspect: 335 / 109, zoom: Number(c.split(":")[1] ?? 1.5) })}"></div>
        </div>
        <div style="padding:8px 12px 10px"><b style="font-size:11.5px">${t}</b><div class="muted" style="margin-top:2px;font-size:9.6px;line-height:1.4">${d}</div></div></div>`,
      ).join("")}
    </div>

    <div style="margin-top:14px" class="eyebrow">What only PropFlow does</div>
    <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:9.6px">
      <thead><tr style="text-align:left;color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.05em">
        <th style="padding:4px 8px;font-weight:600">Feature</th>
        <th style="padding:5px 8px;text-align:center;color:#0270d2;font-weight:800;background:#eff6ff;border-radius:8px 8px 0 0">PropFlow</th>
        <th style="padding:5px 8px;text-align:center;font-weight:600">General CRMs</th>
        <th style="padding:5px 8px;text-align:center;font-weight:600">Spreadsheets</th></tr></thead>
      <tbody>${ONLY.map(
        ([f, d, crm, sheet], n) => `<tr style="border-top:1px solid #eef2f7">
        <td style="padding:4px 8px;white-space:nowrap"><b style="font-weight:600">${f}</b> <span class="muted">· ${d}</span></td>
        <td style="text-align:center;background:#eff6ff;${n === ONLY.length - 1 ? "border-radius:0 0 8px 8px" : ""}">${mark("yes")}</td>
        <td style="text-align:center">${mark(crm)}</td><td style="text-align:center">${mark(sheet)}</td></tr>`,
      ).join("")}</tbody>
    </table>

    <div style="margin-top:12px" class="eyebrow">12 apps, one login</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-top:4px">
      ${APPS.map(([i, c, t]) => `<div style="display:flex;align-items:center;gap:6px;border:1px solid #e2e8f0;border-radius:9px;padding:5px 6px"><span class="icon" style="width:20px;height:20px;border-radius:6px;font-size:11px;background:${c};color:#fff"><i class="ri-${i}"></i></span><span style="font-size:8.6px;font-weight:600;line-height:1.15">${t}</span></div>`).join("")}
    </div>
  </div>

  <!-- CTA -->
  <div class="navy" style="position:absolute;left:0;right:0;bottom:0;height:150px;padding:22px 44px">
    <div class="grid-bg"></div>
    <div style="position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${TRUST.map(([i, t, s]) => `<div style="display:flex;gap:7px;align-items:flex-start"><i class="ri-${i}" style="color:#7dd3fc;font-size:15px"></i><div><div style="font-weight:700;font-size:10.5px">${t}</div><div style="font-size:9px;color:rgba(255,255,255,.65)">${s}</div></div></div>`).join("")}
    </div>
    <div style="position:relative;display:flex;justify-content:space-between;align-items:center;margin-top:20px">
      <div><div style="font-size:17px;font-weight:800">Pick only the apps you need.</div><div style="font-size:10.5px;color:rgba(255,255,255,.72)">Start with CRM, add Operations, Finance or HR when you're ready.</div></div>
      <div style="text-align:right"><span style="display:inline-block;background:#0270d2;color:#fff;font-weight:700;font-size:12px;padding:9px 18px;border-radius:999px">Book a free demo</span><div style="margin-top:6px;font-size:11px;color:#7dd3fc;font-weight:600">propflowapp.com</div></div>
    </div>
  </div>
</section>

</body>
</html>`

writeFileSync(join(OUT, "brochure.html"), html)
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", "--virtual-time-budget=4000", `--print-to-pdf=${join(OUT, "PropFlow-Brochure.pdf")}`, `file://${join(OUT, "brochure.html")}`], { stdio: "ignore" })
console.log(join(OUT, "PropFlow-Brochure.pdf"))
