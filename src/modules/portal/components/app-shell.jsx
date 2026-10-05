"use client"

import Link from "next/link"
import { useSitePath } from "@/hooks/use-site-path"
import { BrandIcon, Logo } from "@/components/logo"
import { TenantMark } from "@/components/tenant-mark"
import { Icon } from "@/components/ui/icon"
import { SpotlightSearchProvider } from "@/components/ui/spotlight-search"
import { Sidebar, SidebarInset, SidebarMenu, SidebarMenuItem, SidebarProvider, SidebarTrigger, isActivePath } from "@/components/ui/sidebar"
import { AppSwitcher } from "./app-switcher"
import { HeaderActions } from "./header-actions"
import { UserMenu } from "./user-menu"
import { useAppSearch } from "./app-search"
import { ImpersonationBar } from "./impersonation-bar"
import { ScreenLockProvider } from "./screen-lock/lock-provider"
import { lockFor } from "@/modules/portal/nav-access"

// Frame for an app with its own sidebar (Users & Teams, and each app as it's ported):
// collapsible sidebar with the app's pages and the account menu at the bottom, header with the
// app switcher, the current page, search, messages and notifications.
//   nav: [{ label?, items: [{ label, icon, to, end?, feature?, need? }] }]. Items the person can't
//   use stay in the sidebar, locked (grayed, with a lock and why on hover): see lockFor in
//   portal/nav-access.js for the feature / need rules.
export function AppShell({ portal, appCode, nav: allNav, defaultOpen = true, children }) {
  const { user, role, tenant, apps, workspaces, canSetUp } = portal
  const off = apps.find((a) => a.code === appCode)?.off ?? []
  const nav = allNav.map((g) => ({ ...g, items: g.items.map((i) => lockFor(i, off, appCode, portal.access, canSetUp)) }))
  const pathname = useSitePath()
  const { search, searchRecords } = useAppSearch(portal)
  const app = apps.find((a) => a.code === appCode)
  const page = nav
    .flatMap((g) => g.items)
    .filter((i) => isActivePath(pathname, i.to, i.end))
    .sort((a, b) => b.to.length - a.to.length)[0]

  return (
    <SpotlightSearchProvider search={search} searchRecords={searchRecords} placeholder="Search…">
      <ScreenLockProvider portal={portal}>
        <SidebarProvider defaultOpen={defaultOpen}>
          <Sidebar
            groups={nav}
            header={
              <div className="space-y-2">
                <Link
                  href="/"
                  aria-label="All apps"
                  className="flex h-10 items-center rounded-md px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                >
                  {/* Full logo, or just the mark on the collapsed rail */}
                  <span className="group-data-[collapsible=icon]:hidden">
                    <Logo className="h-8 max-w-none" />
                  </span>
                  <span className="hidden group-data-[collapsible=icon]:block">
                    <BrandIcon className="size-9" />
                  </span>
                </Link>
                {/* The workspace you're in: its mark, name and plan; just the mark on the collapsed rail */}
                <div
                  title={tenant.name}
                  className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-gradient-to-br from-sidebar-accent/80 to-sidebar-accent/20 p-2 shadow-xs group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-none group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none"
                >
                  <TenantMark tenant={tenant} className="size-8 rounded-lg text-xs shadow-sm ring-1 ring-black/5 group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:text-sm" />
                  <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-sm font-semibold">{tenant.name}</span>
                    <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <Icon name="vip-crown-2-line" className="text-xs" />
                      {tenant.trialDaysLeft != null ? `${tenant.plan} trial · ${tenant.trialDaysLeft}d left` : tenant.plan ? `${tenant.plan} plan` : "Workspace"}
                    </span>
                  </span>
                </div>
              </div>
            }
            footer={
              <SidebarMenu>
                <SidebarMenuItem>
                  <UserMenu user={user} role={role} tenant={tenant} workspaces={workspaces} canSetUp={canSetUp} placement="sidebar" />
                </SidebarMenuItem>
              </SidebarMenu>
            }
          />
          {portal.impersonation && <ImpersonationBar impersonation={portal.impersonation} user={user} tenant={tenant} />}
          <SidebarInset className="min-w-0 bg-muted/40">
            <header data-print="hide" className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-4">
              <SidebarTrigger />
              <div className="h-5 w-px bg-border" />
              <AppSwitcher apps={apps} current={app} />
              {page && (
                <div className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex">
                  <span aria-hidden>/</span>
                  <span className="truncate font-medium text-foreground">{page.label}</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-1">
                <HeaderActions />
              </div>
            </header>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </ScreenLockProvider>
    </SpotlightSearchProvider>
  )
}
