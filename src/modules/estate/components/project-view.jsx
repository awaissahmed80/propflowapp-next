"use client"

import Link from "next/link"
import { useState } from "react"
import { formatDate, formatPkr } from "@/lib/format"
import { urlCode } from "@/lib/url"
import { useList } from "@/modules/lookups/context"
import { SectionCard } from "@/components/section-card"
import { StatTile } from "@/components/stat-tile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Tabs } from "@/components/ui/tabs"
import { formatArea, formatSize } from "../constants"
import { projectHref } from "../links"
import { ApprovalBadge, AvailabilityBar, AvailabilityLegend, ProjectMark, ProjectStatusBadge } from "./project-parts"
import { ProjectWizard } from "./project-wizard"
import { Lightbox } from "@/components/ui/lightbox"
import { ProjectDocuments, ProjectPhotos } from "./project-media"
import { ProjectProgress, ProjectTimeline } from "./project-progress"

const number = (n) => new Intl.NumberFormat("en-PK").format(n)

export function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center">
      <Icon name="community-line" className="text-4xl text-muted-foreground" />
      <h1 className="mt-3 text-xl font-semibold">Project not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been removed, or the link is wrong.</p>
      <Button className="mt-6" variant="outline" leftIcon="arrow-left-line" nativeButton={false} render={<Link href="/estate/projects" />}>
        Back to projects
      </Button>
    </div>
  )
}

function Info({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

function PhaseSection({ project, phase }) {
  const stages = useList("phase-stage")
  const categories = useList("block-category")
  const unitTypes = useList("unit-type")
  const unballoted = phase.stage === "unballoted"
  const plural = (t) => unitTypes.map[t]?.meta?.plural ?? unitTypes.label(t)
  return (
    <section className="rounded-xl border bg-background shadow-xs">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{phase.name}</h3>
            <ProjectStatusBadge status={phase.status} />
            {unballoted && <Badge color="violet">{stages.label("unballoted")}</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {phase.launchDate ? `Launched ${formatDate(phase.launchDate)}` : "Launch date not set"} · {phase.possessionDate ? `Possession ${formatDate(phase.possessionDate)}` : "Possession to be announced"}
          </p>
        </div>
        <div className="w-44 text-xs">
          <p className="mb-1 flex justify-between text-muted-foreground">
            <span>
              {number(phase.stats.counts.available)} available of {number(phase.stats.total)}
            </span>
            <span>{phase.stats.soldPct}%</span>
          </p>
          <AvailabilityBar stats={phase.stats} />
        </div>
      </header>
      <ul className="divide-y">
        {phase.blocks.map((b) => (
          <li key={b.id}>
            <Link href={`/estate/inventory?project=${urlCode(project.code)}&block=${encodeURIComponent(b.name)}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{b.name}</span>
                <span className="block text-xs text-muted-foreground">{[unballoted ? "File pool" : categories.label(b.category), b.unitTypes.map(plural).join(", ")].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="w-16 text-right text-sm tabular-nums">{number(b.stats.total)}</span>
              <AvailabilityBar stats={b.stats} className="w-32" />
              <span className="w-24 text-right text-xs text-emerald-600 tabular-nums dark:text-emerald-400">{number(b.stats.counts.available)} available</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// One project: numbers, phases and blocks, unit mix, and its details
export function ProjectView({ project, canEdit, canCreate }) {
  const [editing, setEditing] = useState(false)
  const [viewing, setViewing] = useState(null) // photo index in the lightbox
  const types = useList("project-type")
  const authorities = useList("authority")
  const unitTypes = useList("unit-type")
  const { stats } = project
  const blockCount = project.phases.reduce((n, p) => n + p.blocks.length, 0)

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-3">
        <Link href="/estate/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> Projects
        </Link>
        {project.coverUrl && (
          <button
            type="button"
            onClick={() =>
              setViewing(
                Math.max(
                  0,
                  project.images.findIndex((i) => i.isCover),
                ),
              )
            }
            aria-label={`View photos of ${project.name}`}
            className="relative block h-40 w-full cursor-zoom-in overflow-hidden rounded-2xl border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-56"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the workspace file route */}
            <img src={project.coverUrl} alt={`${project.name} cover`} className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            {project.images.length > 1 && (
              <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                <Icon name="image-line" /> {project.images.length} photos
              </span>
            )}
          </button>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <ProjectMark project={project} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{project.name}</h1>
                <span className="rounded-md border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{project.code}</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <Icon name="map-pin-2-line" /> {project.location}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ProjectStatusBadge status={project.status} />
                <ApprovalBadge approval={project.approval} authority={project.authority} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button variant="outline" leftIcon="edit-line" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <Button variant="outline" leftIcon="layout-grid-line" nativeButton={false} render={<Link href={`/estate/inventory?project=${urlCode(project.code)}`} />}>
              View inventory
            </Button>
            {canCreate && (
              <Button leftIcon="add-line" nativeButton={false} render={<Link href={`/estate/inventory?project=${urlCode(project.code)}&add=1`} />}>
                Add inventory
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          icon="layout-grid-line"
          label="Total units"
          value={number(stats.total)}
          hint={`${project.phases.length} ${project.phases.length === 1 ? "phase" : "phases"} · ${blockCount} ${blockCount === 1 ? "block" : "blocks"}`}
        />
        <StatTile icon="checkbox-circle-line" tone="green" label="Available" value={number(stats.counts.available)} hint={`${number(project.onHold)} on hold`} />
        <StatTile icon="hand-coin-line" tone="violet" label="Booked or sold" value={`${stats.soldPct}%`} hint={`${number(stats.counts.booked + stats.counts.sold)} units`} />
        <StatTile icon="money-rupee-circle-line" tone="sky" label="Available stock" value={formatPkr(stats.availableValue)} hint={`of ${formatPkr(stats.totalValue)} total`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Tabs
            tabs={[
              {
                value: "phases",
                label: "Phases & blocks",
                icon: "stack-line",
                count: project.phases.length,
                content: (
                  <div className="space-y-4 pt-2">
                    {project.phases.map((ph) => (
                      <PhaseSection key={ph.id} project={project} phase={ph} />
                    ))}
                    {/* Inventory: units by type and size across the whole project */}
                    <section className="space-y-2 pt-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        <Icon name="layout-grid-line" /> Inventory
                      </h3>
                      {project.unitMix.length ? (
                        <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/60 text-xs text-muted-foreground">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium">Unit</th>
                                <th className="px-4 py-2 text-right font-medium">Total</th>
                                <th className="px-4 py-2 text-right font-medium">Available</th>
                                <th className="px-4 py-2 text-left font-medium">Availability</th>
                                <th className="px-4 py-2 text-right font-medium">Price range</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {project.unitMix.map((r) => (
                                <tr key={r.key}>
                                  <td className="px-4 py-2.5">
                                    <span className="flex items-center gap-2">
                                      <Icon name={unitTypes.map[r.type]?.icon ?? "layout-grid-line"} className="text-muted-foreground" />
                                      {formatSize(r.sizeValue, r.sizeUnit)} {unitTypes.label(r.type)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums">{number(r.stats.total)}</td>
                                  <td className="px-4 py-2.5 text-right text-emerald-600 tabular-nums dark:text-emerald-400">{number(r.stats.counts.available)}</td>
                                  <td className="px-4 py-2.5">
                                    <AvailabilityBar stats={r.stats} className="w-32" />
                                  </td>
                                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{r.minPrice === r.maxPrice ? formatPkr(r.minPrice) : `${formatPkr(r.minPrice)} – ${formatPkr(r.maxPrice)}`}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
                          No inventory yet.{" "}
                          {canCreate && (
                            <Link href={`/estate/inventory?project=${urlCode(project.code)}&add=1`} className="text-primary hover:underline">
                              Add inventory
                            </Link>
                          )}
                        </div>
                      )}
                    </section>
                  </div>
                ),
              },
              {
                value: "progress",
                label: "Progress",
                icon: "pulse-line",
                content: <ProjectProgress project={project} canEdit={canEdit} />,
              },
              {
                value: "timeline",
                label: "Updates & events",
                icon: "newspaper-line",
                count: project.updates.length + project.events.length || null,
                content: <ProjectTimeline project={project} canEdit={canEdit} />,
              },
              {
                value: "photos",
                label: "Photos",
                icon: "image-line",
                count: project.images.length,
                content: <ProjectPhotos project={project} canEdit={canEdit} />,
              },
              {
                value: "documents",
                label: "Documents",
                icon: "folder-5-line",
                count: project.documents.length,
                content: <ProjectDocuments project={project} canEdit={canEdit} />,
              },
            ]}
          />
        </div>

        <aside className="space-y-6">
          <SectionCard title="Availability">
            <AvailabilityBar stats={stats} className="h-3" />
            <AvailabilityLegend stats={stats} className="mt-3" />
          </SectionCard>
          <SectionCard title="Project information">
            <dl className="divide-y">
              <Info label="Type">{types.label(project.type)}</Info>
              <Info label="City">{project.city ?? "—"}</Info>
              <Info label="Total area">{formatArea(project.totalArea, project.areaUnit)}</Info>
              <Info label="Marla size">{Number(project.marlaSqft)} sq ft</Info>
              <Info label="Approving authority">
                {project.authority ? authorities.label(project.authority) : "—"}
                <span className="block font-mono text-xs font-normal text-muted-foreground">{project.nocNumber ?? "NOC pending"}</span>
              </Info>
              <Info label="Launched">{project.launchDate ? formatDate(project.launchDate) : "—"}</Info>
              <Info label="Possession">{project.possessionDate ? formatDate(project.possessionDate) : "To be announced"}</Info>
            </dl>
          </SectionCard>
          {(project.description || project.amenities.length > 0) && (
            <SectionCard title="About">
              {project.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{project.description}</p>}
              {project.amenities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.amenities.map((a) => (
                    <span key={a} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </aside>
      </div>
      {viewing != null && <Lightbox images={project.images} index={viewing} onClose={() => setViewing(null)} />}
      {editing && <ProjectWizard project={project} onClose={() => setEditing(false)} />}
    </div>
  )
}
