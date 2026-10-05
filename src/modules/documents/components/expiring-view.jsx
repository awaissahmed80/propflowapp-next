"use client"

import Link from "next/link"
import { useList } from "@/modules/lookups/context"
import { PageHeader } from "@/components/page-header"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { ScrollView } from "@/components/ui/scroll-view"
import { DocIcon, ExpiryBadge, VersionTag } from "./doc-parts"
import { useDocumentActions } from "./document-dialogs"

// Documents › Expiring: expired, within 30 days and within 90 days. Renewing one is uploading the
// new copy as a new version (with its new expiry date).
//   groups: expiringDocuments() · title, description · projects · can

export function ExpiringView({ groups, title, description, projects, can }) {
  const types = useList("document-type")
  const actions = useDocumentActions({ can, projects })
  const sections = [
    { key: "expired", label: "Expired", docs: groups.expired },
    { key: "soon", label: "Within 30 days", docs: groups.soon },
    { key: "later", label: "Within 90 days", docs: groups.later },
  ].filter((s) => s.docs.length)

  return (
    <ScrollView className="h-[calc(100svh-3.5rem)]" viewportClassName="space-y-4 p-4 sm:p-6 lg:p-8">
      <PageHeader title={title} description={description} />
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon="close-circle-line" tone="red" label="Expired" value={groups.expired.length} hint="Renew and upload the new copy" />
        <StatTile icon="alarm-warning-line" tone="amber" label="Within 30 days" value={groups.soon.length} hint="Uploaders and admins are notified" />
        <StatTile icon="calendar-schedule-line" tone="sky" label="Within 90 days" value={groups.later.length} hint="Coming up" />
      </div>
      {!sections.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-background py-16 text-center">
          <Icon name="shield-check-line" className="text-3xl text-emerald-600" />
          <p className="font-medium">Nothing expires in the next 90 days</p>
          <p className="max-w-sm text-sm text-muted-foreground">Add an expiry date when uploading or editing a document, and it shows here as the date gets close.</p>
        </div>
      ) : (
        sections.map((s) => (
          <SectionCard key={s.key} title={`${s.label} (${s.docs.length})`} bodyClassName="p-2">
            <ul>
              {s.docs.map((d) => (
                <li key={d.code} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                  <DocIcon mime={d.mime} />
                  <Link href={`/documents/${d.code}`} className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{d.title}</span>
                      <VersionTag version={d.version} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{[types.label(d.type), d.project?.name, d.uploader?.name, d.note].filter(Boolean).join(" · ")}</span>
                  </Link>
                  <ExpiryBadge doc={d} />
                  <DropdownMenu align="end" items={actions.menu(d)} trigger={<IconButton icon="more-2-line" aria-label={`Actions for ${d.title}`} tooltip={false} />} />
                </li>
              ))}
            </ul>
          </SectionCard>
        ))
      )}
      <p className="text-xs text-muted-foreground">
        Renewed a NOC or license? Use <span className="font-medium">New version</span> to upload it with its new expiry date; the old copy stays in its history.{" "}
        <Link href="/documents" className="text-primary hover:underline">
          All documents
        </Link>
      </p>
      {actions.dialogs}
    </ScrollView>
  )
}
