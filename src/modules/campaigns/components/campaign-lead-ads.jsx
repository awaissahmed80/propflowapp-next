"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { setMetaFormCampaign } from "../server/meta-actions"

// A campaign's "Lead ads" tab: the Facebook & Instagram lead forms feeding it. Every lead from a
// linked form is a lead of this campaign (its leads, cost per lead and reports). Link more forms
// from the Pages receiving leads, or unlink one.
//   meta: campaignMetaForms() · campaign: { code, name } · canEdit: Campaigns › edit

function FormLine({ f, action }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0866FF] text-lg text-white">
        <Icon name="meta-fill" />
      </span>
      <span className="min-w-0 flex-1 basis-56">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {f.name}
          {f.fbStatus && f.fbStatus !== "ACTIVE" && <Badge color="gray">{f.fbStatus.toLowerCase()} on Facebook</Badge>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {f.pageName} · {f.leads30} {f.leads30 === 1 ? "lead" : "leads"} in 30 days{f.lastLeadAt ? ` · last ${timeAgo(f.lastLeadAt)}` : ""}
        </span>
      </span>
      {action}
    </li>
  )
}

export function CampaignLeadAds({ meta, campaign, canEdit }) {
  const router = useRouter()
  const [picking, setPicking] = useState(false)
  const [pending, startTransition] = useTransition()
  const link = (f, to) =>
    startTransition(async () => {
      const r = await toastAction(() => setMetaFormCampaign(f.formId, to), {
        loading: to ? "Linking…" : "Unlinking…",
        success: to ? `“${f.name}” now brings its leads to this campaign.` : `“${f.name}” unlinked.`,
      })
      if (r?.ok) {
        setPicking(false)
        router.refresh()
      }
    })

  if (!meta.available)
    return (
      <SectionCard title="Facebook & Instagram lead ads">
        <p className="text-sm text-muted-foreground">Lead ads aren&apos;t available in this workspace right now. See Settings › Integrations.</p>
      </SectionCard>
    )
  if (!meta.connected)
    return (
      <SectionCard title="Facebook & Instagram lead ads">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#0866FF] text-2xl text-white">
            <Icon name="meta-fill" />
          </span>
          <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">Connect Facebook to bring this campaign&apos;s lead form ads straight into CRM, counted against its goals and cost per lead.</p>
          <Button nativeButton={false} render={<Link href="/campaigns/integrations" />} leftIcon="plug-line">
            Connect Facebook
          </Button>
        </div>
      </SectionCard>
    )

  return (
    <>
      <SectionCard
        title="Facebook & Instagram lead ads"
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" variant="outline" leftIcon="add-line" disabled={!meta.others.length} onClick={() => setPicking(true)}>
              Link a Facebook form
            </Button>
          )
        }
      >
        {meta.linked.length ? (
          <ul className="divide-y">
            {meta.linked.map((f) => (
              <FormLine
                key={f.formId}
                f={f}
                action={
                  canEdit && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => link(f, null)}>
                      Unlink
                    </Button>
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {meta.others.length
              ? "No Facebook form brings leads to this campaign yet. Link the lead form your ads use."
              : "No lead forms on the Facebook Pages receiving leads. Switch a Page on in Integrations, or make a lead form in Meta Ads Manager."}
          </p>
        )}
        <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          Leads from linked forms count as this campaign&apos;s leads. Owner, project and question settings are in{" "}
          <Link href="/campaigns/integrations" className="text-primary hover:underline">
            Integrations
          </Link>
          .
        </p>
      </SectionCard>

      {picking && (
        <Dialog
          open
          onOpenChange={(o) => !o && !pending && setPicking(false)}
          title="Link a Facebook form"
          description={`Its leads will count as ${campaign.name} leads from now on.`}
          scrollable
          className="sm:max-w-lg"
          bodyClassName="p-0"
        >
          <ul className="divide-y rounded-lg border">
            {meta.others.map((f) => (
              <FormLine
                key={f.formId}
                f={f}
                action={
                  <span className="flex items-center gap-2">
                    {f.campaignName && <span className="text-xs text-amber-700 dark:text-amber-400">Moves from {f.campaignName}</span>}
                    <Button size="sm" disabled={pending} onClick={() => link(f, campaign.code)}>
                      Link
                    </Button>
                  </span>
                }
              />
            ))}
          </ul>
        </Dialog>
      )}
    </>
  )
}
