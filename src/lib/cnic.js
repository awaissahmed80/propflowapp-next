// CNIC helpers shared by the server and the browser: 35202-1234567-1
export const CNIC_PATTERN = /^\d{5}-\d{7}-\d$/

// Digits as typed → 35202-1234567-1 (partial input keeps its dashes as it grows)
export function formatCnic(value) {
  const d = String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 13)
  if (d.length <= 5) return d
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`
}

// Shown in full only to people with the contacts.cnic grant: 35202-•••••••-1
export const maskCnic = (cnic, canSee = false) => (!cnic ? null : canSee ? cnic : String(cnic).replace(/^(\d{5})-?\d{7}-?(\d)$/, "$1-•••••••-$2"))
export const isMaskedCnic = (v) => String(v ?? "").includes("•")
