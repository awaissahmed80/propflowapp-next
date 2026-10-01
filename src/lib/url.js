// URLs are always lowercase and never carry row ids: records appear by their code, lowercased
// (/workspaces/ten00001, /billing/invoices/inv-2026-00012). Pages match codes case-insensitively.
export const urlCode = (code) => encodeURIComponent(String(code ?? "").toLowerCase())
// From a URL segment back to the stored code (codes are stored uppercase)
export const fromUrlCode = (segment) => decodeURIComponent(String(segment ?? "")).toUpperCase()
