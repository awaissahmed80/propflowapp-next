import { estatePage } from "@/modules/portfolio/server/context"
import { ComingSoon } from "@/components/coming-soon"

export const metadata = { title: "Rentals" }

export default async function RentalsPage() {
  await estatePage("/project-portfolio/rentals", "resale")
  return (
    <ComingSoon
      title="Rentals"
      description="Tenancies, rent schedules and renewals"
      icon="key-2-line"
      points={["Tenancy agreements with rent, deposit and term", "Monthly rent schedule, receipts and arrears", "Reminders before a tenancy ends"]}
    />
  )
}
