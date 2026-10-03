"use client"

import { usePathname } from "next/navigation"

// The path as the visitor sees it: /workspaces, never the internal /console/workspaces
export function useSitePath() {
  const pathname = usePathname() ?? "/"
  // "campaigns" isn't stripped: it's also the portal's Campaigns app (/campaigns/all), and the public
  // campaigns site has no navigation that needs this
  return pathname.replace(/^\/(web|auth|portal|console)(?=\/|$)/, "") || "/"
}
