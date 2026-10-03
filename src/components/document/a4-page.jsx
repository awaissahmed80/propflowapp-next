import { cn } from "@/lib/utils"

// A printable document shown as an A4 sheet (210 × 297 mm): invoices, receipts, letters,
// statements. On screen it sits on a gray "desk" like a PDF viewer and grows if the content
// runs longer than a page; printing (or Save as PDF) uses A4 with no browser margins, so what's
// on screen is what comes out. On narrow screens the sheet fits the width instead.
//   <A4Page><header>…</header>…</A4Page>
export function A4Page({ children, className, label = "Document" }) {
  return (
    <div data-a4-desk className="-mx-4 overflow-x-hidden bg-muted px-4 py-6 sm:-mx-6 sm:px-6 sm:py-8 lg:-mx-8 lg:px-8 print:m-0 print:bg-white print:p-0">
      <article aria-label={label} data-a4-page className={cn("a4-page", className)}>
        {children}
      </article>
    </div>
  )
}
