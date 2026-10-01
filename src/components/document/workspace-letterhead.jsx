import { cn } from "@/lib/utils"

// Top of every workspace report, PDF and print: the workspace logo when there is one, otherwise
// its company name; contact lines alongside. brand: getWorkspaceBrand(tenant)
//   <WorkspaceLetterhead brand={brand} title="Inventory report" meta="Generated 4 Oct 2026" />
export function WorkspaceLetterhead({ brand, title, meta, className }) {
  const contact = [brand.address, [brand.phone, brand.email].filter(Boolean).join(" · "), brand.ntn && `NTN ${brand.ntn}`].filter(Boolean)
  return (
    <header className={cn("flex items-start justify-between gap-6 border-b pb-4", className)}>
      <div className="min-w-0">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, so it prints and exports as is
          <img src={brand.logoUrl} alt={brand.name} className="h-14 max-w-56 object-contain object-left" />
        ) : (
          <p className="text-2xl font-bold tracking-tight">{brand.name}</p>
        )}
        {brand.logoUrl && <p className="mt-1 text-sm font-semibold">{brand.legalName || brand.name}</p>}
        {!brand.logoUrl && brand.legalName && brand.legalName !== brand.name && <p className="text-sm text-muted-foreground">{brand.legalName}</p>}
        {contact.map((line) => (
          <p key={line} className="text-xs text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
      {(title || meta) && (
        <div className="shrink-0 text-right">
          {title && <p className="text-lg font-semibold">{title}</p>}
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        </div>
      )}
    </header>
  )
}
