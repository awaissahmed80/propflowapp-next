"use client"

import { useState, useTransition } from "react"
import { formatPkPhone } from "@/lib/phone"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"

// Mobile number in place: click to type a new one; Enter saves, Esc cancels
export function InlinePhone({ value, editable, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const shown = value ? (
    <a href={`tel:${value}`} className="hover:underline">
      {formatPkPhone(value)}
    </a>
  ) : (
    <span className="font-normal text-muted-foreground">Not set</span>
  );
  if (!editable) return shown;
  const save = () =>
    startTransition(async () => {
      const result = await onSave(draft);
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  if (editing)
    return (
      <div className="w-60">
        <div className="flex items-center gap-1">
          <Input
            aria-label="Mobile number"
            size="sm"
            type="tel"
            autoFocus
            placeholder="0300 1234567"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setEditing(false);
              }
            }}
            error={error || undefined}
          />
          <Button
            size="smicon"
            leftIcon={pending ? "loader-4-line" : "check-line"}
            aria-label="Save mobile number"
            disabled={pending}
            onClick={save}
            className={pending ? "[&_i]:animate-spin" : undefined}
          />
          <Button
            size="smicon"
            variant="ghost"
            leftIcon="close-line"
            aria-label="Cancel"
            disabled={pending}
            onClick={() => setEditing(false)}
          />
        </div>
      </div>
    );
  return (
    <span className="group/inline -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted">
      {shown}
      <button
        type="button"
        aria-label="Change mobile number"
        onClick={() => {
          setDraft(value ? formatPkPhone(value) : "");
          setError("");
          setEditing(true);
        }}
        className="flex cursor-pointer items-center rounded text-xs text-muted-foreground opacity-0 outline-none group-hover/inline:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="pencil-line" />
      </button>
    </span>
  );
}
