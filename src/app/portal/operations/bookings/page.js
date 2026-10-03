import { live } from "@/server/db/records"
import { salesPage } from "@/modules/operations/server/context"
import { listBookings } from "@/modules/operations/server/queries"
import { BookingsView } from "@/modules/operations/components/bookings-view"

export const metadata = { title: "Bookings" }

// ?stage= · ?status= · ?health=overdue
export default async function SalesBookingsPage() {
  const ctx = await salesPage("/operations/bookings")
  const [bookings, projects] = await Promise.all([listBookings(ctx), live(ctx.db, "projects").orderBy("name").select("code", "name")])
  return <BookingsView bookings={bookings} projects={projects} canCreate={ctx.can("create")} />
}
