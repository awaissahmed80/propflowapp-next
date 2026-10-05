"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Dashboards: keeps the app's sidebar
export default function DashboardsError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/dashboards", label: "Back to Dashboards" }} />
}
