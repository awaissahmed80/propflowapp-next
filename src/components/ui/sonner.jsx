"use client"

import { Toaster as Sonner } from "sonner"
import { useTheme } from "@/components/theme-provider"
import { Icon } from "@/components/ui/icon"

// shadcn-style toasts (sonner), in the app's colors and theme. Mounted once in the root layout;
// anywhere in the app: import { toast } from "sonner"; toast.success("Saved.")
export function Toaster(props) {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      closeButton
      icons={{
        success: <Icon name="checkbox-circle-fill" className="text-base text-emerald-600 dark:text-emerald-400" />,
        error: <Icon name="error-warning-fill" className="text-base text-red-600 dark:text-red-400" />,
        info: <Icon name="information-fill" className="text-base text-primary" />,
        warning: <Icon name="alert-fill" className="text-base text-amber-500" />,
      }}
      style={{ "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)", "--normal-border": "var(--border)", "--border-radius": "var(--radius)" }}
      toastOptions={{ classNames: { toast: "font-sans shadow-lg", description: "text-muted-foreground" } }}
      {...props}
    />
  )
}
