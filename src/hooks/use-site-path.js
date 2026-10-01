"use client"

import { usePathname } from "next/navigation"

// The path as the visitor sees it: /workspaces, never the internal /console/workspaces
export function useSitePath() {
  const pathname = usePathname() ?? "/"
  return pathname.replace(/^\/(web|auth|portal|console|campaigns)(?=\/|$)/, "") || "/"
}
