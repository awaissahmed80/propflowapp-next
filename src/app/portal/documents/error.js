"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Documents: keeps the app's sidebar
export default function DocumentsError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/documents", label: "Back to Documents" }} />
}
