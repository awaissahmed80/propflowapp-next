"use client"

import { useList } from "@/modules/lookups/context"
import { PrintOnLoad } from "@/modules/console/components/print-on-load"
import { AllotmentLetter, ReceiptDocument, StatementDocument } from "./documents"
import { useUnitText } from "./sales-parts"

// A booking document alone on the page, printing itself on load (the print preview's Print button)
export function SalesPrint({ doc, booking, receiptCode, brand }) {
  const unitText = useUnitText()
  const methods = useList("payment-method")
  const features = useList("feature")
  const props = { booking, brand, unitText, methodLabel: methods.label, featureLabel: features.label }
  const receipt = receiptCode ? booking.receipts.find((r) => r.code.toLowerCase() === String(receiptCode).toLowerCase()) : null
  return (
    <div className="px-4 sm:px-6 lg:px-8 print:p-0">
      {doc === "allotment" && booking.allotment ? <AllotmentLetter {...props} /> : doc === "receipt" && receipt ? <ReceiptDocument {...props} receipt={receipt} /> : <StatementDocument {...props} />}
      <PrintOnLoad />
    </div>
  )
}
