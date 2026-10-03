"use client"

import { useState, useTransition } from "react"
import { toastAction } from "@/lib/toast-action"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { createForm } from "../server/form-actions"

// Name a new lead form and link it to a campaign (and its project); the builder opens next
//   campaigns: campaignOptions() · projects: projectOptions() · onCreated(code)
export function FormNewDialog({ campaigns = [], projects = [], campaign: initialCampaign = "", onClose, onCreated }) {
  const [name, setName] = useState("")
  const [campaign, setCampaign] = useState(initialCampaign)
  const [project, setProject] = useState(() => campaigns.find((c) => c.value === initialCampaign)?.project ?? "")
  const [errors, setErrors] = useState({})
  const [pending, startTransition] = useTransition()

  const submit = (e) => {
    e?.preventDefault()
    if (!name.trim()) return setErrors({ name: "Give the form a name." })
    startTransition(async () => {
      const r = await toastAction(() => createForm({ name, campaign: campaign || null, project: project || null }), { loading: "Creating form…", success: "Form created." })
      if (r?.fieldErrors) setErrors(r.fieldErrors)
      else if (r?.ok) onCreated(r.code)
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New lead form"
      description="Starts with name, mobile and consent. Add more questions in the builder."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button leftIcon="add-line" loading={pending} onClick={submit}>
            Create form
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Form name"
          required
          autoFocus
          placeholder="e.g. Phase 2 launch enquiry"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setErrors((x) => ({ ...x, name: undefined }))
          }}
          error={errors.name}
        />
        <Select
          label="Campaign"
          value={campaign}
          error={errors.campaign}
          onChange={(v) => {
            setCampaign(v)
            const p = campaigns.find((c) => c.value === v)?.project
            if (p) setProject(p)
          }}
          options={[{ value: "", label: "No campaign (e.g. website contact form)" }, ...campaigns.map((c) => ({ value: c.value, label: c.label }))]}
        />
        <Select label="Project" value={project} onChange={setProject} options={[{ value: "", label: "Any project" }, ...projects.map((p) => ({ value: p.code, label: p.name }))]} />
      </form>
    </Dialog>
  )
}
