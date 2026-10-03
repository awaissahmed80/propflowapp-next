import { redirect } from "next/navigation"

// Moved under CRM › Customize
export default async function Moved({ searchParams }) {
  const q = new URLSearchParams(await searchParams).toString()
  redirect(`/crm/customize/assignment${q ? `?${q}` : ""}`)
}
