"use client"

import { useContext, useId } from "react"
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from "input-otp"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"
import { Label } from "./label"

// shadcn/ui InputOTP (base-nova), on the input-otp package. One hidden input drives the
// slots, so paste, autofill of one-time codes and screen readers all work.
function InputOTP({ className, containerClassName, ...props }) {
  return <OTPInput data-slot="input-otp" containerClassName={cn("flex items-center gap-2 has-disabled:opacity-50", containerClassName)} className={cn("disabled:cursor-not-allowed", className)} {...props} />
}

function InputOTPGroup({ className, ...props }) {
  return <div data-slot="input-otp-group" className={cn("flex items-center", className)} {...props} />
}

// masked: show a dot instead of the digit (passcodes)
function InputOTPSlot({ index, masked = false, className, ...props }) {
  const context = useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = context?.slots[index] ?? {}
  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex size-11 items-center justify-center border-y border-r border-input text-lg font-medium shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md dark:bg-input/30",
        "aria-invalid:border-destructive data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50",
        "data-[active=true]:aria-invalid:border-destructive data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      {char && (masked ? <span className="size-2.5 rounded-full bg-foreground" /> : char)}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator(props) {
  return (
    <div data-slot="input-otp-separator" role="separator" className="text-muted-foreground" {...props}>
      <Icon name="subtract-line" />
    </div>
  )
}

// Labeled digits-only code field: verification codes (split 3–3 when 6 long) and passcodes
// (masked). onComplete fires once every slot is filled.
// fill: label on the left and the boxes stretched to the full width (lines up with buttons below)
function OtpField({ label, length = 6, value, onChange, onComplete, masked = false, fill = false, error, autoFocus, disabled, className }) {
  const id = useId()
  const split = !masked && length === 6
  const slotClass = fill ? "h-12 w-auto min-w-0 flex-1" : undefined
  const slot = (i) => <InputOTPSlot key={i} index={i} masked={masked} aria-invalid={!!error} className={slotClass} />
  const group = (indexes) => <InputOTPGroup className={fill ? "min-w-0 flex-1" : undefined}>{indexes.map(slot)}</InputOTPGroup>
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={id} className={cn("mb-1.5 text-base text-muted-foreground", !fill && "justify-center")}>
          {label}
        </Label>
      )}
      <InputOTP
        id={id}
        maxLength={length}
        pattern={REGEXP_ONLY_DIGITS}
        // Codes are often copied as "123 456" or with words around them: keep just the digits
        pasteTransformer={(text) => text.replace(/\D/g, "").slice(0, length)}
        inputMode="numeric"
        autoComplete={masked ? "off" : "one-time-code"}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        containerClassName={fill ? "w-full" : "justify-center"}
      >
        {split ? (
          <>
            {group([0, 1, 2])}
            <InputOTPSeparator />
            {group([3, 4, 5])}
          </>
        ) : (
          group(Array.from({ length }, (_, i) => i))
        )}
      </InputOTP>
      {error && (
        <p id={`${id}-error`} className={cn("mt-1.5 text-[13px] text-destructive", !fill && "text-center")}>
          {error}
        </p>
      )}
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator, OtpField }
