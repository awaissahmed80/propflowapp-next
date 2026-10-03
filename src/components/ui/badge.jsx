"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive: "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function BaseBadge({ className, variant = "default", render, ...props }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

// Soft tinted badges for statuses; colors are theme-aware
const BADGE_COLORS = {
  gray: "bg-muted text-muted-foreground",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
}

const DOT_COLORS = {
  gray: "bg-muted-foreground",
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
}

// <Badge color="green" dot>Qualified</Badge>, or any hex (<Badge color="#7c3aed">); without color
// it's the plain shadcn badge. Hex colors get a soft tint and text that reads in both themes.
function Badge({ color, dot, className, style, children, ...props }) {
  if (!color)
    return (
      <BaseBadge className={className} style={style} {...props}>
        {children}
      </BaseBadge>
    )
  if (color.startsWith("#"))
    return (
      <BaseBadge
        className={cn("rounded-full", className)}
        style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color: `color-mix(in oklab, ${color} 70%, var(--foreground))`, ...style }}
        {...props}
      >
        {dot && <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />}
        {children}
      </BaseBadge>
    )
  return (
    <BaseBadge className={cn("rounded-full", BADGE_COLORS[color] ?? BADGE_COLORS.gray, className)} style={style} {...props}>
      {dot && <span className={cn("size-1.5 rounded-full", DOT_COLORS[color] ?? DOT_COLORS.gray)} />}
      {children}
    </BaseBadge>
  )
}

export { Badge, BaseBadge, badgeVariants }
