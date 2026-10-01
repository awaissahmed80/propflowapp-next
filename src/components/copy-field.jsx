"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/ui/icon"

// A read-only field with a copy button inside, for links and codes people share
//   <CopyField label="Invitation link" value={url} />
export function CopyField({ value, label, ...props }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Older browsers: select the text so Ctrl/Cmd+C works
      document.getElementById(props.id ?? "")?.select()
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Input
      label={label}
      aria-label={label ? undefined : "Link"}
      value={value}
      readOnly
      onFocus={(e) => e.target.select()}
      startElement={<Icon name="link" />}
      endElement={
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy"}
          className="mr-1 flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name={copied ? "check-line" : "file-copy-line"} className="text-sm" />
          {copied ? "Copied" : "Copy"}
        </button>
      }
      {...props}
    />
  )
}
