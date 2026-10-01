"use client"

import { Dialog } from "@/components/ui/dialog"
import { IconButton } from "@/components/ui/icon-button"
import { printPage } from "@/lib/print"

// Download a file the server answers with Content-Disposition: attachment, without leaving the page
function download(url) {
  const a = document.createElement("a")
  a.href = url
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// Every print starts here: the document as it prints (A4), with Download PDF and Print in the header.
//   printUrl  a page that renders only the document and opens the print dialog (see PrintOnLoad)
//   pdfUrl    a route answering with the PDF as an attachment
//   onExcel   optional: build and download an Excel file (reports)
//   <PrintPreviewDialog title="Price list" printUrl=… pdfUrl=… onClose=…><PriceListDocument …/></PrintPreviewDialog>
export function PrintPreviewDialog({ title, description = "Print preview (A4)", printUrl, pdfUrl, onExcel, onClose, children }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      scrollable
      className="sm:max-w-[min(58rem,calc(100%-4rem))]"
      bodyClassName="p-0"
      title={title}
      description={description}
      headerActions={
        <>
          {onExcel && <IconButton icon="file-excel-2-line" aria-label="Download Excel" onClick={onExcel} />}
          {pdfUrl && <IconButton icon="file-download-line" aria-label="Download PDF" onClick={() => download(pdfUrl)} />}
          {printUrl && <IconButton icon="printer-line" aria-label="Print" onClick={() => printPage(printUrl)} />}
        </>
      }
    >
      {/* A4Page cancels its page's padding to span the width, so give it that padding here */}
      <div className="px-4 sm:px-6 lg:px-8">{children}</div>
    </Dialog>
  )
}
