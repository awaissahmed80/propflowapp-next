"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { ScrollView } from "@/components/ui/scroll-view"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { sendTestEmail } from "../server/actions"
import { Notice } from "./parts"

// One rendered email: how it looks in an inbox list, the message itself (in a sandboxed frame,
// always on white like a mail app), and the plain-text copy
export function EmailPreview({ name, email, canSend, myEmail }) {
  const [view, setView] = useState("html")
  const [notice, setNotice] = useState(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          value={view}
          onChange={setView}
          options={[
            { value: "html", label: "Email" },
            { value: "text", label: "Plain text" },
          ]}
        />
        {canSend && (
          <Button
            variant="outline"
            leftIcon="send-plane-line"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await sendTestEmail(name)
                setNotice(result.error ? { tone: "error", text: result.error } : { tone: "success", text: `Test sent to ${result.to}.` })
              })
            }
          >
            Send test to {myEmail}
          </Button>
        )}
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
        <div className="border-b px-4 py-3">
          <p className="text-xs text-muted-foreground">{name}.liquid · from PropFlow</p>
          <p className="mt-0.5 truncate font-medium">{email.subject}</p>
          {email.preheader && <p className="truncate text-sm text-muted-foreground">{email.preheader}</p>}
        </div>
        {view === "html" ? (
          <iframe title={`${email.subject} preview`} srcDoc={email.html} sandbox="" className="block h-[46rem] w-full bg-white" />
        ) : (
          <ScrollView className="max-h-[46rem]">
            <pre className="p-5 text-sm whitespace-pre-wrap">{email.text}</pre>
          </ScrollView>
        )}
      </div>
    </div>
  )
}
