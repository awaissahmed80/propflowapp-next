"use client"

import { ErrorPage } from "@/components/error-pages"

// Inside Contacts: keeps the app's sidebar
export default function ContactsError({ error, reset }) {
  return <ErrorPage error={error} reset={reset} full={false} home={{ href: "/contacts", label: "Back to Contacts" }} />
}
