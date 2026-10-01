"use client"

import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cn } from "cn"

import { toggleVariants } from "@/components/ui/toggle"
import { Icon } from "./icon"

const ToggleGroupContext = React.createContext({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
})

function BaseToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{
        "--gap": spacing
      }}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] rounded-lg data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-vertical:flex-col data-vertical:items-stretch",
        className
      )}
      {...props}>
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}>
      {children}
    </TogglePrimitive>
  );
}

// Single-choice segmented control, same height as other form controls.
// options: [{ value, label, icon? }]; iconOnly hides labels (kept as aria-label);
// responsiveLabels shows labels from xl up and icons only below
function ToggleGroup({ options = [], value, onChange, iconOnly = false, responsiveLabels = false, className, ...props }) {
  return (
    <BaseToggleGroup
      value={[value]}
      onValueChange={(next) => next.length && onChange?.(next[0])}
      spacing={0}
      className={cn("h-control gap-0.5 rounded-md border bg-muted/60 p-0.5", className)}
      {...props}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          aria-label={o.label}
          title={iconOnly || responsiveLabels ? o.label : undefined}
          className="h-full cursor-pointer rounded-[calc(var(--radius)-2px)]! border-0 px-2.5 text-muted-foreground data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
        >
          {o.icon && <Icon name={o.icon} className="text-base" />}
          {!iconOnly && <span className={responsiveLabels ? "sr-only xl:not-sr-only" : undefined}>{o.label}</span>}
        </ToggleGroupItem>
      ))}
    </BaseToggleGroup>
  )
}

export { ToggleGroup, BaseToggleGroup, ToggleGroupItem }
