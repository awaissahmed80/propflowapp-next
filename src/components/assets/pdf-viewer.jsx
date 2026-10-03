"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"

// A PDF drawn by pdf.js, so it looks the same in every browser (no browser PDF toolbar): pages
// stacked on a gray desk, drawn as they scroll into view, with page count and zoom controls.
//   url: same-origin file URL (workspace files send the session cookie)

let pdfjs = null
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import("pdfjs-dist")
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
  }
  return pdfjs
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

function Page({ doc, number, scale, root, onVisible }) {
  const holder = useRef(null)
  const canvas = useRef(null)
  const [size, setSize] = useState(null) // { w, h } at scale 1
  const [seen, setSeen] = useState(number <= 2)

  useEffect(() => {
    let live = true
    doc.getPage(number).then((page) => {
      const v = page.getViewport({ scale: 1 })
      if (live) setSize({ w: v.width, h: v.height })
    })
    return () => {
      live = false
    }
  }, [doc, number])

  // Draw once it comes near the screen; report the page in view for the counter
  useEffect(() => {
    const el = holder.current
    if (!el) return
    const near = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { root, rootMargin: "600px 0px" })
    const middle = new IntersectionObserver(([e]) => e.isIntersecting && onVisible(number), { root, rootMargin: "-45% 0px -45% 0px" })
    near.observe(el)
    middle.observe(el)
    return () => {
      near.disconnect()
      middle.disconnect()
    }
  }, [root, number, onVisible])

  useEffect(() => {
    if (!seen || !size) return
    let task = null
    let cancelled = false
    doc.getPage(number).then((page) => {
      if (cancelled || !canvas.current) return
      const ratio = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: scale * ratio })
      const c = canvas.current
      c.width = Math.floor(viewport.width)
      c.height = Math.floor(viewport.height)
      task = page.render({ canvas: c, canvasContext: c.getContext("2d"), viewport })
      task.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, number, scale, seen, size])

  const w = size ? size.w * scale : 595 * scale
  const h = size ? size.h * scale : 842 * scale
  return (
    <div ref={holder} data-page={number} className="mx-auto shrink-0 bg-white shadow-md ring-1 ring-black/5" style={{ width: w, height: h }}>
      <canvas ref={canvas} className="block size-full" aria-label={`Page ${number}`} />
    </div>
  )
}

export function PdfViewer({ url, className }) {
  const scroller = useRef(null)
  const [root, setRoot] = useState(null)
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState("")
  const [fit, setFit] = useState(1) // scale that fits the first page's width
  const [zoom, setZoom] = useState(null) // null = fit width
  const [current, setCurrent] = useState(1)

  useEffect(() => {
    let live = true
    let task = null // the loading task owns the document; destroying it frees the worker too
    // A new url remounts the viewer (keyed), so state starts fresh
    loadPdfjs()
      .then((lib) => {
        if (!live) return null
        task = lib.getDocument({ url, withCredentials: true })
        return task.promise
      })
      .then((d) => live && d && setDoc(d))
      .catch(() => live && setError("This PDF couldn't be shown. Download it to open it."))
    return () => {
      live = false
      task?.destroy?.()
    }
  }, [url])

  // Fit width: the first page against the space available, recomputed when the box resizes
  useEffect(() => {
    if (!doc || !root) return
    let width = 0
    const measure = async () => {
      const page = await doc.getPage(1)
      width = page.getViewport({ scale: 1 }).width
      setFit(Math.max(0.3, (root.clientWidth - 48) / width))
    }
    measure()
    const ro = new ResizeObserver(() => width && setFit(Math.max(0.3, (root.clientWidth - 48) / width)))
    ro.observe(root)
    return () => ro.disconnect()
  }, [doc, root])

  const scale = zoom ?? fit
  const step = (dir) => {
    const list = dir > 0 ? ZOOMS.filter((z) => z > scale + 0.01) : ZOOMS.filter((z) => z < scale - 0.01).reverse()
    if (list[0]) setZoom(list[0])
  }

  return (
    <div className={cn("relative flex size-full flex-col", className)}>
      <div
        ref={(el) => {
          scroller.current = el
          setRoot(el)
        }}
        className="min-h-0 flex-1 overflow-auto bg-muted/60 [scrollbar-width:thin]"
      >
        {error ? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : !doc ? (
          <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Icon name="loader-4-line" className="animate-spin" /> Loading PDF…
          </p>
        ) : (
          <div className="flex w-max min-w-full flex-col gap-4 p-6">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <Page key={i + 1} doc={doc} number={i + 1} scale={scale} root={root} onVisible={setCurrent} />
            ))}
          </div>
        )}
      </div>

      {doc && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-background/95 px-1.5 py-1 text-xs shadow-md backdrop-blur">
          <span className="px-2 text-muted-foreground tabular-nums">
            {current} / {doc.numPages}
          </span>
          <span className="h-4 w-px bg-border" aria-hidden />
          <button type="button" aria-label="Zoom out" onClick={() => step(-1)} className="flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-muted">
            <Icon name="zoom-out-line" />
          </button>
          <button type="button" onClick={() => setZoom(null)} className="min-w-12 cursor-pointer rounded-full px-1.5 py-1 font-medium tabular-nums hover:bg-muted" title="Fit width">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => step(1)} className="flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-muted">
            <Icon name="zoom-in-line" />
          </button>
          <button type="button" aria-label="Fit width" onClick={() => setZoom(null)} className={cn("flex size-7 cursor-pointer items-center justify-center rounded-full hover:bg-muted", zoom == null && "text-primary")}>
            <Icon name="expand-width-line" />
          </button>
        </div>
      )}
    </div>
  )
}
