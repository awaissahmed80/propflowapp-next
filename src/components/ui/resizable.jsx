"use client"

import * as ResizablePrimitive from "react-resizable-panels"
import { cn } from "@/lib/utils"

// shadcn-style resizable panels (react-resizable-panels v4: Group / Panel / Separator).
// Sizes: numbers are pixels, strings are percentages ("30" = 30%).
//   <ResizablePanelGroup orientation="horizontal">
//     <ResizablePanel id="list" defaultSize="30" minSize="20">…</ResizablePanel>
//     <ResizableHandle withHandle />
//     <ResizablePanel id="detail">…</ResizablePanel>
//   </ResizablePanelGroup>
// The library sets an inline height/width of 100%; clear them so the size classes (h-full, or a
// fixed h-[calc(…)]) decide, otherwise a fixed height is ignored and panels stop scrolling.
function ResizablePanelGroup({ className, style, ...props }) {
  return (
    <ResizablePrimitive.Group data-slot="resizable-panel-group" className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)} style={{ height: undefined, width: undefined, ...style }} {...props} />
  )
}

function ResizablePanel({ ...props }) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

// A hairline you can drag (a wider invisible hit area); withHandle adds a small grip
function ResizableHandle({ withHandle, className, ...props }) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/handle relative flex w-px items-center justify-center bg-border outline-none transition-colors",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2",
        "hover:bg-primary/40 focus-visible:bg-primary/60 data-[separator=active]:bg-primary/60",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-2 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1.5 shrink-0 items-center justify-center rounded-full border bg-background shadow-xs transition-colors group-hover/handle:border-primary/40">
          <span className="h-3 w-px rounded-full bg-foreground/20" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
export { useDefaultLayout } from "react-resizable-panels"
