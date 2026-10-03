"use client"

import { toast } from "sonner"

// Run a server action behind a loading toast that turns into the result: "Saving…" → "Saved."
// or the action's error. Field errors (shown under inputs) just dismiss it.
//   const r = await toastAction(() => saveThing(input), { loading: "Saving…", success: "Saved." })
//   success may be a function of the result: (r) => `Allotment ${r.no} issued.`
export async function toastAction(fn, { loading = "Working on it…", success, error = "That didn't work. Try again." } = {}) {
  const id = toast.loading(loading)
  try {
    const r = await fn()
    if (r?.error) toast.error(r.error, { id })
    else if (r?.fieldErrors) toast.dismiss(id)
    else if (success) toast.success(typeof success === "function" ? success(r) : success, { id })
    else toast.dismiss(id)
    return r
  } catch (err) {
    toast.error(error, { id })
    return { error: err?.message ?? error }
  }
}
