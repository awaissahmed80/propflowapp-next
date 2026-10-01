// Colour helpers, safe on the server and in the browser

// "#ABC", "abc", "#aabbcc" → "#aabbcc"; anything else → null
export function normalizeHex(input) {
  const raw = String(input ?? "").trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${[...raw].map((c) => c + c).join("")}`
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`
  return null
}

// White or near-black text, whichever reads better on the colour (WCAG relative luminance)
export function readableOn(hex) {
  const c = normalizeHex(hex)
  if (!c) return "#ffffff"
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return l > 0.4 ? "#111827" : "#ffffff"
}

// Older pick-list colours were names; they map to these hex values
export const NAMED_COLORS = {
  gray: "#64748b",
  blue: "#3b82f6",
  sky: "#0ea5e9",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  teal: "#14b8a6",
}

// A colour name ("green") or hex → hex, or null
export const toHex = (color) => NAMED_COLORS[color] ?? normalizeHex(color)
