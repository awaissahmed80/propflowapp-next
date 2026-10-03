import { Logo } from "@/components/logo"

export const metadata = { title: "PropFlow Campaigns" }

// The bare campaigns address: nothing to show without a workspace and page
export default function CampaignsHome() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      <Logo variant="dark" className="h-8" />
      <p className="max-w-sm text-sm text-slate-500">Landing pages and enquiry forms for property projects, published with PropFlow.</p>
    </main>
  )
}
