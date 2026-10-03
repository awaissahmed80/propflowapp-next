"use client"

import { ErrorPage } from "@/components/error-pages"

export default function PortalError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} home={{ href: "/", label: "Back to apps" }} />
}
