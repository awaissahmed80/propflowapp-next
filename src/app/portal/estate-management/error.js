"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Estate Management: keeps the app's sidebar
export default function ServicesError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/estate-management", label: "Back to Estate Management" }} />
}
