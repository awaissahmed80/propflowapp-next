"use client"

import { useId, forwardRef } from "react"
import { cn } from "cn"
import { Label } from "./label"

function BaseTextarea({
  className,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props} />
  );
}

// Same label / required / error API as Input
const Textarea = forwardRef(function Textarea({ label, error, required = false, className, id, ...props }, ref) {
  // Label and error are tied to the field so screen readers announce them
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div>
      {label && (
        <Label htmlFor={fieldId} className="mb-0.5 flex flex-row items-center text-base text-muted-foreground">
          {label}
          {required && <span className="text-sm text-destructive">*</span>}
        </Label>
      )}
      <BaseTextarea
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={className}
        {...props}
      />
      {error && (
        <div id={`${fieldId}-error`} className="text-[13px] text-destructive">
          {error}
        </div>
      )}
    </div>
  )
})

export { Textarea, BaseTextarea }
