import { cache } from "react"
import { headers } from "next/headers"
import { Icon } from "@/components/ui/icon"
import { TenantMark } from "@/components/tenant-mark"
import { formatDate, formatSize } from "@/lib/format"
import { getWorkspaceBrand } from "@/server/tenants/brand"
import { logShareOpen, openShare } from "@/modules/documents/server/share"
import { SharePreview } from "@/modules/documents/components/share-preview"

export const dynamic = "force-dynamic"

const load = cache((workspace, token) => openShare(workspace, token))

export async function generateMetadata({ params }) {
  const { workspace, token } = await params
  const found = await load(workspace, token)
  return { title: found.state === "ok" ? `${found.asset.title} · ${found.tenant.name}` : "Shared document", robots: { index: false, follow: false }, referrer: "no-referrer" }
}

function Brand({ brand }) {
  return (
    <p className="flex items-center gap-2 font-bold">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="h-8 w-auto max-w-32 object-contain" />
      ) : (
        <TenantMark tenant={{ name: brand.name }} className="size-8 rounded-lg bg-slate-900 text-xs" />
      )}
      {brand.name}
    </p>
  )
}

// campaigns.<root>/d/<workspace>/<token>: a document shared from a workspace's Documents app,
// for anyone with the link (a bank, buyer, authority), until the link expires or is revoked.
// Every open is counted and logged (the address hashed).
export default async function SharedDocumentPage({ params }) {
  const { workspace, token } = await params
  const found = await load(workspace, token)
  const brand = found.tenant ? await getWorkspaceBrand(found.tenant) : null

  if (found.state !== "ok")
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
        {brand && <Brand brand={brand} />}
        <Icon name="link-unlink" className="text-4xl text-slate-400" />
        <div>
          <h1 className="text-xl font-semibold">{found.state === "expired" ? "This link has expired" : "This link doesn't work"}</h1>
          <p className="mt-1 max-w-sm text-sm text-slate-600">
            {found.state === "expired" ? `Ask ${brand?.name ?? "whoever sent it"} to share the document again.` : "Check that the whole address was copied, or ask for a new link."}
          </p>
        </div>
      </main>
    )

  await logShareOpen(found.db, found.link, await headers())
  const { asset, link } = found
  const fileUrl = `/api/public/share/${found.tenant.slug}/${token}`
  return (
    <main className="min-h-svh bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-4">
        <Brand brand={brand} />
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-white p-4 shadow-xs">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold break-words sm:text-xl">{asset.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Shared by {brand.name} · {formatSize(asset.size)} · link works until {formatDate(link.expiresAt)}
            </p>
          </div>
          <a href={`${fileUrl}?download=1`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800">
            <Icon name="download-2-line" /> Download
          </a>
        </div>
        <SharePreview url={fileUrl} mime={asset.mime} title={asset.title} />
        <p className="text-center text-xs text-slate-400">Shared privately with PropFlow. Please don&apos;t forward this link.</p>
      </div>
    </main>
  )
}
