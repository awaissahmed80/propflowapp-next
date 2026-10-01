export const metadata = { title: { default: "PropFlow", template: "%s · PropFlow" } }

// portal.<domain>: the workspace ERP. The launcher and each app bring their own frame:
// (home) has the top bar; apps like users/ have a sidebar. Every page also checks access itself,
// because layouts don't re-run on client navigation.
export default function PortalLayout({ children }) {
  return children
}
