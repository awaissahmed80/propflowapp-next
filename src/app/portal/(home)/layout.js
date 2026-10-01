import { getPortal } from "@/modules/portal/server/context"
import { PortalShell } from "@/modules/portal/components/portal-shell"

// The launcher, Get started and apps not yet ported: top bar without a sidebar
export default async function HomeLayout({ children }) {
  const portal = await getPortal()
  return <PortalShell portal={portal}>{children}</PortalShell>
}
