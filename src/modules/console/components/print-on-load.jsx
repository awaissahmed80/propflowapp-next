"use client"

import { useEffect } from "react"

// Opens the browser's print dialog once the page has loaded (e.g. /billing/invoices/X?print=1)
export function PrintOnLoad() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300)
    return () => clearTimeout(id)
  }, [])
  return null
}
