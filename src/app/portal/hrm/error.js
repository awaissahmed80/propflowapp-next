"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside HR & Payroll: keeps the app's sidebar
export default function HrError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/hrm", label: "Back to HR & Payroll" }} />
}
