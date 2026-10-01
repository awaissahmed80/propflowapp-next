import { redirect } from "next/navigation"

// The CRM overview comes later; until then CRM opens on Leads
export default function CrmHome() {
  redirect("/crm/leads")
}
