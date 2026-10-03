import { notFound } from "next/navigation"
import { salesPage } from "@/modules/operations/server/context"
import { bookableUnits, receivingAccounts } from "@/modules/operations/server/queries"
import { NewBooking } from "@/modules/operations/components/new-booking"

export const metadata = { title: "New booking" }

// Walk-in bookings straight from Sales (leads book from CRM's Close deal tab)
export default async function SalesNewBookingPage() {
  const ctx = await salesPage("/operations/bookings/new")
  if (!ctx.can("create")) notFound()
  const [units, accounts] = await Promise.all([bookableUnits(ctx), receivingAccounts(ctx)])
  return <NewBooking units={units} accounts={accounts} discountLimit={Number(ctx.grant("operations.discount") ?? 0)} canReceive receiveDirect={Boolean(ctx.grant("operations.receipts"))} />
}
