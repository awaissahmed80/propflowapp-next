import { ImageResponse } from "next/og"

// The picture shown when the website is shared (WhatsApp, Facebook, LinkedIn, X): 1200×630.
// Under /api so it's served the same on every host (see proxy.js).
export const dynamic = "force-static"

export function GET() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0270D2 0%, #024A8C 100%)", color: "white" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 40, fontWeight: 700 }}>
        <div style={{ display: "flex", width: 64, height: 64, borderRadius: 16, background: "white", color: "#0270D2", alignItems: "center", justifyContent: "center", fontSize: 40 }}>P</div>
        PropFlow
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>Real estate ERP made for Pakistan</div>
        <div style={{ fontSize: 30, opacity: 0.85, lineHeight: 1.35 }}>Inventory in Marla & Kanal, price lists, CRM, campaigns, bookings and collections.</div>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 24 }}>
        {["Developers", "Housing societies", "Agencies"].map((t) => (
          <div key={t} style={{ display: "flex", padding: "8px 20px", borderRadius: 999, background: "rgba(255,255,255,0.16)" }}>
            {t}
          </div>
        ))}
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=86400" } },
  )
}
