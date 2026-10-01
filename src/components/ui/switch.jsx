"use client"

import { useId } from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function BaseSwitch({ className, size = "default", ...props }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

// <Switch checked onChange={(bool) => …} label="…" description="…" />, same API as Checkbox
function Switch({ checked, onChange, label, description, disabled, className, switchClassName, size, ...props }) {
  const id = useId()
  const toggle = (
    <BaseSwitch
      checked={checked}
      onCheckedChange={(value) => onChange?.(Boolean(value))}
      disabled={disabled}
      size={size}
      className={switchClassName}
      aria-labelledby={label ? `${id}-label` : undefined}
      aria-describedby={description ? `${id}-desc` : undefined}
      {...props}
    />
  )
  if (!label) return toggle
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-3 text-sm select-none", disabled && "cursor-not-allowed opacity-60", className)}>
      <span className="min-w-0 leading-snug">
        <span id={`${id}-label`}>{label}</span>
        {description && (
          <span id={`${id}-desc`} className="block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <span className="mt-0.5 flex">{toggle}</span>
    </label>
  )
}

export { Switch, BaseSwitch }
