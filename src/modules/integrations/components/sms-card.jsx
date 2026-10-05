"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatPkPhone } from "@/lib/phone"
import { timeAgo } from "@/lib/format"
import { toastAction } from "@/lib/toast-action"
import { confirm } from "@/components/alert-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { IconButton } from "@/components/ui/icon-button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Tabs } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AutomaticMessages, Templates } from "./sms-automation"
import { disconnectSmsGateway, newSmsWebhook, saveSmsGateway, sendTestSms } from "@/modules/settings/sms/actions"
import { integrationByKey } from "../catalog"
import { SMS_MAX, smsParts } from "../sms/text"
import { CardButton, IntegrationCard, cardOf } from "./card"

// SMS gateway card and its Configure modal: the workspace's own provider account (API key, sender
// name), the delivery-report address to paste into the provider's dashboard, a test SMS, and the
// latest messages with their delivery status.
//   sms: smsOverview() + canEdit (setup rights)

const PROVIDERS = [{ value: "veevo", label: "Veevo Tech" }]
const STATUS = { queued: ["gray", "Sending"], sent: ["blue", "Sent"], delivered: ["green", "Delivered"], failed: ["red", "Failed"] }

export function SmsCard({ sms }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const base = cardOf(integrationByKey("sms"))
  const refresh = () => router.refresh()

  const disconnect = async () => {
    if (
      !(await confirm({
        title: "Disconnect the SMS gateway?",
        description: "PropFlow stops sending SMS. Your provider account and the message log stay; you can connect again any time.",
        confirmLabel: "Disconnect",
        destructive: true,
        icon: "link-unlink",
      }))
    )
      return
    const r = await toastAction(() => disconnectSmsGateway(), { loading: "Disconnecting…", success: "SMS gateway disconnected." })
    if (r?.ok) refresh()
  }

  const card = !sms.connected ? (
    <IntegrationCard
      {...base}
      rows={[["Status", "Not connected"]]}
      status={{ tone: "gray", label: "Inactive" }}
      actions={
        sms.canEdit ? (
          <Button className="w-full bg-violet-600 text-white hover:bg-violet-600/90" leftIcon="message-2-line" onClick={() => setOpen(true)}>
            Connect SMS gateway
          </Button>
        ) : (
          <CardButton disabled>Ask an administrator</CardButton>
        )
      }
    />
  ) : (
    <IntegrationCard
      {...base}
      rows={[
        ["Provider", `${sms.providerName}${sms.sender ? ` · ${sms.sender}` : ""}`],
        ["Sent (30 days)", sms.last30.sent ? `${sms.last30.sent.toLocaleString("en-US")} · ${sms.last30.delivered.toLocaleString("en-US")} delivered` : "None yet"],
        ["Last sent", sms.lastAt ? timeAgo(sms.lastAt) : "Never"],
      ]}
      status={!sms.keyOk ? { tone: "red", label: "Needs attention: enter the API key again" } : !sms.verifiedAt ? { tone: "amber", label: "Connected · send a test SMS" } : { tone: "green", label: "Connected" }}
      actions={
        <>
          <CardButton onClick={() => setOpen(true)}>{sms.canEdit ? "Configure" : "View"}</CardButton>
          {sms.canEdit && (
            <CardButton className="text-red-600 hover:text-red-600 dark:text-red-400" onClick={disconnect}>
              Disconnect
            </CardButton>
          )}
        </>
      }
    />
  )
  return (
    <>
      {card}
      {open && <SmsConfigure sms={sms} onClose={() => setOpen(false)} onChanged={refresh} />}
    </>
  )
}

function SmsConfigure({ sms, onClose, onChanged }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-violet-600 text-base text-white">
            <Icon name="message-2-fill" />
          </span>
          SMS gateway
        </span>
      }
      description={
        sms.connected ? `${sms.providerName}${sms.sender ? ` · sender ${sms.sender}` : ""} · you pay your provider for the messages` : "Connect your own SMS provider account. You pay your provider for the messages."
      }
      scrollable
      className="sm:max-w-2xl"
      bodyClassName="space-y-4"
    >
      {sms.connected ? (
        <Tabs
          defaultValue={sms.canEdit && !sms.verifiedAt ? "account" : sms.canEdit ? "automatic" : "messages"}
          tabs={[
            ...(sms.canEdit
              ? [
                  {
                    value: "account",
                    label: "Account",
                    icon: "key-2-line",
                    content: (
                      <div className="space-y-6 pt-2">
                        <AccountForm sms={sms} onChanged={onChanged} />
                        <Webhook sms={sms} onChanged={onChanged} />
                        <TestSms onChanged={onChanged} />
                      </div>
                    ),
                  },
                  { value: "automatic", label: "Automatic messages", icon: "timer-flash-line", content: <AutomaticMessages sms={sms} onChanged={onChanged} /> },
                  { value: "templates", label: "Templates", icon: "file-text-line", content: <Templates sms={sms} onChanged={onChanged} /> },
                ]
              : []),
            { value: "messages", label: "Messages", icon: "chat-history-line", count: sms.log.length || null, content: <MessageLog log={sms.log} /> },
          ]}
        />
      ) : (
        sms.canEdit && <AccountForm sms={sms} onChanged={onChanged} />
      )}
    </Dialog>
  )
}

const Heading = ({ id, children }) => (
  <h3 id={id} className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
    {children}
  </h3>
)

function AccountForm({ sms, onChanged }) {
  const [draft, setDraft] = useState({ provider: sms.provider ?? "veevo", apiKey: "", sender: sms.sender ?? "" })
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()
  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }
  const save = () =>
    startTransition(async () => {
      const r = await toastAction(() => saveSmsGateway(draft), { loading: "Saving…", success: sms.connected ? "SMS gateway saved. Send a test SMS to check it." : "SMS gateway connected. Send a test SMS to check it." })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      if (r?.ok) {
        setDraft((d) => ({ ...d, apiKey: "" }))
        onChanged()
      }
    })
  return (
    <section aria-labelledby="sms-account" className="space-y-4">
      <Heading id="sms-account">Account</Heading>
      <Select label="Provider" value={draft.provider} onChange={(v) => set("provider", v)} options={PROVIDERS} />
      <Input.Password
        label="API key"
        autoComplete="off"
        placeholder={sms.connected && sms.keyOk ? "Saved. Leave empty to keep it" : "From the VT OneID portal › Manage API"}
        value={draft.apiKey}
        onChange={(e) => set("apiKey", e.target.value)}
        error={errors.apiKey}
      />
      <div>
        <Input label="Sender name" placeholder="e.g. SKYLINE" value={draft.sender} onChange={(e) => set("sender", e.target.value)} error={errors.sender} />
        <p className="mt-1 text-xs text-muted-foreground">Your approved sender name (mask). Leave empty to use the provider&apos;s default.</p>
      </div>
      <div className="flex justify-end">
        <Button loading={pending} onClick={save}>
          {sms.connected ? "Save" : "Connect"}
        </Button>
      </div>
    </section>
  )
}

// The delivery-report address to paste into the provider's dashboard
function Webhook({ sms, onChanged }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sms.webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  const regenerate = async () => {
    if (!(await confirm({ title: "Make a new delivery-report address?", description: "The current address stops working. Paste the new one into your provider's dashboard.", confirmLabel: "Make new address" }))) return
    const r = await toastAction(() => newSmsWebhook(), { loading: "Saving…", success: "New address made. Update it in your provider's dashboard." })
    if (r?.ok) onChanged()
  }
  return (
    <section aria-labelledby="sms-dlr" className="space-y-2">
      <Heading id="sms-dlr">Delivery reports</Heading>
      <p className="text-sm text-muted-foreground">In the VT OneID portal go to Manage API › Manage Webhook › Add Webhook URL, and paste this address. PropFlow then shows when each SMS reaches the phone.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">{sms.webhookUrl}</code>
        <IconButton icon={copied ? "check-line" : "file-copy-line"} variant="outline" tooltip={copied ? "Copied" : "Copy address"} onClick={copy} />
        {sms.canEdit && <IconButton icon="refresh-line" variant="ghost" tooltip="Make a new address" onClick={regenerate} />}
      </div>
    </section>
  )
}

function TestSms({ onChanged }) {
  const [to, setTo] = useState("")
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  const p = smsParts(text)
  const send = () =>
    startTransition(async () => {
      const r = await toastAction(() => sendTestSms({ to, text }), { loading: "Sending…", success: "Test SMS sent. It should arrive in a few seconds." })
      if (r?.ok) onChanged()
    })
  return (
    <section aria-labelledby="sms-test" className="space-y-3">
      <Heading id="sms-test">Send a test SMS</Heading>
      <Input label="Mobile number" inputMode="tel" placeholder="0300 1234567" value={to} onChange={(e) => setTo(e.target.value)} />
      <div>
        <Textarea label="Message (optional)" rows={2} maxLength={SMS_MAX} placeholder="Test from PropFlow: … can now send SMS." value={text} onChange={(e) => setText(e.target.value)} />
        {text && (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {p.chars} characters · {p.parts} {p.parts === 1 ? "SMS" : "SMS parts"}
            {p.unicode ? " · Urdu / special characters (70 per SMS)" : ""}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <Button leftIcon="send-plane-line" loading={pending} disabled={!to.trim()} onClick={send}>
          Send test
        </Button>
      </div>
    </section>
  )
}

function MessageLog({ log }) {
  return (
    <section aria-labelledby="sms-log">
      <Heading id="sms-log">Latest messages</Heading>
      {log.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">No SMS sent yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {log.map((m) => {
            const [color, label] = STATUS[m.status] ?? STATUS.queued
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="flex items-center gap-2 font-medium tabular-nums">
                    {formatPkPhone(m.toPhone)}
                    {m.kind === "test" && <Badge color="gray">Test</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground" title={m.body}>
                    {m.body}
                  </span>
                  {m.error && <span className="block text-xs text-red-600 dark:text-red-400">{m.error}</span>}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {m.parts} {m.parts === 1 ? "part" : "parts"}
                </span>
                <Badge color={color}>{label}</Badge>
                <span className="w-20 text-right text-xs text-muted-foreground">{timeAgo(m.createdAt)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
