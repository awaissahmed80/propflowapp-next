"use client"

import { useState } from "react"
import { siteUrl } from "@/lib/sites"
import { urlCode } from "@/lib/url"
import { IconButton } from "@/components/ui/icon-button"

// Where a lead form lives on the campaigns site, and the snippets to put it on a website
//   formLinks("my-workspace", "FRM-0001") → { hosted, script, iframe, ref }
export function formLinks(workspace, code) {
  const ref = `${String(workspace ?? "").toLowerCase()}/${urlCode(code)}`
  const hosted = siteUrl("campaigns", `/f/${ref}`)
  return {
    ref,
    hosted,
    script: `<div data-propflow-form="${ref}"></div>\n<script src="${siteUrl("campaigns", "/embed.js")}" async></script>`,
    iframe: (title) => `<iframe src="${hosted}?embed=1" title="${String(title ?? "Enquiry form").replace(/"/g, "&quot;")}" loading="lazy" style="width:100%;min-height:560px;border:0"></iframe>`,
  }
}

// A read-only code snippet (several lines) with a copy button
export function CodeField({ label, value, hint }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div>
      {label && <p className="mb-1 text-sm font-medium">{label}</p>}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-2">
        <code className="min-w-0 flex-1 px-1 py-1 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">{value}</code>
        <IconButton icon={copied ? "check-line" : "file-copy-line"} variant="ghost" size="sm" tooltip={copied ? "Copied" : "Copy"} onClick={copy} />
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
