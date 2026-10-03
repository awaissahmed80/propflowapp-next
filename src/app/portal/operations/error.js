"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Sales: keeps the app's sidebar
export default function SalesError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/operations", label: "Back to Operations" }} />
}
