/* eslint-disable @next/next/no-img-element -- pre-sized webp screenshots, cropped with CSS */
import { cn } from "@/lib/utils"
import SCREENS from "../screens.json"

// A real crop of a portal screenshot (scripts/capture-screens.mjs), at the area of one callout in
// screens.json. The crop keeps the area's proportions; the picture inside is positioned so only
// that area shows. Without a callout, the whole screen.
// width: how wide the crop shows on a desktop, in CSS pixels, so phones and small slots download
// a smaller copy (scripts/web-screen-sizes.mjs makes 640, 1080 and 1600 wide versions).
const WIDTHS = [640, 1080, 1600]
export function Crop({ screen, callout, alt, className, priority = false, pad = 0, width = 640 }) {
  const s = SCREENS[screen]
  if (!s) return null
  const found = callout ? s.callouts.find((c) => c.id === callout && !c.missing) : null
  const c = found ? grow(found, pad) : { x: 0, y: 0, w: 100, h: 100 }
  const ratio = s.width / s.height
  const scale = 100 / c.w // the picture is this many times wider than the crop
  const srcSet = [...WIDTHS.map((w) => `${s.src.replace(".webp", `-${w}.webp`)} ${w}w`), `${s.src} ${s.width}w`].join(", ")
  const sizes = `(min-width: 1024px) ${Math.round(width * scale)}px, ${Math.round(100 * scale)}vw`
  return (
    <div className={cn("relative overflow-hidden bg-white", className)} style={{ aspectRatio: `${(c.w * ratio) / c.h}` }}>
      <img
        src={s.src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={s.width}
        height={s.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className="absolute max-w-none"
        style={{ width: `${(100 / c.w) * 100}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%` }}
      />
    </div>
  )
}

// A little room around the callout, kept inside the screenshot
function grow(c, pad) {
  if (!pad) return c
  const x = Math.max(0, c.x - pad)
  const y = Math.max(0, c.y - pad)
  return { x, y, w: Math.min(100 - x, c.w + pad * 2), h: Math.min(100 - y, c.h + pad * 2) }
}
