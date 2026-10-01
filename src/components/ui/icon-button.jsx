"use client"

import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Icon } from "./icon"
import { Tooltip } from "./tooltip"

const iconButtonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-lg transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-accent data-popup-open:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-muted/70 text-foreground hover:bg-muted hover:text-primary",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        outline: "border bg-background text-foreground shadow-xs hover:bg-accent dark:border-input dark:bg-input/20",
        destructive: "text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "size-(--height-control-icon)",
        sm: "size-(--height-control-sm) text-base",
        lg: "size-(--height-control-lg) text-xl",
      },
    },
    defaultVariants: { variant: "ghost", size: "default" },
  }
)

// Icon-only button. The tooltip comes from `tooltip` or `aria-label`; pass tooltip={false} to skip it.
// `badge`: number (count, 99+) or true (dot) shown top-right, e.g. unread items.
function IconButton({
  icon,
  tooltip,
  badge,
  loading = false,
  variant,
  size,
  className,
  type = "button",
  disabled,
  tooltipSide = "bottom",
  "aria-label": ariaLabel,
  ...props
}) {
  const tip = tooltip === false ? null : (tooltip ?? ariaLabel)
  const showBadge = badge === true || (typeof badge === "number" && badge > 0)

  const button = (
    <button
      type={type}
      data-slot="icon-button"
      aria-label={ariaLabel ?? (typeof tooltip === "string" ? tooltip : undefined)}
      disabled={disabled || loading}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      <Icon name={loading ? "loader-3-fill" : icon} className={cn(loading && "animate-spin")} />
      {showBadge && (
        <span
          aria-hidden
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-destructive font-semibold text-white ring-2 ring-background",
            badge === true ? "top-1.5 right-1.5 size-2" : "-top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] leading-none tabular-nums"
          )}
        >
          {badge === true ? null : badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  )

  if (!tip) return button
  return (
    <Tooltip content={tip} side={tooltipSide}>
      {button}
    </Tooltip>
  )
}

export { IconButton, iconButtonVariants }
