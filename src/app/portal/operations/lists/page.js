import { redirect } from "next/navigation"

// Moved under Customize
export default async function Moved({ searchParams }) {
  const q = new URLSearchParams(await searchParams).toString()
  redirect(`/operations/customize/lists${q ? `?${q}` : ""}`)
}
