/* eslint-disable @next/next/no-img-element -- small SVG logos; next/image adds nothing for SVG */
import { cn } from "@/lib/utils"

const LOGOS = {
  // Dark artwork, for light backgrounds
  dark: "/images/propflow-logo-light.svg",
  // Light artwork, for dark backgrounds
  light: "/images/propflow-logo-dark.svg",
}

// variant="auto" follows the app theme; "light"/"dark" force a file
// (e.g. "light" on a panel that is always dark regardless of theme).
export function Logo({ variant = "auto", className, alt = "PropFlow", ...props }) {
  const classes = cn("h-8 w-auto select-none", className)

  if (variant !== "auto") {
    return <img src={LOGOS[variant]} alt={alt} className={classes} draggable={false} {...props} />
  }

  return (
    <>
      <img src={LOGOS.dark} alt={alt} className={cn(classes, "dark:hidden")} draggable={false} {...props} />
      <img src={LOGOS.light} alt={alt} className={cn(classes, "hidden dark:block")} draggable={false} {...props} />
    </>
  )
}

const ICONS = {
  dark: "/images/propflow-icon-light.svg",
  light: "/images/propflow-icon-dark.svg",
}

// The PropFlow mark on its own (collapsed sidebar, favicon-sized places); follows the theme
export function BrandIcon({ className, alt = "PropFlow", ...props }) {
  const classes = cn("size-8 select-none", className)
  return (
    <>
      <img src={ICONS.dark} alt={alt} className={cn(classes, "dark:hidden")} draggable={false} {...props} />
      <img src={ICONS.light} alt={alt} className={cn(classes, "hidden dark:block")} draggable={false} {...props} />
    </>
  )
}
