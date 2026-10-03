"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Settings: keeps the app's sidebar
export default function SettingsError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/settings", label: "Back to Settings" }} />
}
