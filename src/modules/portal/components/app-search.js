"use client"

import { useCallback, useMemo } from "react"
import { appPath } from "@/modules/portal/app-paths"
import { lockFor } from "@/modules/portal/nav-access"
import { spotlightSearch } from "@/modules/portal/server/search-actions"
import { CAMPAIGNS_NAV } from "@/modules/campaigns/nav"
import { CONTACTS_NAV } from "@/modules/contacts/nav"
import { CRM_NAV } from "@/modules/crm/nav"
import { DASHBOARDS } from "@/modules/dashboards/nav"
import { DOCUMENTS_NAV } from "@/modules/documents/nav"
import { SERVICES_NAV } from "@/modules/estate/nav"
import { FINANCE_NAV } from "@/modules/finance/nav"
import { HR_NAV } from "@/modules/hr/nav"
import { SALES_NAV } from "@/modules/operations/nav"
import { ESTATE_NAV } from "@/modules/portfolio/nav"
import { SETTINGS_NAV } from "@/modules/settings/nav"
import { USERS_NAV } from "@/modules/users/nav"

// Spotlight (⌘K) search: the apps someone can open, the pages inside them (from each app's
// sidebar, minus what's locked for them), My Desk, and records from the server (searchRecords).
const NAVS = {
  portfolio: ESTATE_NAV,
  crm: CRM_NAV,
  campaigns: CAMPAIGNS_NAV,
  operations: SALES_NAV,
  estate: SERVICES_NAV,
  contacts: CONTACTS_NAV,
  documents: DOCUMENTS_NAV,
  finance: FINANCE_NAV,
  hr: HR_NAV,
  dashboards: [{ items: DASHBOARDS }],
  users: USERS_NAV,
  settings: SETTINGS_NAV,
}
const DESK = [
  { label: "My Desk", icon: "user-smile-line", to: "/", description: "To-dos, approvals and your recent work" },
  { label: "Approvals", icon: "checkbox-multiple-line", to: "/approvals", description: "Requests waiting for your sign-off" },
  { label: "Profile", icon: "user-settings-line", to: "/profile", description: "Your name, photo, password and screen lock" },
]
const PAGE_LIMIT = 8

const matches = (q, ...texts) => texts.some((t) => t?.toLowerCase().includes(q))

export function useAppSearch(portal) {
  const { apps, access, canSetUp } = portal

  // Every page this person can open, once per portal
  const pages = useMemo(() => {
    const list = DESK.map((p) => ({ ...p, app: "My Desk" }))
    for (const a of apps) {
      const nav = NAVS[a.code]
      if (!nav) continue
      const home = appPath(a.code)
      for (const g of nav)
        for (const item of g.items) {
          const it = lockFor(item, a.off ?? [], a.code, access, canSetUp)
          // An app's home page is the app result itself
          if (it.locked || it.soon || it.to === home) continue
          list.push({ ...it, app: a.name, group: g.label })
        }
    }
    return list
  }, [apps, access, canSetUp])

  // Instant results: apps, and pages once something is typed
  const search = useCallback(
    (query) => {
      const q = query.trim().toLowerCase()
      const foundApps = apps.filter((a) => !q || matches(q, a.name, a.description, a.category))
      const groups = foundApps.length ? [{ value: "Apps", items: foundApps.map((a) => ({ value: `app:${a.code}`, label: a.name, meta: a.description, icon: a.icon, href: appPath(a.code) })) }] : []
      if (!q) return groups
      // A page's own name first, then its description, then the app or section it's in
      const rank = (p) => (p.label.toLowerCase().startsWith(q) ? 0 : matches(q, p.label) ? 1 : matches(q, p.description) ? 2 : matches(q, p.app, p.group) ? 3 : 9)
      const foundPages = pages
        .map((p) => ({ p, r: rank(p) }))
        .filter((x) => x.r < 9)
        .sort((a, b) => a.r - b.r)
        .slice(0, PAGE_LIMIT)
        .map((x) => x.p)
      if (foundPages.length) groups.push({ value: "Pages", items: foundPages.map((p) => ({ value: `page:${p.to}`, label: p.label, meta: [p.app, p.description].filter(Boolean).join(" · "), icon: p.icon, href: p.to })) })
      return groups
    },
    [apps, pages],
  )

  // Records (leads, bookings, units…) from the server, only what this person may see
  const searchRecords = useCallback((query) => spotlightSearch(query), [])

  return { search, searchRecords }
}
