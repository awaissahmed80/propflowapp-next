import { salesPage } from "@/modules/operations/server/context"
import { getLookupLists } from "@/modules/lookups/server"
import { BookingDocumentsEditor } from "@/modules/operations/components/booking-documents-editor"

export const metadata = { title: "Booking documents" }

// The documents every booking needs, step by step (the "booking-document" list)
export default async function SalesDocumentsPage() {
  const ctx = await salesPage("/operations/customize/documents")
  const [list] = await getLookupLists(ctx.db, ["operations"]).then((ls) => ls.filter((l) => l.key === "booking-document"))
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <BookingDocumentsEditor list={list} canEdit={ctx.can("edit")} />
    </div>
  )
}
