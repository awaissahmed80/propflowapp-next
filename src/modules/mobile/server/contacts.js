import "server-only"
import { fail, failWith, json } from "./api"

// saveContact's answer for the phone (POST and PATCH /contacts): a mobile or CNIC that someone
// else has → 409 duplicate with clash: { code, name } of that contact
export function contactAnswer(result) {
  if (result.conflict) return fail("op_conflict")
  if (result.clash) {
    const [field, message] = Object.entries(result.fieldErrors ?? {})[0] ?? []
    return json({ error: { code: "duplicate", message, field }, clash: result.clash }, 409)
  }
  return result.ok ? json(result) : failWith(result)
}
