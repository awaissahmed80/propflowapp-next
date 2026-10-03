import { redirect } from "next/navigation"

// CRM's settings moved into App Settings, with every other app's
export default function CrmSettingsPage() {
  redirect("/settings/apps?section=crm.pipeline")
}
