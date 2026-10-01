"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva } from "class-variance-authority";
import { Icon } from "./icon";
import { cn } from "cn"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        success:
          "bg-emerald-600 text-emerald-100 shadow-xs hover:bg-emerald-700/90 font-semibold",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        unstyled: "bg-transparent text-foreground shadow-none hover:bg-background/20",
        'outline-cta':
          "border-0  bg-orange-200/10 hover:bg-orange-200/20  dark:border-orange-300/50 text-orange-300",
        'cta-destructive':
          "border-0  bg-destructive/50 hover:bg-destructive/70 text-white/70",
      },
      size: {
        default: "h-control px-3 py-0 has-[>svg]:px-2.5",
        sm: "h-control-sm rounded-md gap-1.5 px-2.5 has-[>svg]:px-2",
        lg: "h-control-lg rounded-md px-4 has-[>svg]:px-3",
        icon: "size-(--height-control-icon)",
        smicon: "size-(--height-control-sm)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  children,
  loading,
  type = "button",
  leftIcon,
  // An icon after the label, e.g. "Next →"
  rightIcon,
  disabled,
  ...props
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}>
        { loading ? <Icon name="loader-3-fill" className="animate-spin" />:
                leftIcon && <Icon className="text-base" name={leftIcon} />
            }
            {children}
            {rightIcon && !loading && <Icon className="text-base" name={rightIcon} />}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants }
