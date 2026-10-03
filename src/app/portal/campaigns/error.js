"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Campaigns: keeps the app's sidebar
export default function CampaignsError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/campaigns", label: "Back to Campaigns" }} />
}
