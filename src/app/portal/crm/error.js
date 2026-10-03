"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside CRM: keeps the app's sidebar
export default function CrmError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/crm", label: "Back to CRM" }} />
}
