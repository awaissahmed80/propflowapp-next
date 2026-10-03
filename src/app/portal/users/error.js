"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Users & Teams: keeps the app's sidebar
export default function UsersError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/users", label: "Back to Users & Teams" }} />
}
