"use client"

import { useId } from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { Icon } from "./icon"
import { Label } from "./label"

const BaseSelect = SelectPrimitive.Root

function SelectGroup({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props} />
  );
}

function SelectValue({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props} />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit cursor-pointer items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-0 pr-2 pl-3 text-sm shadow-xs whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-control data-[size=sm]:h-control-sm data-[size=lg]:h-control-lg *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}>
      {children}
      <SelectPrimitive.Icon className="flex">
        <Icon name="arrow-down-s-line" className="pointer-events-none text-base text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}>
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props} />
  );
}

function SelectItem({
  className,
  children,
  ...props
}) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}>
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span
            className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }>
        <Icon name="check-line" className="pointer-events-none text-base" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props} />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}>
      <Icon name="arrow-up-s-line" className="text-base" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}>
      <Icon name="arrow-down-s-line" className="text-base" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

// options: [{ value, label, icon? }]; value "" shows the placeholder (use for "All")
function Select({
  options = [],
  value,
  onChange,
  placeholder = "Select…",
  label,
  error,
  required = false,
  size = "default",
  className,
  triggerClassName,
  "aria-label": ariaLabel,
  ...props
}) {
  const selected = options.find((o) => o.value === value)
  // The trigger is a button: name it by the label and its current value ("Country, Pakistan")
  const id = useId()

  return (
    <div className={className}>
      {label && (
        <Label id={`${id}-label`} className="mb-0.5 text-base text-muted-foreground">
          {label}
          {required && <span className="text-sm text-destructive">*</span>}
        </Label>
      )}
      <BaseSelect
        items={options}
        value={value}
        onValueChange={(next) => onChange?.(next)}
        {...props}
      >
        <SelectTrigger
          id={`${id}-trigger`}
          size={size}
          aria-invalid={!!error}
          aria-label={label ? undefined : ariaLabel}
          aria-labelledby={label ? `${id}-label ${id}-trigger` : undefined}
          className={cn("w-full", triggerClassName)}
        >
          <SelectValue>
            {() =>
              selected && selected.value !== "" ? (
                <>
                  {selected.icon && <Icon name={selected.icon} className="text-base text-muted-foreground" />}
                  {selected.label}
                </>
              ) : (
                <span className="text-muted-foreground">{selected?.label ?? placeholder}</span>
              )
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.icon && <Icon name={o.icon} className="text-base text-muted-foreground" />}
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </BaseSelect>
      {error && <div className="text-[13px] text-destructive">{error}</div>}
    </div>
  )
}

export {
  Select,
  BaseSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
