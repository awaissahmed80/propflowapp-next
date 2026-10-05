import { redirect } from "next/navigation"

// Moved to Estate Management (resale and rentals are about units buyers own)
export default function Moved() {
  redirect("/estate-management/rentals")
}
