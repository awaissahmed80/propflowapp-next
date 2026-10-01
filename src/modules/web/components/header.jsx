"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { siteUrl } from "@/lib/sites"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { TrialButton } from "./enquiry"

// Full-width header over the hero; gets a background once the page scrolls.
// On phones the section links move into a menu.
// showSignIn: console Settings › Show Sign in on the website
export function Header({ nav, showSignIn = true }) {
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  const solid = scrolled || menu
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200",
        solid ? "border-border bg-background/85 shadow-xs backdrop-blur-md supports-[backdrop-filter]:bg-background/70" : "border-transparent bg-transparent",
      )}
    >
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] lg:px-10">
        <a href="#top" aria-label="PropFlow home" className="justify-self-start">
          <Logo className="h-8" />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="transition-colors hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 justify-self-end sm:gap-2">
          <ThemeToggle />
          {showSignIn && (
            <Button variant="ghost" nativeButton={false} render={<a href={siteUrl("auth")} />} className="max-sm:hidden">
              Sign in
            </Button>
          )}
          <TrialButton source="Header" leftIcon={null} className="max-sm:hidden" />
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icon name={menu ? "close-line" : "menu-line"} className="text-lg" />
          </Button>
        </div>
      </div>
      {menu && (
        <nav aria-label="Main" className="border-t px-4 pb-4 md:hidden">
          <ul className="divide-y">
            {nav.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={() => setMenu(false)} className="block py-3 text-sm font-medium">
                  {n.label}
                </a>
              </li>
            ))}
            {showSignIn && (
              <li>
                <a href={siteUrl("auth")} className="block py-3 text-sm font-medium">
                  Sign in
                </a>
              </li>
            )}
          </ul>
          <TrialButton source="Mobile menu" leftIcon={null} className="mt-2 w-full" />
        </nav>
      )}
    </header>
  )
}
