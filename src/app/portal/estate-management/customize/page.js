import { notFound, redirect } from "next/navigation"
import { customizeTabs } from "@/modules/settings/sections"

// The first tab this person may open
export default async function CustomizePage() {
  const [first] = await customizeTabs("estate")
  if (!first) notFound()
  redirect(first.to)
}
