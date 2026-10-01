// Standard title row for module pages.
//   toolbar: controls right after the title (search, filters); actions: pinned to the right (CTA)
//   description: under the title, or, when there's a toolbar, under the whole row so the title,
//   search and filters line up on one line
//   info: a compact note just before the actions (counts, seats…)
export function PageHeader({ title, description, toolbar, actions, info }) {
  const below = toolbar ? description : null
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 md:flex-nowrap">
        {/* Title never truncates; the description does, and the toolbar shrinks first */}
        <div className="max-w-full shrink [min-width:min-content]">
          <h1 className="text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">{title}</h1>
          {description && !toolbar && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground" title={typeof description === "string" ? description : undefined}>
              {description}
            </p>
          )}
        </div>
        {toolbar && <div className="flex flex-1 items-center gap-2 max-sm:basis-full [min-width:min-content]">{toolbar}</div>}
        {(info || actions) && (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {info && <div className="flex items-center text-xs whitespace-nowrap text-muted-foreground">{info}</div>}
            {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
          </div>
        )}
      </div>
      {below && <p className="text-sm text-muted-foreground">{below}</p>}
    </div>
  )
}
