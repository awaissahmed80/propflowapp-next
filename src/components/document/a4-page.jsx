import { cn } from "@/lib/utils"

// A printable document shown as an A4 sheet (210 × 297 mm): invoices, receipts, letters,
// statements. On screen it sits on a gray "desk" like a PDF viewer and grows if the content
// runs longer than a page; printing (or Save as PDF) uses A4 with no browser margins, so what's
// on screen is what comes out. On narrow screens the sheet fits the width instead.
//   <A4Page><header>…</header>…</A4Page>
// landscape: a 297 × 210 mm sheet (wide grids such as the duty roster); the print page also needs
// @page { size: A4 landscape } (see A4_LANDSCAPE_PRINT)
export function A4Page({ children, className, label = "Document", landscape = false }) {
  return (
    <div data-a4-desk className="-mx-4 overflow-x-hidden bg-muted px-4 py-6 sm:-mx-6 sm:px-6 sm:py-8 lg:-mx-8 lg:px-8 print:m-0 print:bg-white print:p-0">
      <article aria-label={label} data-a4-page className={cn("a4-page", landscape && "a4-landscape", className)}>
        {children}
      </article>
    </div>
  )
}

// Render on a print page whose A4Page is landscape: <style>{A4_LANDSCAPE_PRINT}</style>
export const A4_LANDSCAPE_PRINT = "@page { size: A4 landscape; margin: 0; }"
