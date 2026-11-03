import { z } from "zod"
import { BAD_LOGIN, checkPassword } from "@/server/auth/password-check"
import { clientIp } from "@/server/auth/mobile-session"
import { deviceField, emailField, fail, json, passwordField, publicRoute, readBody, signInLimited } from "@/modules/mobile/server/api"
import { afterIdentity } from "@/modules/mobile/server/sign-in"

const schema = z.object({ email: emailField, password: passwordField, device: deviceField })

// The web sign-in's sentences → the app's codes
const codeFor = (error) => (error === BAD_LOGIN ? "invalid_credentials" : /Too many wrong/.test(error) ? "locked" : /disabled/.test(error) ? "inactive" : "invalid_credentials")

// POST /api/mobile/v1/auth/sign-in { email, password, device }: the password check of the web
// sign-in (lockout, inactive accounts, history), then the next step or the session.
// docs/mobile-api.md
export const POST = publicRoute(async (request) => {
  const { data, response } = await readBody(request, schema)
  if (response) return response
  const ip = clientIp(request)
  if (signInLimited(ip, data.email)) return fail("too_many")
  const checked = await checkPassword(data.email, data.password)
  if (checked.error) return fail(codeFor(checked.error), { message: checked.error })
  const result = await afterIdentity(checked.user, { method: "password", device: data.device, ip })
  return result.error ? fail(result.error, { values: result.values }) : json(result)
})
