"use client"

import { useEffect } from "react"

// Scroll reveal for the website: anything marked data-reveal fades and rises in the first time it
// scrolls into view (stagger with style={{ "--delay": "120ms" }}). New elements (a feature tab's
// screen and callouts) are picked up as they appear. Hiding before reveal only applies once the
// head script has set html.reveal-ready, so nothing is hidden without JavaScript, and it's all off
// for people who prefer reduced motion (globals.css).
export function Reveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.setAttribute("data-shown", "")
          io.unobserve(e.target)
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    )
    const watch = (root) => root.querySelectorAll?.("[data-reveal]:not([data-shown])").forEach((el) => io.observe(el))
    watch(document)
    const mo = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.("[data-reveal]") ? io.observe(n) : watch(n)))))
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [])
  return null
}

// Set before the page paints, so revealable content starts hidden only when this script ran
export const REVEAL_READY = "document.documentElement.classList.add('reveal-ready')"
