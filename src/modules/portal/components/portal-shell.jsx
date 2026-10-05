"use client"

import Link from "next/link"
import { Logo } from "@/components/logo"
import { SpotlightSearchProvider } from "@/components/ui/spotlight-search"
import { HeaderActions } from "./header-actions"
import { UserMenu } from "./user-menu"
import { useAppSearch } from "./app-search"
import { ImpersonationBar } from "./impersonation-bar"
import { ScreenLockProvider } from "./screen-lock/lock-provider"

// Portal frame for the launcher and apps that don't have their own sidebar yet:
// top bar (logo, search, messages, notifications, account), ⌘K search over the apps and the
// screen lock (⌘⇧L)
export function PortalShell({ portal, children }) {
  const { user, role, tenant, apps, workspaces, canSetUp, impersonation } = portal
  const { search, searchRecords } = useAppSearch(portal)
  return (
    <SpotlightSearchProvider search={search} searchRecords={searchRecords} placeholder="Search…">
      {impersonation && <ImpersonationBar impersonation={impersonation} user={user} tenant={tenant} />}
      <ScreenLockProvider portal={portal}>
        <div className="min-h-svh bg-muted/40">
          <header data-print="hide" className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
            <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Link href="/" aria-label="All apps" className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Logo className="h-7" />
              </Link>
              <div className="ml-auto flex items-center gap-1">
                <HeaderActions />
                <div className="mx-1 h-6 w-px bg-border" />
                <UserMenu user={user} role={role} tenant={tenant} workspaces={workspaces} canSetUp={canSetUp} />
              </div>
            </div>
          </header>
          {children}
        </div>
      </ScreenLockProvider>
    </SpotlightSearchProvider>
  )
}
