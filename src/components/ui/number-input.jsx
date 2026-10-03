"use client"

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { cn } from "cn"
import { cva } from "class-variance-authority"
import { Icon } from "./icon"
import { Label } from "./label"
import { Tooltip } from "./tooltip"

const numberInputVariants = cva(
  cn(
    "flex items-stretch overflow-hidden rounded-md border border-input bg-transparent text-sm shadow-xs transition-[color,box-shadow] dark:bg-input/20",
    "has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
    "has-[input[aria-invalid='true']]:border-destructive has-[input[aria-invalid='true']]:ring-destructive/20",
    "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50",
  ),
  {
    variants: {
      size: {
        default: "h-control",
        sm: "h-control-sm",
        lg: "h-control-lg",
      },
    },
    defaultVariants: { size: "default" },
  },
)

const stepButton =
  "flex flex-1 cursor-pointer items-center justify-center text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40"

// General numeric field (amounts, percentages, rates) with stacked up/down steppers at the end.
// value is a number or null; onChange(number | null). `format` takes Intl.NumberFormat options.
// For item quantities use QuantityInput (− / + on both sides).
function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  label,
  info,
  error,
  required = false,
  prefix,
  suffix,
  size = "default",
  showSteppers = true,
  placeholder,
  disabled,
  className,
  inputClassName,
  "aria-label": ariaLabel,
  ...props
}) {
  return (
    <div className={className}>
      {label && (
        <Label className="mb-0.5 flex flex-row items-center text-base text-muted-foreground">
          {label}
          {info && (
            <Tooltip content={info} openOnClick>
              <button type="button" className="ms-1 text-muted-foreground/80 hover:text-muted-foreground" aria-label={info}>
                <Icon name="information-line" />
              </button>
            </Tooltip>
          )}
          {required && <span className="text-sm text-destructive">*</span>}
        </Label>
      )}
      <NumberFieldPrimitive.Root value={value ?? null} onValueChange={(next) => onChange?.(next)} min={min} max={max} step={step} format={format} locale="en-US" disabled={disabled} {...props}>
        <NumberFieldPrimitive.Group data-slot="number-input" className={numberInputVariants({ size })}>
          {prefix && <span className="flex items-center pl-3 text-muted-foreground select-none">{prefix}</span>}
          <NumberFieldPrimitive.Input
            aria-label={ariaLabel}
            aria-invalid={!!error}
            placeholder={placeholder}
            className={cn("h-full w-full min-w-0 bg-transparent px-3 text-right tabular-nums outline-0 placeholder:text-muted-foreground", prefix && "pl-2", inputClassName)}
          />
          {suffix && <span className="flex items-center pr-2 text-muted-foreground select-none">{suffix}</span>}
          {showSteppers && (
            <div className="flex w-7 shrink-0 flex-col border-l">
              <NumberFieldPrimitive.Increment aria-label="Increase" className={cn(stepButton, "border-b")}>
                <Icon name="arrow-up-s-line" className="text-sm leading-none" />
              </NumberFieldPrimitive.Increment>
              <NumberFieldPrimitive.Decrement aria-label="Decrease" className={stepButton}>
                <Icon name="arrow-down-s-line" className="text-sm leading-none" />
              </NumberFieldPrimitive.Decrement>
            </div>
          )}
        </NumberFieldPrimitive.Group>
      </NumberFieldPrimitive.Root>
      {error && <div className="text-[13px] text-destructive">{error}</div>}
    </div>
  )
}

export { NumberInput, numberInputVariants }
