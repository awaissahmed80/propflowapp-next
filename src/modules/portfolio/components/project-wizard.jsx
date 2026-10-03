"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { LookupSelect } from "@/modules/lookups/components/lookup-select"
import { useList } from "@/modules/lookups/context"
import { Notice } from "@/modules/users/components/user-parts"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
import { DatePicker } from "@/components/ui/datetimepicker"
import { Dialog } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup } from "@/components/ui/toggle-group"
import { PROJECT_COLORS } from "../constants"
import { projectHref } from "../links"
import { saveProject } from "../server/projects"

// New project / edit project, as a four-step wizard in a dialog:
//   1 Basics  2 Location & approval  3 Phases & blocks  4 Timeline & details
// Each step checks its own fields before moving on; server errors jump back to their step.

const STEPS = [
  { key: "basics", title: "Basics", text: "Name, code and what kind of project it is", icon: "community-line" },
  { key: "location", title: "Location & approval", text: "Where it is, how big, and its approval", icon: "map-pin-2-line" },
  { key: "phases", title: "Phases & blocks", text: "How the project is divided for inventory", icon: "stack-line" },
  { key: "details", title: "Timeline & details", text: "Dates, description and amenities", icon: "calendar-2-line" },
]

// Which step a field belongs to
const STEP_OF = (field) => (field.startsWith("phases") ? 2 : ["launchDate", "possessionDate", "description", "amenities"].includes(field) ? 3 : ["name", "code", "type", "status", "color"].includes(field) ? 0 : 1)

const AMENITY_IDEAS = [
  "Gated community",
  "24/7 security",
  "Mosque",
  "Park",
  "School",
  "Hospital",
  "Commercial area",
  "Underground electricity",
  "Sui gas",
  "Water filtration",
  "Community center",
  "Gym",
  "Wide roads",
  "Graveyard",
]

const toDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "")
let seq = 0
const key = () => `n${++seq}`
const newBlock = (name, category) => ({ key: key(), id: null, name, category, hasUnits: false })
const newPhase = (n, d) => ({ key: key(), id: null, name: `Phase ${n}`, stage: d.stage, status: d.status, launchDate: "", possessionDate: "", showDates: false, blocks: [newBlock("Block A", d.category)] })

// Suggested code from the name: "Skyline Enclave" → SE, "Gulberg" → GUL
const suggestCode = (name) => {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ""
  const code =
    words.length === 1
      ? words[0].slice(0, 3)
      : words
          .map((w) => w[0])
          .join("")
          .slice(0, 4)
  return code.length >= 2 ? code : words[0].slice(0, 3)
}

function fromProject(p) {
  return {
    name: p.name,
    code: p.code,
    type: p.type,
    status: p.status,
    color: p.color,
    city: p.city ?? "",
    location: p.location,
    authority: p.authority ?? "",
    approval: p.approval,
    nocNumber: p.nocNumber ?? "",
    totalArea: Number(p.totalArea),
    areaUnit: p.areaUnit,
    marlaSqft: String(Number(p.marlaSqft)),
    launchDate: toDate(p.launchDate),
    possessionDate: toDate(p.possessionDate),
    description: p.description ?? "",
    amenities: p.amenities ?? [],
    phases: p.phases.map((ph) => ({
      key: `ph${ph.id}`,
      id: ph.id,
      name: ph.name,
      stage: ph.stage,
      status: ph.status,
      launchDate: toDate(ph.launchDate),
      possessionDate: toDate(ph.possessionDate),
      showDates: Boolean(ph.launchDate || ph.possessionDate),
      blocks: ph.blocks.map((b) => ({ key: `b${b.id}`, id: b.id, name: b.name, category: b.category, hasUnits: b.hasUnits })),
    })),
  }
}

// Numbered steps along the top; finished steps can be revisited
function Stepper({ step, maxStep, onGo }) {
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const state = i === step ? "current" : i < step || i <= maxStep ? "done" : "todo"
        return (
          <li key={s.key}>
            <button
              type="button"
              disabled={state === "todo"}
              onClick={() => onGo(i)}
              className={cn("group flex w-full cursor-pointer flex-col gap-1.5 text-left outline-none disabled:cursor-default", state === "todo" && "opacity-60")}
            >
              <span className={cn("h-1 rounded-full", state === "current" ? "bg-primary" : state === "done" ? "bg-primary/40" : "bg-muted")} />
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                    state === "current" ? "bg-primary text-primary-foreground" : state === "done" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {state === "done" && i !== step ? <Icon name="check-line" /> : i + 1}
                </span>
                <span className={cn("truncate", state === "current" ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{s.title}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// A card per option (project type, approval), with its icon
function ChoiceCards({ options, map, value, onChange, columns = "sm:grid-cols-3" }) {
  return (
    <div role="radiogroup" className={cn("grid grid-cols-2 gap-2", columns)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-primary bg-primary/5 font-medium text-foreground ring-1 ring-primary" : "border-input text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {map[o.value]?.icon && <Icon name={map[o.value].icon} className={cn("text-lg", on ? "text-primary" : "")} />}
            <span className="min-w-0 truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Hint({ children }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

// Amenities as chips: type and press Enter, or pick a suggestion
function AmenitiesField({ value, onChange }) {
  const [draft, setDraft] = useState("")
  const add = (a) => {
    const t = a.trim()
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t])
    setDraft("")
  }
  const ideas = AMENITY_IDEAS.filter((a) => !value.some((v) => v.toLowerCase() === a.toLowerCase()))
  return (
    <div className="space-y-2">
      <Input
        label="Amenities"
        placeholder="Type one and press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            add(draft)
          }
          if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1))
        }}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs font-medium text-primary">
              {a}
              <button type="button" aria-label={`Remove ${a}`} onClick={() => onChange(value.filter((v) => v !== a))} className="flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-primary/20">
                <Icon name="close-line" className="text-[11px]" />
              </button>
            </span>
          ))}
        </div>
      )}
      {ideas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Add:</span>
          {ideas.slice(0, 8).map((a) => (
            <button key={a} type="button" onClick={() => add(a)} className="cursor-pointer rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary">
              + {a}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProjectWizard({ project, onClose }) {
  const router = useRouter()
  const types = useList("project-type")
  const statuses = useList("project-status")
  const approvals = useList("approval-status")
  const authorities = useList("authority")
  const stages = useList("phase-stage")
  const categories = useList("block-category")
  const cities = useList("city")
  const marlas = useList("marla-size")

  const pick = (list) => list.defaultValue ?? list.options[0]?.value ?? ""
  const defaults = { stage: pick(stages), status: pick(statuses), category: pick(categories) }
  const [form, setForm] = useState(() =>
    project
      ? fromProject(project)
      : {
          name: "",
          code: "",
          type: pick(types),
          status: pick(statuses),
          color: PROJECT_COLORS[0],
          city: cities.defaultValue ?? "",
          location: "",
          authority: authorities.defaultValue ?? "",
          approval: pick(approvals),
          nocNumber: "",
          totalArea: null,
          areaUnit: "kanal",
          marlaSqft: pick(marlas),
          launchDate: "",
          possessionDate: "",
          description: "",
          amenities: [],
          phases: [newPhase(1, defaults)],
        },
  )
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(project ? STEPS.length - 1 : 0)
  const [codeTouched, setCodeTouched] = useState(Boolean(project))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const lockedCode = Boolean(project && project.stats.total > 0)
  const last = step === STEPS.length - 1

  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v, ...(k === "name" && !codeTouched ? { code: suggestCode(v) } : {}) }))
    setErrors((e) => ({ ...e, [k]: undefined, ...(k === "name" && !codeTouched ? { code: undefined } : {}) }))
  }
  const setPhase = (i, patch) => setForm((f) => ({ ...f, phases: f.phases.map((p, k) => (k === i ? { ...p, ...patch } : p)) }))
  const setBlock = (i, j, patch) => setForm((f) => ({ ...f, phases: f.phases.map((p, k) => (k === i ? { ...p, blocks: p.blocks.map((b, m) => (m === j ? { ...b, ...patch } : b)) } : p)) }))

  // This step's required fields, checked before moving on
  const check = (s) => {
    const e = {}
    if (s === 0) {
      if (form.name.trim().length < 2) e.name = "Project name is required."
      if (!/^[A-Z0-9]{2,6}$/.test(form.code)) e.code = "Use 2–6 letters or digits, e.g. SKE."
    }
    if (s === 1) {
      if (form.location.trim().length < 3) e.location = "Address is required."
      if (!(form.totalArea > 0)) e.totalArea = "Enter the total land area."
      if (form.approval === "approved" && !form.nocNumber.trim()) e.nocNumber = "Approved projects need their NOC / LOP number."
    }
    if (s === 2)
      form.phases.forEach((ph, i) => {
        if (!ph.name.trim()) e[`phases.${i}.name`] = "Phase name is required."
        const names = ph.blocks.map((b) => b.name.trim().toLowerCase())
        ph.blocks.forEach((b, j) => {
          if (!b.name.trim()) e[`phases.${i}.blocks.${j}.name`] = "Name it."
          else if (names.indexOf(b.name.trim().toLowerCase()) !== j) e[`phases.${i}.blocks.${j}.name`] = "Already used."
        })
        if (ph.launchDate && ph.possessionDate && ph.possessionDate < ph.launchDate) e[`phases.${i}.possessionDate`] = "Possession can't be before launch."
      })
    if (s === 3 && form.launchDate && form.possessionDate && form.possessionDate < form.launchDate) e.possessionDate = "Possession can't be before launch."
    setErrors(e)
    return !Object.keys(e).length
  }

  const go = (to) => {
    setError("")
    if (to > step && !check(step)) return
    setStep(to)
    setMaxStep((m) => Math.max(m, to))
  }

  const submit = () => {
    for (let s = 0; s < STEPS.length; s++)
      if (!check(s)) {
        setStep(s)
        return
      }
    startTransition(async () => {
      setError("")
      const payload = { ...form, phases: form.phases.map((ph) => ({ ...ph, blocks: ph.blocks.map(({ id, name, category }) => ({ id, name: name.trim(), category })) })) }
      const result = await saveProject(payload, project?.code)
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        setStep(Math.min(...Object.keys(result.fieldErrors).map(STEP_OF)))
        setError("Please fix the highlighted fields.")
      } else if (result.error) setError(result.error)
      else if (project && result.code === project.code) {
        onClose()
        router.refresh()
      } else router.push(projectHref(result.code))
    })
  }

  const err = (k) => errors[k]

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      className="sm:max-w-[min(56rem,calc(100%-4rem))]"
      scrollable
      bodyClassName="space-y-5"
      title={project ? `Edit ${project.name}` : "New project"}
      description={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step].text}`}
      footer={
        <>
          {step > 0 ? (
            <Button variant="outline" leftIcon="arrow-left-line" onClick={() => go(step - 1)} className="mr-auto">
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose} className="mr-auto">
              Cancel
            </Button>
          )}
          {project && !last && (
            <Button variant="ghost" loading={pending} onClick={submit}>
              Save changes
            </Button>
          )}
          {last ? (
            <Button leftIcon="check-line" loading={pending} onClick={submit}>
              {project ? "Save changes" : "Create project"}
            </Button>
          ) : (
            <Button rightIcon="arrow-right-line" onClick={() => go(step + 1)}>
              Next
            </Button>
          )}
        </>
      }
    >
      <Stepper step={step} maxStep={maxStep} onGo={go} />
      {error && <Notice tone="error">{error}</Notice>}

      {step === 0 && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Input label="Project name" required autoFocus value={form.name} onChange={(e) => set("name")(e.target.value)} error={err("name")} placeholder="e.g. Skyline Enclave" />
            <Input
              label="Code"
              required
              maxLength={6}
              disabled={lockedCode}
              value={form.code}
              onChange={(e) => {
                setCodeTouched(true)
                set("code")(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }}
              error={err("code")}
              info={lockedCode ? "Fixed once the project has inventory" : "Used in links, unit codes and file numbers"}
              placeholder="SKE"
            />
          </div>
          {form.code && /^[A-Z0-9]{2,6}$/.test(form.code) && (
            <Hint>
              Units will be numbered <span className="font-mono">{form.code}-0001</span>, files <span className="font-mono">{form.code}-F-1001</span>.
            </Hint>
          )}
          <div className="space-y-1.5">
            <p className="text-base text-muted-foreground">Project type</p>
            <ChoiceCards options={types.options} map={types.map} value={form.type} onChange={set("type")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Status" value={form.status} onChange={set("status")} options={statuses.options} error={err("status")} />
            <ColorPicker label="Color" value={form.color} onChange={set("color")} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <LookupSelect list="city" label="City" value={form.city} onChange={set("city")} />
            <div className="sm:col-span-2">
              <Input label="Address" required value={form.location} onChange={(e) => set("location")(e.target.value)} error={err("location")} placeholder="Main Raiwind Road, Lahore" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <NumberInput label="Total land area" required min={0} value={form.totalArea} onChange={set("totalArea")} error={err("totalArea")} />
                <ToggleGroup
                  value={form.areaUnit}
                  onChange={set("areaUnit")}
                  options={[
                    { value: "kanal", label: "Kanal" },
                    { value: "marla", label: "Marla" },
                    { value: "acre", label: "Acre" },
                  ]}
                />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-base text-muted-foreground">Marla size</p>
              <ToggleGroup value={form.marlaSqft} onChange={set("marlaSqft")} options={marlas.options.map((o) => ({ value: o.value, label: `${o.value} sq ft` }))} />
              <Hint>{marlas.label(form.marlaSqft)}</Hint>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-base text-muted-foreground">Approval</p>
            <ChoiceCards options={approvals.options} map={approvals.map} value={form.approval} onChange={set("approval")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <LookupSelect
              list="authority"
              label="Approving authority"
              empty="None"
              value={form.authority}
              onChange={set("authority")}
              formatLabel={(o) => (o.value === o.label ? o.label : `${o.value} · ${o.label}`)}
              error={err("authority")}
            />
            <Input label="NOC / LOP number" required={form.approval === "approved"} value={form.nocNumber} onChange={(e) => set("nocNumber")(e.target.value)} error={err("nocNumber")} placeholder="LDA/HS/2019/0442" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Hint>Balloted phases have numbered plots in blocks. Unballoted phases hold open files in file pools until balloting.</Hint>
          {form.phases.map((ph, i) => {
            const unballoted = ph.stage === "unballoted"
            const phaseHasUnits = ph.blocks.some((b) => b.hasUnits)
            return (
              <section key={ph.key} className="rounded-xl border">
                <header className="flex flex-wrap items-start gap-2 border-b bg-muted/30 p-3">
                  <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <div className="min-w-40 flex-1">
                    <Input aria-label="Phase name" value={ph.name} onChange={(e) => setPhase(i, { name: e.target.value })} error={err(`phases.${i}.name`)} />
                  </div>
                  <ToggleGroup
                    value={ph.stage}
                    onChange={(v) => setPhase(i, { stage: v })}
                    options={stages.options.map((o) => ({ value: o.value, label: o.value === "balloted" ? "Balloted" : o.value === "unballoted" ? "Unballoted" : o.label }))}
                  />
                  <Select aria-label="Phase status" triggerClassName="w-44" value={ph.status} onChange={(v) => setPhase(i, { status: v })} options={statuses.options} />
                  <Button
                    variant="ghost"
                    size="icon"
                    leftIcon="delete-bin-6-line"
                    aria-label={`Remove ${ph.name}`}
                    title={phaseHasUnits ? "This phase has inventory" : form.phases.length === 1 ? "A project needs at least one phase" : "Remove phase"}
                    disabled={phaseHasUnits || form.phases.length === 1}
                    onClick={() => setForm((f) => ({ ...f, phases: f.phases.filter((_, k) => k !== i) }))}
                  />
                </header>
                <div className="space-y-2 p-3">
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{unballoted ? "File pools" : "Blocks"}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ph.blocks.map((b, j) => (
                      <div key={b.key} className="flex items-start gap-1.5 rounded-lg border bg-background p-1.5">
                        <div className="min-w-0 flex-1">
                          <Input aria-label="Block name" size="sm" value={b.name} onChange={(e) => setBlock(i, j, { name: e.target.value })} error={err(`phases.${i}.blocks.${j}.name`)} />
                        </div>
                        <ToggleGroup className="h-control-sm text-xs" value={b.category} onChange={(v) => setBlock(i, j, { category: v })} options={categories.options} />
                        <Button
                          variant="ghost"
                          size="smicon"
                          leftIcon="close-line"
                          aria-label={`Remove ${b.name}`}
                          title={b.hasUnits ? "This block has inventory" : ph.blocks.length === 1 ? "A phase needs at least one block" : "Remove"}
                          disabled={b.hasUnits || ph.blocks.length === 1}
                          onClick={() => setPhase(i, { blocks: ph.blocks.filter((_, k) => k !== j) })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon="add-line"
                      className="text-primary"
                      onClick={() =>
                        setPhase(i, {
                          blocks: [
                            ...ph.blocks,
                            newBlock(unballoted ? `File pool ${ph.blocks.length + 1}` : `Block ${String.fromCharCode(65 + (ph.blocks.length % 26))}`, ph.blocks.at(-1)?.category ?? defaults.category),
                          ],
                        })
                      }
                    >
                      {unballoted ? "Add file pool" : "Add block"}
                    </Button>
                    <Button size="sm" variant="ghost" leftIcon="calendar-2-line" onClick={() => setPhase(i, { showDates: !ph.showDates })}>
                      {ph.showDates ? "Hide dates" : "Launch & possession dates"}
                    </Button>
                  </div>
                  {ph.showDates && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DatePicker label="Phase launch" value={ph.launchDate} onChange={(v) => setPhase(i, { launchDate: v ?? "" })} />
                      <DatePicker label="Phase possession" value={ph.possessionDate} onChange={(v) => setPhase(i, { possessionDate: v ?? "" })} error={err(`phases.${i}.possessionDate`)} />
                    </div>
                  )}
                </div>
              </section>
            )
          })}
          <Button
            variant="outline"
            leftIcon="add-line"
            className="w-full border-dashed"
            onClick={() => setForm((f) => ({ ...f, phases: [...f.phases, newPhase(f.phases.length + 1, { ...defaults, status: f.status })] }))}
          >
            Add phase
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <DatePicker label="Launch date" value={form.launchDate} onChange={(v) => set("launchDate")(v ?? "")} error={err("launchDate")} />
            <DatePicker label="Expected possession" value={form.possessionDate} onChange={(v) => set("possessionDate")(v ?? "")} error={err("possessionDate")} />
          </div>
          <Textarea label="Description" rows={3} placeholder="A few lines buyers and your team will see" value={form.description} onChange={(e) => set("description")(e.target.value)} error={err("description")} />
          <AmenitiesField value={form.amenities} onChange={set("amenities")} />
          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Summary</p>
            <p className="font-medium">
              {form.name || "Untitled"} <span className="font-mono text-xs text-muted-foreground">{form.code}</span>
            </p>
            <p className="text-muted-foreground">
              {[
                types.label(form.type),
                form.city,
                form.totalArea ? `${form.totalArea} ${form.areaUnit === "kanal" ? "Kanal" : "Marla"}` : null,
                form.authority && form.approval === "approved" ? `${form.authority} approved` : approvals.label(form.approval),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-muted-foreground">
              {form.phases.length} {form.phases.length === 1 ? "phase" : "phases"} ·{" "}
              {(() => {
                const n = form.phases.reduce((t, p) => t + p.blocks.length, 0)
                return `${n} ${n === 1 ? "block" : "blocks"}`
              })()}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  )
}
