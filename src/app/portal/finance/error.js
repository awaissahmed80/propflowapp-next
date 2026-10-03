"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Finance: keeps the app's sidebar
export default function FinanceError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/finance", label: "Back to Finance" }} />
}
