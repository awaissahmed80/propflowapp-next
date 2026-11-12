"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

// Parallax: every [data-parallax="0.15"] inside the page moves at that fraction of the scroll,
// relative to the middle of the screen, and .pf-tilt screens settle flat as they rise. One
// listener for the whole page; off for reduced motion.
export function Parallax() {
  useEffect(() => {
    if (reduced()) return
    let frame = 0
    const update = () => {
      frame = 0
      const mid = window.innerHeight / 2
      document.querySelectorAll("[data-parallax]").forEach((el) => {
        const box = (el.parentElement ?? el).getBoundingClientRect()
        if (box.bottom < -200 || box.top > window.innerHeight + 200) return
        const speed = Number(el.dataset.parallax) || 0.1
        el.style.setProperty("--py", `${((box.top + box.height / 2 - mid) * -speed).toFixed(1)}px`)
      })
      // .pf-tilt: leans back while low on the screen and settles flat as it rises
      document.querySelectorAll(".pf-tilt").forEach((el) => {
        const top = el.getBoundingClientRect().top
        const t = Math.min(1, Math.max(0, (top - window.innerHeight * 0.15) / (window.innerHeight * 0.6)))
        el.style.setProperty("--tilt", `${(t * 14).toFixed(2)}deg`)
        el.style.setProperty("--tilt-scale", (1 - t * 0.04).toFixed(3))
      })
    }
    const onScroll = () => (frame ||= requestAnimationFrame(update))
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])
  return null
}

// Pictures of the same framing that crossfade slowly (1.6s), holding about six seconds each.
// Pauses while the tab is hidden; reduced motion shows only the first.
export function Crossfade({ pictures, className, imgClassName, priority = false, every = 6000 }) {
  const [shown, setShown] = useState(0)
  const timer = useRef(null)
  useEffect(() => {
    if (reduced() || pictures.length < 2) return
    const start = () => (timer.current = setInterval(() => setShown((i) => (i + 1) % pictures.length), every))
    const stop = () => clearInterval(timer.current)
    const onVisible = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [pictures.length, every])
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {pictures.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized webp
        <img
          key={p.src}
          src={p.src}
          alt={i === shown ? p.alt : ""}
          aria-hidden={i !== shown}
          width={p.width}
          height={p.height}
          loading={priority && i === 0 ? "eager" : "lazy"}
          fetchPriority={priority && i === 0 ? "high" : undefined}
          className={cn("pf-fade absolute inset-0 size-full object-cover", imgClassName, i === shown ? "opacity-100" : "opacity-0")}
          style={{ objectPosition: p.position ?? "center" }}
        />
      ))}
    </div>
  )
}
