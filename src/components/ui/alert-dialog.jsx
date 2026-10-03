"use client"

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"

// shadcn-style alert dialog (Base UI): a small centered box that needs an answer (no close
// button, Escape counts as Cancel). Used by the alert / confirm provider (components/alert-context).
//   <AlertDialog open onOpenChange tone="destructive" icon title description actions={…} />

const TONES = {
  default: "bg-primary/10 text-primary",
  destructive: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
}

export function AlertDialog({ open, onOpenChange, tone = "default", icon, title, description, children, actions, className }) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop className="fixed inset-0 isolate z-[60] bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 dark:bg-black/60" />
        <AlertDialogPrimitive.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-[60] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 text-sm text-foreground shadow-2xl shadow-black/20 duration-100 outline-none sm:max-w-md dark:border-white/10 dark:shadow-black/50 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
        >
          <div className="flex gap-4">
            {icon && (
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-xl", TONES[tone] ?? TONES.default)}>
                <Icon name={icon} />
              </span>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <AlertDialogPrimitive.Title className="text-base leading-snug font-semibold tracking-tight">{title}</AlertDialogPrimitive.Title>
              {description && <AlertDialogPrimitive.Description className="mt-1.5 text-sm text-pretty whitespace-pre-line text-muted-foreground">{description}</AlertDialogPrimitive.Description>}
              {children}
            </div>
          </div>
          {actions && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
