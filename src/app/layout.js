import { Inter } from "next/font/google"
import { cookies, headers } from "next/headers"
import { siteForHost } from "@/lib/sites"
import "remixicon/fonts/remixicon.css"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { AlertProvider } from "@/components/alert-context"
import { THEME_COOKIE, parseThemeCookie } from "@/lib/theme"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })

export const metadata = {
  title: { default: "PropFlow", template: "%s · PropFlow" },
  description: "Real estate ERP for Pakistani developers: projects, files, bookings, collections and more.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  // Private by default: only the website (app/web/layout.js) asks to be indexed
  robots: { index: false, follow: false },
}

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default async function RootLayout({ children }) {
  // The theme comes from the pf-theme cookie, so the server sends the right one (no flash, no
  // inline script). ThemeProvider follows system changes and updates the cookie.
  // Public landing pages and forms (campaigns.<domain>) are the customer's brand: always light
  const [jar, head] = await Promise.all([cookies(), headers()])
  const site = siteForHost(head.get("host"))
  const campaigns = site === "campaigns"
  const resolved = campaigns ? "light" : parseThemeCookie(jar.get(THEME_COOKIE)?.value).resolved
  return (
    // ThemeProvider may switch the class after loading (system theme changed), so it can differ
    <html lang={site === "web" ? "en-PK" : "en"} className={`${inter.variable} ${resolved} h-full antialiased`} style={{ colorScheme: resolved }} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <ThemeProvider forced={campaigns ? "light" : null}>
          <AlertProvider>
            {children}
            <Toaster />
          </AlertProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
