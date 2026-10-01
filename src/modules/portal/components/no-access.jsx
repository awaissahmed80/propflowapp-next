import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

// For an app the workspace doesn't have, or the person's role can't open
export function NoAccess() {
  return (
    <main className="flex flex-col items-center px-4 py-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-2xl text-muted-foreground">
        <Icon name="lock-2-line" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">You don&apos;t have access to this app</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">It isn&apos;t part of your workspace&apos;s plan, or your role can&apos;t open it. Ask your company administrator if you need it.</p>
      <Button className="mt-6" variant="outline" leftIcon="apps-2-line" nativeButton={false} render={<Link href="/" />}>
        Back to apps
      </Button>
    </main>
  )
}
