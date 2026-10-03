"use client"

import { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Dialog } from "./dialog"
import { Icon } from "./icon"
import { ScrollView } from "./scroll-view"

// Photo viewer in a modal. With several photos it's a gallery: arrows, ← / → keys and a strip of
// thumbnails. images: [{ url, title }]; index: the one to open on.
//   const [open, setOpen] = useState(null) … <Lightbox images={photos} index={open} onClose={() => setOpen(null)} />
export function Lightbox({ images, index = 0, onClose }) {
  const [current, setCurrent] = useState(index)
  const many = images.length > 1
  const go = useCallback((step) => setCurrent((c) => (c + step + images.length) % images.length), [images.length])
  const image = images[current]

  useEffect(() => {
    if (!many) return
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1)
      if (e.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [many, go])

  if (!image) return null
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-[min(76rem,calc(100%-2rem))]"
      title={image.title || "Photo"}
      description={many ? `${current + 1} of ${images.length}` : undefined}
      headerActions={
        <>
          <Button variant="ghost" size="smicon" leftIcon="external-link-line" aria-label="Open the original" nativeButton={false} render={<a href={image.url} target="_blank" rel="noreferrer" />} />
          <Button variant="ghost" size="smicon" leftIcon="download-2-line" aria-label="Download" nativeButton={false} render={<a href={`${image.url}${image.url.includes("?") ? "&" : "?"}download=1`} />} />
        </>
      }
    >
      <div className="relative flex h-[min(70svh,44rem)] items-center justify-center overflow-hidden rounded-lg bg-black/90">
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the workspace file route */}
        <img key={image.url} src={image.url} alt={image.title || ""} className="max-h-full max-w-full object-contain duration-200 animate-in fade-in-0" />
        {many && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => go(-1)}
              className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-xl text-white backdrop-blur transition hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <Icon name="arrow-left-s-line" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => go(1)}
              className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-xl text-white backdrop-blur transition hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <Icon name="arrow-right-s-line" />
            </button>
          </>
        )}
      </div>
      {many && (
        <ScrollView className="w-full" viewportClassName="flex gap-2 pb-1">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              aria-label={`Photo ${i + 1}`}
              aria-current={i === current}
              onClick={() => setCurrent(i)}
              className={cn(
                "size-16 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                i === current ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the workspace file route */}
              <img src={img.url} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </ScrollView>
      )}
    </Dialog>
  )
}
