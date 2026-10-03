"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { ScrollView } from "@/components/ui/scroll-view"

function BaseDialog({ ...props }) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/40 duration-100 supports-backdrop-filter:backdrop-blur-[2px] dark:bg-black/60 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({ className, children, showCloseButton = true, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-4 text-sm text-foreground shadow-2xl shadow-black/20 duration-100 dark:border-white/10 dark:shadow-black/50 outline-none sm:max-w-lg data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" render={<Button variant="ghost" className="absolute top-3 right-3" size="icon" />}>
            <Icon name="close-line" className="text-lg" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }) {
  return (
    <div
      data-slot="dialog-header"
      // Full-width band with a divider, mirroring the footer; room on the right for the close button
      className={cn("-mx-4 -mt-4 flex flex-col gap-1 border-b px-4 pt-4 pb-3.5 pr-12", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, showCloseButton = false, children, ...props }) {
  return (
    <div data-slot="dialog-footer" className={cn("-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/60 px-4 py-3 sm:flex-row sm:justify-end dark:bg-black/15", className)} {...props}>
      {children}
      {showCloseButton && <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>}
    </div>
  )
}

function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-lg leading-snug font-semibold tracking-tight", className)} {...props} />
}

function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground", className)} {...props} />
}

// <Dialog open onOpenChange title description footer={<Buttons/>}>body</Dialog>
// <Dialog open onOpenChange title description footer className>body</Dialog>
// headerActions: icon buttons shown in the header row beside the close button.
// scrollable: for long content. The dialog never grows past the screen; the header and footer
// stay put and only the body scrolls (in a ScrollView, scrollbar at the dialog's edge).
function Dialog({ open, onOpenChange, title, description, footer, headerActions, children, className, scrollable = false, bodyClassName, ...props }) {
  // headerActions: small buttons in the header row, just left of the close button
  const header = (title || description || headerActions) && (
    <DialogHeader className={cn(scrollable && "shrink-0", headerActions && "flex-row items-start gap-3")}>
      {headerActions ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          <div className="-mt-1 flex shrink-0 items-center gap-0.5">{headerActions}</div>
        </>
      ) : (
        <>
          {title && <DialogTitle>{title}</DialogTitle>}
          {description && <DialogDescription>{description}</DialogDescription>}
        </>
      )}
    </DialogHeader>
  )
  return (
    <BaseDialog open={open} onOpenChange={onOpenChange} {...props}>
      <DialogContent className={cn(scrollable && "flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden", className)}>
        {header}
        {scrollable ? (
          <ScrollView className="-mx-4 min-h-0 flex-1" viewportClassName={cn("space-y-4 px-4 py-1", bodyClassName)}>
            {children}
          </ScrollView>
        ) : (
          children
        )}
        {footer && <DialogFooter className={scrollable ? "shrink-0" : undefined}>{footer}</DialogFooter>}
      </DialogContent>
    </BaseDialog>
  )
}

export { Dialog, BaseDialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
