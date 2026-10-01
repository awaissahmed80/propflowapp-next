// Print another page without leaving this one or opening a tab: it loads in a hidden frame
// (same site) and that page opens the print dialog itself (e.g. /billing/invoices/X?print=1,
// see PrintOnLoad). Only that page's printable content comes out.
export function printPage(url) {
  document.getElementById("pf-print-frame")?.remove()
  const frame = document.createElement("iframe")
  frame.id = "pf-print-frame"
  frame.title = "Print"
  frame.setAttribute("aria-hidden", "true")
  // Off screen but still laid out at A4 width, so it prints exactly like the page
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "210mm", height: "297mm", border: "0", opacity: "0", pointerEvents: "none", transform: "translateX(200%)" })
  frame.src = url
  document.body.appendChild(frame)
  // Tidy up once printing is over (the frame isn't needed after the dialog closes)
  frame.addEventListener("load", () => {
    frame.contentWindow?.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500))
  })
}
