"use client"

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { cn } from "cn"

// shadcn-style scroll container: native scrolling with a thin themed scrollbar that
// fades in while hovering or scrolling. Use for every scrolling panel instead of
// overflow-auto.
//
// Size it on the root (className): a fixed height (h-80, flex-1 min-h-0) or a max
// height (max-h-96) both work; the viewport inherits the max height.
//   <ScrollView className="max-h-96">…</ScrollView>
//   <ScrollView orientation="both" className="h-64">…wide table…</ScrollView>
function ScrollView({
  className,
  viewportClassName,
  viewportRef,
  orientation = "vertical",
  children,
  ...props
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-view"
      className={cn("relative flex flex-col overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-view-viewport"
        className={cn(
          "size-full max-h-[inherit] min-h-0 flex-1 overscroll-contain rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar orientation="vertical" />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({ className, orientation = "vertical", ...props }) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-view-scrollbar"
      orientation={orientation}
      className={cn(
        "z-10 flex touch-none p-px opacity-0 transition-opacity duration-200 select-none",
        "data-hovering:opacity-100 data-scrolling:opacity-100 data-scrolling:duration-0",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5",
        "data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-view-thumb"
        className="relative flex-1 rounded-full bg-foreground/20 transition-colors hover:bg-foreground/35"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollView, ScrollBar }
