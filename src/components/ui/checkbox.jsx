"use client"

import { useId } from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { Icon } from "./icon"

function BaseCheckbox({
  className,
  indeterminate,
  ...props
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "peer relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-input shadow-xs transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground",
        className
      )}
      {...props}>
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none">
        <Icon name={indeterminate ? "subtract-line" : "check-line"} className="text-xs leading-none" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// <Checkbox checked onChange={(bool) => …} label="…" description="…" />
function Checkbox({ checked, onChange, label, description, disabled, className, checkboxClassName, ...props }) {
  // Base UI's checkbox isn't a native input, so the label and description are linked by id
  const id = useId()
  const box = (
    <BaseCheckbox
      checked={checked}
      onCheckedChange={(value) => onChange?.(Boolean(value))}
      disabled={disabled}
      className={checkboxClassName}
      aria-labelledby={label ? `${id}-label` : undefined}
      aria-describedby={description ? `${id}-desc` : undefined}
      {...props}
    />
  )
  if (!label) return <span className={cn("inline-flex", className)}>{box}</span>
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 text-sm select-none", disabled && "cursor-not-allowed opacity-60", className)}>
      <span className="mt-0.5 flex">{box}</span>
      <span className="leading-snug">
        <span id={`${id}-label`}>{label}</span>
        {description && (
          <span id={`${id}-desc`} className="block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}

export { Checkbox, BaseCheckbox }
