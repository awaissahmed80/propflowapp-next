"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatDate, timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu } from "@/components/ui/dropdown-menu"
import { IconButton } from "@/components/ui/icon-button"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { revokeShareLink } from "../server/actions"
import { DocIcon } from "./doc-parts"
import { OpensDialog, copyLink } from "./document-detail"

// Documents › Shared links: every link to a document outside the workspace, who made it, until
// when, and how often it was opened.
//   links: listShareLinks() · title, description · can: { share }

const STATE = { active: ["green", "Active"], expired: ["gray", "Expired"], revoked: ["red", "Revoked"] }

export function SharedView({ links, title, description, can }) {
  const router = useRouter()
  const [show, setShow] = useState("active")
  const [opens, setOpens] = useState(null)
  const [, startTransition] = useTransition()
  const shown = useMemo(() => (show === "all" ? links : links.filter((l) => l.state === "active")), [links, show])
  const revoke = async (l) => {
    const ok = await confirm({ title: "Revoke this link?", description: `${l.doc.title} stops opening straight away for anyone who has the link.`, confirmLabel: "Revoke", destructive: true, icon: "link-unlink" })
    if (!ok) return
    startTransition(async () => {
      const r = await toastAction(() => revokeShareLink(l.token), { loading: "Revoking…", success: "Link revoked." })
      if (r?.ok) router.refresh()
    })
  }
  const columns = [
    {
      key: "doc",
      header: "Document",
      sortValue: (l) => l.doc.title.toLowerCase(),
      cell: (l) => (
        <span className="flex min-w-0 items-center gap-3">
          <DocIcon mime={l.doc.mime} />
          <span className="min-w-0">
            {l.doc.removed ? (
              <span className="block truncate font-medium text-muted-foreground line-through">{l.doc.title}</span>
            ) : (
              <Link href={`/documents/${l.doc.code}`} className="block truncate font-medium hover:text-primary">
                {l.doc.title}
              </Link>
            )}
            <span className="block truncate text-xs text-muted-foreground">{l.note || "No note"}</span>
          </span>
        </span>
      ),
    },
    { key: "state", header: "Status", sortValue: (l) => l.state, cell: (l) => <Badge color={STATE[l.state][0]}>{STATE[l.state][1]}</Badge> },
    {
      key: "expires",
      header: "Expires",
      className: "whitespace-nowrap",
      sortValue: (l) => new Date(l.expiresAt).getTime(),
      cell: (l) => (l.state === "revoked" ? <span className="text-muted-foreground">Revoked {formatDate(l.revokedAt)}</span> : formatDate(l.expiresAt)),
    },
    {
      key: "views",
      header: "Opens",
      className: "text-right tabular-nums whitespace-nowrap",
      sortValue: (l) => l.views,
      cell: (l) =>
        l.views ? (
          <button type="button" onClick={() => setOpens(l)} className="cursor-pointer text-right hover:text-primary hover:underline">
            {l.views}
            <span className="block text-xs text-muted-foreground">last {timeAgo(l.lastViewedAt)}</span>
          </button>
        ) : (
          <span className="text-muted-foreground">0</span>
        ),
    },
    {
      key: "by",
      header: "Shared",
      className: "whitespace-nowrap",
      sortValue: (l) => new Date(l.createdAt).getTime(),
      cell: (l) => (
        <span>
          {formatDate(l.createdAt)}
          <span className="block text-xs text-muted-foreground">{l.by ?? ""}</span>
        </span>
      ),
    },
    {
      key: "menu",
      header: <span className="sr-only">Actions</span>,
      cell: (l) =>
        l.token &&
        can.share &&
        l.state === "active" && (
          <span className="flex justify-end">
            <DropdownMenu
              align="end"
              items={[{ label: "Copy link", icon: "file-copy-line", onClick: () => copyLink(l.url) }, { type: "separator" }, { label: "Revoke", icon: "link-unlink", variant: "destructive", onClick: () => revoke(l) }]}
              trigger={<IconButton icon="more-2-line" aria-label="Actions" tooltip={false} />}
            />
          </span>
        ),
    },
  ]
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title={title}
        description={description}
        toolbar={
          <ToggleGroup
            value={show}
            onChange={(v) => v && setShow(v)}
            options={[
              { value: "active", label: `Active (${links.filter((l) => l.state === "active").length})` },
              { value: "all", label: `All (${links.length})` },
            ]}
          />
        }
      />
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(l) => `${l.doc.code}-${l.createdAt}`}
          minWidth="52rem"
          defaultSort={{ key: "by", dir: "desc" }}
          empty={
            <p className="text-sm text-muted-foreground">
              {show === "active" && links.length ? "No active links. Expired and revoked ones are under All." : "Nothing shared yet. Open a document and choose Share to send it to a bank, buyer or authority."}
            </p>
          }
        />
      </div>
      {opens && <OpensDialog link={opens} onClose={() => setOpens(null)} />}
    </div>
  )
}
