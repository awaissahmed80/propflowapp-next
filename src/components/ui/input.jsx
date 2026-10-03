"use client"

import { useId, useState, forwardRef } from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"
import { cva } from "class-variance-authority"
import { Label } from "./label"
import { Icon } from "./icon"
import { Tooltip } from "./tooltip"

const inputVariants = cva(
  cn(
    "flex items-center space-x-2 rounded-md border border-input bg-transparent dark:bg-input/20",
    "outline-0 px-3 py-0 pr-0 text-sm shadow-xs transition-[color,box-shadow]",
    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "has-[input:focus-within]:border-ring  has-[input:focus-within]:ring-ring/50 has-[input:focus-within]:ring-[1px]",
    "has-[input[aria-invalid='true']]:ring-destructive/20 dark:has-[input[aria-invalid='true']]:ring-destructive/40 has-[input[aria-invalid='true']]:border-destructive",
    // Read-only and disabled fields look toned down (read-only text can still be selected)
    "has-[input:read-only]:bg-secondary has-[input:read-only]:shadow-none",
    "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-60",
  ),
  {
    variants: {
      variant: {
        default: "",
        destructive: "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
      },
      size: {
        default: "h-control text-sm",
        sm: "h-control-sm text-sm",
        lg: "h-control-lg text-sm",
      },
    },
  },
)

const Input = forwardRef(function Input({ className, info, size = "default", variant = "default", required = false, error, label, startElement = null, endElement = null, type, id, ...props }, ref) {
  // The label and error are tied to the field so screen readers announce them
  const autoId = useId()
  const fieldId = id ?? autoId
  const errorId = `${fieldId}-error`
  return (
    <div>
      {label && (
        <Label htmlFor={fieldId} className="text-base mb-0.5 flex flex-row text-muted-foreground items-center">
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
      <div className={cn(inputVariants({ variant: error ? "destructive" : variant, size, className: "" }))}>
        {startElement && <div className="shrink-0 select-none text-base text-muted-foreground">{startElement}</div>}
        <InputPrimitive
          ref={ref}
          type={type}
          data-slot="input"
          id={fieldId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "min-w-0 grow h-full w-full",
            "block outline-0 text-sm read-only:cursor-default read-only:text-muted-foreground",
            "file:text-foreground placeholder:text-muted-foreground",
            "selection:bg-primary selection:text-primary-foreground",
            "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {endElement && <div className="shrink-0 select-none">{endElement}</div>}
      </div>
      {error && (
        <div id={errorId} className="text-destructive text-[13px]">
          {error}
        </div>
      )}
    </div>
  )
})

function PasswordInput({ className, label, error, startElement = null, ...props }) {
  const [show, setShow] = useState(false)

  return (
    <Input
      label={label}
      className={className}
      startElement={startElement}
      type={show ? "text" : "password"}
      error={error}
      endElement={
        <button
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          onClick={() => setShow(!show)}
          className="mr-2 flex items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name={show ? "eye-off-fill" : "eye-fill"} className={show ? "text-muted-foreground" : "text-muted-foreground/50"} />
        </button>
      }
      {...props}
    />
  )
}

Input.Password = PasswordInput
Input.displayName = "Input"
export { Input }
