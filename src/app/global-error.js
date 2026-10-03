"use client"

import "remixicon/fonts/remixicon.css"
import "./globals.css"
import { ErrorPage } from "@/components/error-pages"

// When even the root layout fails: its own <html>, following the system theme
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <script dangerouslySetInnerHTML={{ __html: "if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')" }} />
        <ErrorPage error={error} reset={reset} />
      </body>
    </html>
  )
}
