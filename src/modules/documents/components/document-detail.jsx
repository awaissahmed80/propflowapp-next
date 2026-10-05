"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatDate, formatDateTime, formatSize, timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { useList } from "@/modules/lookups/context"
import { confirm } from "@/components/alert-context"
import { DetailRow } from "@/components/detail-row"
import { SectionCard } from "@/components/section-card"
import { FilePreviewDialog } from "@/components/assets/file-preview-dialog"
import { PdfViewer } from "@/components/assets/pdf-viewer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { ScrollView } from "@/components/ui/scroll-view"
import { restoreVersion, revokeShareLink } from "../server/actions"
import { DocIcon, ExpiryBadge, VersionTag, download, downloadName, fileKind, kindLabel } from "./doc-parts"
import { useDocumentActions } from "./document-dialogs"

// One company document: the file on the left, its details, versions and share links on the right.
//   doc / versions / links: getDocument() · projects · can: { create, edit, delete, expiry, share }

export function DocumentDetail({ doc, versions, links, projects, can }) {
  const router = useRouter()
  const types = useList("document-type")
  const type = types.map[doc.type]
  const actions = useDocumentActions({ can, projects, onDeleted: () => router.push(`/documents/type/${doc.type}`) })
  const menu = actions.menu(doc, { open: false })
  const more = menu.filter((i) => !["Download", "Share link"].includes(i.label))

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:h-[calc(100svh-3.5rem)] lg:p-8">
      <Link href={`/documents/type/${doc.type}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <Icon name="arrow-left-line" /> {type?.label ?? "Documents"}
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <DocIcon mime={doc.mime} className="size-11 text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="min-w-0 break-words">{doc.title}</span>
            <VersionTag version={doc.version} className="text-xs" />
            {can.expiry && <ExpiryBadge doc={doc} />}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{[type?.label, doc.project?.name, `${kindLabel(doc.mime)} · ${formatSize(doc.size)}`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can.share && doc.canShare && (
            <Button variant="outline" leftIcon="share-forward-line" onClick={() => actions.open("share", doc)}>
              Share
            </Button>
          )}
          <Button leftIcon="download-2-line" onClick={() => download(doc)}>
            Download
          </Button>
          {more.length > 0 && <DropdownMenu align="end" items={more} trigger={<IconButton variant="outline" icon="more-2-line" aria-label="More actions" />} />}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Preview doc={doc} />
        <ScrollView className="min-h-0 lg:-mr-3" viewportClassName="space-y-4 lg:pr-3">
          <SectionCard
            title="Details"
            action={
              can.edit && (
                <Button size="sm" variant="ghost" leftIcon="edit-line" onClick={() => actions.open("edit", doc)}>
                  Edit
                </Button>
              )
            }
          >
            <DetailRow icon={type?.icon || "folder-line"} label="Type">
              {type?.label ?? doc.type}
            </DetailRow>
            <DetailRow icon="community-line" label="Project">
              {doc.project?.name ?? <span className="text-muted-foreground">Not project-specific</span>}
            </DetailRow>
            {can.expiry && (
              <DetailRow icon="alarm-warning-line" label="Expires on">
                {doc.expiresOn ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {formatDate(doc.expiresOn)}
                    <ExpiryBadge doc={doc} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">No expiry date</span>
                )}
              </DetailRow>
            )}
            {doc.note && (
              <DetailRow icon="sticky-note-line" label="Note">
                {doc.note}
              </DetailRow>
            )}
            <DetailRow icon="file-line" label="File">
              <span className="break-all">{doc.fileName}</span>
            </DetailRow>
            <DetailRow icon="upload-2-line" label={doc.version > 1 ? `Version ${doc.version} added` : "Added"}>
              {formatDateTime(doc.addedAt)}
              {doc.uploader && <span className="text-muted-foreground"> by {doc.uploader.name}</span>}
            </DetailRow>
          </SectionCard>
          <Versions doc={doc} versions={versions} can={can} onNew={() => actions.open("version", doc)} />
          {(can.share || links.length > 0) && <ShareLinks doc={doc} links={links} can={can} onNew={() => actions.open("share", doc)} />}
        </ScrollView>
      </div>
      {actions.dialogs}
    </div>
  )
}

function Preview({ doc }) {
  const kind = fileKind(doc.mime)
  return (
    <div className="relative min-h-[60svh] overflow-hidden rounded-xl border bg-muted/60 lg:min-h-0">
      {kind === "pdf" && <PdfViewer key={doc.url} url={doc.url} className="absolute inset-0" />}
      {kind === "image" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- private workspace file, served by our own route */}
          <img src={doc.url} alt={doc.title} className="max-h-full max-w-full rounded object-contain shadow-sm" />
        </div>
      )}
      {!["pdf", "image"].includes(kind) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <DocIcon mime={doc.mime} className="size-16 text-4xl" />
          <p className="text-sm text-muted-foreground">There&apos;s no preview for {kindLabel(doc.mime)} files. Download it to open it.</p>
          <Button variant="outline" leftIcon="download-2-line" onClick={() => download(doc)}>
            Download {downloadName(doc)}
          </Button>
        </div>
      )}
    </div>
  )
}

function Versions({ doc, versions, can, onNew }) {
  const router = useRouter()
  const [open, setOpen] = useState(null)
  const [, startTransition] = useTransition()
  const restore = async (v) => {
    const ok = await confirm({
      title: `Restore version ${v.version}?`,
      description: `It becomes version ${doc.version + 1}, the current one. Version ${doc.version} stays in the history.`,
      confirmLabel: "Restore",
      icon: "history-line",
    })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => restoreVersion(v.code), { loading: "Restoring…", success: `Version ${v.version} restored.` })
      if (r?.ok) router.replace(`/documents/${r.code}`)
    })
  }
  return (
    <SectionCard
      title={`Versions (${versions.length})`}
      bodyClassName="p-2"
      action={
        can.edit && (
          <Button size="sm" variant="ghost" leftIcon="upload-2-line" onClick={onNew}>
            New version
          </Button>
        )
      }
    >
      <ul>
        {versions.map((v) => (
          <li key={v.code} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums", v.current ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
              v{v.version}
            </span>
            <button type="button" onClick={() => setOpen(v)} className="min-w-0 flex-1 cursor-pointer text-left">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="truncate">{v.fileName}</span>
                {v.current && <Badge color="green">Current</Badge>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{[formatDate(v.addedAt), v.uploader?.name, formatSize(v.size)].filter(Boolean).join(" · ")}</span>
            </button>
            {!v.current && can.edit && <IconButton icon="history-line" size="sm" aria-label={`Restore version ${v.version}`} onClick={() => restore(v)} />}
          </li>
        ))}
      </ul>
      {open && <FilePreviewDialog files={[{ url: open.url, name: `${open.fileName} (version ${open.version})`, mime: open.mime, size: open.size }]} onClose={() => setOpen(null)} />}
    </SectionCard>
  )
}

export const copyLink = (url) =>
  navigator.clipboard?.writeText(url).then(
    () => toast.success("Link copied."),
    () => toast.error("Couldn't copy. Select the link and copy it."),
  )

const STATE = { active: ["green", "Active"], expired: ["gray", "Expired"], revoked: ["red", "Revoked"] }

export function ShareLinks({ doc, links, can, onNew }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [opens, setOpens] = useState(null)
  const revoke = async (l) => {
    const ok = await confirm({ title: "Revoke this link?", description: "It stops working straight away for anyone who has it.", confirmLabel: "Revoke", destructive: true, icon: "link-unlink" })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => revokeShareLink(l.token), { loading: "Revoking…", success: "Link revoked." })
      if (r?.ok) router.refresh()
    })
  }
  return (
    <SectionCard
      title="Share links"
      bodyClassName="p-2"
      action={
        can.share &&
        doc.canShare && (
          <Button size="sm" variant="ghost" leftIcon="add-line" onClick={onNew}>
            New link
          </Button>
        )
      }
    >
      {!doc.canShare && <p className="px-2 py-1.5 text-xs text-muted-foreground">Documents of this type can&apos;t be shared outside the workspace.</p>}
      {links.length === 0 ? (
        doc.canShare && <p className="px-2 py-1.5 text-sm text-muted-foreground">Not shared. A link lets a bank, buyer or authority open it without an account, for up to 30 days.</p>
      ) : (
        <ul>
          {links.map((l, i) => (
            <li key={l.token ?? i} className="rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <Badge color={STATE[l.state][0]}>{STATE[l.state][1]}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm">{l.note || "No note"}</span>
                {l.url && l.state === "active" && <IconButton icon="file-copy-line" size="sm" aria-label="Copy link" onClick={() => copyLink(l.url)} />}
                {l.token && l.state === "active" && can.share && <IconButton icon="link-unlink" size="sm" aria-label="Revoke link" onClick={() => revoke(l)} />}
              </div>
              <button
                type="button"
                disabled={!l.views}
                onClick={() => setOpens(l)}
                className={cn("mt-0.5 block text-left text-xs text-muted-foreground", l.views && "cursor-pointer hover:text-foreground hover:underline")}
              >
                {[
                  l.state === "revoked" ? `Revoked ${formatDate(l.revokedAt)}` : `${l.state === "expired" ? "Expired" : "Expires"} ${formatDate(l.expiresAt)}`,
                  l.views ? `${l.views} ${l.views === 1 ? "open" : "opens"}, last ${timeAgo(l.lastViewedAt)}` : "Not opened yet",
                  l.by && `by ${l.by}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {opens && <OpensDialog link={opens} onClose={() => setOpens(null)} />}
    </SectionCard>
  )
}

export function OpensDialog({ link, onClose }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-md"
      title="Who opened this link"
      description={`${link.views} ${link.views === 1 ? "open" : "opens"}${link.note ? ` · ${link.note}` : ""}. Addresses are stored hashed, never in full.`}
    >
      <ul className="divide-y text-sm">
        {link.opens.map((o, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2">
            <span>{formatDateTime(o.at)}</span>
            <span className="text-muted-foreground">{o.device ?? "Unknown device"}</span>
          </li>
        ))}
      </ul>
      {link.views > link.opens.length && <p className="text-xs text-muted-foreground">The latest {link.opens.length} are shown.</p>}
    </Dialog>
  )
}
