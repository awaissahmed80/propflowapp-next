"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toastAction } from "@/lib/toast-action"
import { PageHeader } from "@/components/page-header"
import { Icon } from "@/components/ui/icon"
import { Switch } from "@/components/ui/switch"
import { saveCampaignSettings } from "../server/settings-actions"

// Campaigns › Customize › Settings: switches that apply to every public form and landing page
//   configured: the server has captcha keys (production needs them in the env)
export function CampaignSettingsView({ settings, canEdit, configured }) {
  const router = useRouter()
  const [captcha, setCaptcha] = useState(settings.captcha)
  const [pending, startTransition] = useTransition()
  const toggle = (on) => {
    setCaptcha(on)
    startTransition(async () => {
      const r = await toastAction(() => saveCampaignSettings({ captcha: on }), { loading: "Saving…", success: on ? "Captcha turned on for public forms." : "Captcha turned off." })
      if (r?.error) setCaptcha(!on)
      else router.refresh()
    })
  }
  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Lead forms" description="Applies to every lead form, embed and landing page in this workspace" />
      <section className="divide-y rounded-xl border bg-background shadow-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary">
            <Icon name="shield-check-line" />
          </span>
          <div className="min-w-0 flex-1 basis-72">
            <p className="font-medium">Captcha on public forms</p>
            <p className="text-sm text-muted-foreground">Stops bots and spam entries before they reach CRM. Real visitors usually pass without solving anything (Cloudflare Turnstile).</p>
            {!configured && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Captcha keys aren&apos;t set up on this server yet, so entries are accepted without the check.</p>}
          </div>
          <Switch aria-label="Captcha on public forms" checked={captcha} disabled={!canEdit || pending} onChange={toggle} />
        </div>
      </section>
    </div>
  )
}
