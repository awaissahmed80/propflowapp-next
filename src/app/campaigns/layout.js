export const metadata = { title: { default: "PropFlow", template: "%s" } }

// campaigns.<domain>: public landing pages (/<workspace>/<slug>) and lead forms
// (/f/<workspace>/<form>), no sign-in, always light (the workspace's own brand)
export default function CampaignsSiteLayout({ children }) {
  return <div className="min-h-svh bg-white text-slate-900">{children}</div>
}
