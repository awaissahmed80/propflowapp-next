import Link from "next/link"
import { ErrorScreen } from "@/components/error-screen"
import { Button } from "@/components/ui/button"

// For an app the workspace doesn't have, or the person's role can't open (inside the portal frame)
export function NoAccess() {
  return (
    <ErrorScreen
      full={false}
      code="403"
      tag={{ icon: "lock-2-line", label: "No access" }}
      title="You don't have access to this app"
      text="It isn't part of your workspace's plan, or your role can't open it. Ask your company administrator if you need it."
      actions={
        <Button leftIcon="apps-2-line" nativeButton={false} render={<Link href="/" />}>
          Back to apps
        </Button>
      }
    />
  )
}
