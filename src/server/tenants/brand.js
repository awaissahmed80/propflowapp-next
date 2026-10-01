import "server-only"
import { readFile } from "@/server/storage"
import { readSettings } from "@/modules/portal/server/setup"

// What a workspace's own documents (reports, PDFs, prints) are headed with: its logo if one was
// uploaded (as a data URL, so it prints and goes into PDFs as is), and always the company's name
// and contact lines. Documents from PropFlow itself (console invoices) use the PropFlow logo.
export async function getWorkspaceBrand(tenant) {
  const s = await readSettings(tenant, ["company_name", "company_legal_name", "company_address", "company_city", "company_phone", "company_email", "company_ntn", "company_logo", "company_logo_type"])
  const logo = s.company_logo ? await readFile(s.company_logo).catch(() => null) : null
  return {
    name: s.company_name || tenant.name,
    legalName: s.company_legal_name || null,
    address: [s.company_address, s.company_city].filter(Boolean).join(", ") || null,
    phone: s.company_phone || null,
    email: s.company_email || null,
    ntn: s.company_ntn || null,
    logoUrl: logo ? `data:${s.company_logo_type || "image/png"};base64,${logo.toString("base64")}` : null,
  }
}
