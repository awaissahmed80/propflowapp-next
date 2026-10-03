"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Project Portfolio: keeps the app's sidebar
export default function EstateError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/project-portfolio", label: "Back to Project Portfolio" }} />
}
