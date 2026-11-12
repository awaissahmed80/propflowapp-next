"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { siteUrl } from "@/lib/sites"
import { Logo } from "@/components/logo"
import { Icon } from "@/components/ui/icon"
import { DemoButton } from "./demo"

// The website header: logo, a Product menu (one page per product search), Why PropFlow, Mobile
// app and Pricing, then Sign in and "Book a demo". Stays at the top and gets a ground once the page
// scrolls. On phones everything moves into a full-width menu.
export function SiteHeader({ products, showSignIn = true, pricingLabel = "Pricing" }) {
  const path = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [product, setProduct] = useState(false)
  const productRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  useEffect(() => {
    if (!product) return
    const close = (e) => (e.key === "Escape" || (e.type === "pointerdown" && !productRef.current?.contains(e.target))) && setProduct(false)
    document.addEventListener("keydown", close)
    document.addEventListener("pointerdown", close)
    return () => {
      document.removeEventListener("keydown", close)
      document.removeEventListener("pointerdown", close)
    }
  }, [product])
  useEffect(() => {
    document.documentElement.style.overflow = menu ? "hidden" : ""
  }, [menu])

  const links = [
    { href: "/why-propflow", label: "Why PropFlow" },
    { href: "/mobile-app", label: "Mobile app" },
    { href: "/pricing", label: pricingLabel },
  ]
  const here = (href) => path === href

  return (
    <header className={cn("fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow] duration-300", scrolled || menu ? "bg-white/85 shadow-[0_1px_0_rgb(11_18_64/0.08)] backdrop-blur-md" : "bg-transparent")}>
      <div className="flex h-18 items-center gap-6 px-[var(--gutter)]">
        <a href="/" aria-label="PropFlow home" className="shrink-0">
          <Logo variant="dark" className="h-8" width={155} height={32} />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <div ref={productRef} className="relative">
            <button
              type="button"
              aria-expanded={product}
              aria-controls="product-menu"
              onClick={() => setProduct((p) => !p)}
              className={cn("flex h-10 items-center gap-1 rounded-lg px-3 text-[15px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface)]", product && "bg-[var(--surface)]")}
            >
              Product
              <Icon name="arrow-down-s-line" className={cn("transition-transform duration-200", product && "rotate-180")} aria-hidden />
            </button>
            {product && (
              <div id="product-menu" className="pf-swap absolute top-12 left-0 w-[34rem] rounded-lg bg-[var(--paper)] p-3 border border-[var(--line)] shadow-[0_24px_60px_-20px_rgb(11_18_64/0.35)]">
                <ul className="grid grid-cols-2 gap-1">
                  {products.map((p) => (
                    <li key={p.slug}>
                      <a href={`/${p.slug}`} className="block rounded-lg p-3 transition-colors hover:bg-[var(--surface)]">
                        <span className="block font-medium">{p.menu}</span>
                        <span className="block text-sm text-[var(--text-2)]">{p.blurb}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {links.map((l) => (
            <a key={l.href} href={l.href} aria-current={here(l.href) ? "page" : undefined} className={cn("flex h-10 items-center rounded-lg px-3 text-[15px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface)]", here(l.href) && "text-[var(--brand)]")}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {showSignIn && (
            <a href={siteUrl("auth")} className="hidden h-10 items-center rounded-lg px-3 text-[15px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface)] sm:flex">
              Sign in
            </a>
          )}
          <DemoButton source="Header" arrow={false} className="h-10 px-4 text-[15px] sm:h-11 sm:px-5" />
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-lg text-2xl hover:bg-[var(--surface)] lg:hidden"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            aria-controls="site-menu"
            onClick={() => setMenu((m) => !m)}
          >
            <Icon name={menu ? "close-line" : "menu-line"} />
          </button>
        </div>
      </div>
      {menu && (
        <nav id="site-menu" aria-label="Main" className="pf-swap h-[calc(100svh-4.5rem)] overflow-y-auto bg-[var(--bg)] px-[var(--gutter)] pt-2 pb-10 lg:hidden">
          <p className="text-sm font-medium text-[var(--text-2)]">Product</p>
          <ul className="mt-1 mb-6">
            {products.map((p) => (
              <li key={p.slug}>
                <a href={`/${p.slug}`} className="block py-2.5 text-lg font-medium">
                  {p.menu}
                </a>
              </li>
            ))}
          </ul>
          <ul className="mb-8">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="block py-2.5 text-lg font-medium">
                  {l.label}
                </a>
              </li>
            ))}
            {showSignIn && (
              <li>
                <a href={siteUrl("auth")} className="block py-2.5 text-lg font-medium">
                  Sign in
                </a>
              </li>
            )}
          </ul>
          <DemoButton source="Mobile menu" className="w-full" />
        </nav>
      )}
    </header>
  )
}
