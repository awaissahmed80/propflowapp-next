"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

// Opens the PropFlow app with the sign-in code, once, with a button in case the browser asks first
export function DesktopReturn({ link }) {
  useEffect(() => {
    window.location.href = link
  }, [link])
  return (
    <div className="space-y-6 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-600 dark:text-emerald-400">
        <Icon name="checkbox-circle-line" />
      </span>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re signed in</h1>
        <p className="text-sm text-muted-foreground">Go back to the PropFlow app to continue. If your browser asks, allow it to open PropFlow. You can close this tab.</p>
      </div>
      <Button className="w-full" leftIcon="external-link-line" nativeButton={false} render={<a href={link} />}>
        Open PropFlow
      </Button>
    </div>
  )
}
