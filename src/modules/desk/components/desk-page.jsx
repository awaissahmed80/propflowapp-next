import Link from "next/link"
import { Icon } from "@/components/ui/icon"

// My Desk's own pages (Requests & approvals, My team, Profile) under the launcher's top bar,
// with a way back to My Desk
export function DeskPage({ children }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="px-4 pt-5 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-line" /> My Desk
        </Link>
      </div>
      {children}
    </div>
  )
}
