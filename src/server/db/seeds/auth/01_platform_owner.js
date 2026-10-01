import { hashPassword, newPassword } from "../../../auth/secrets.js"

// The first console account, from PLATFORM_OWNER_* in .env, and its owner row in
// pf_platform.platform_staff. No workspaces or tenant data are created here.
// Safe to run again (every deploy does): it only adds what's missing and never changes an
// existing account, its password or its console role.
export async function seed(knex) {
  const name = process.env.PLATFORM_OWNER_NAME?.trim()
  const email = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase()
  if (!name || !email) throw new Error("Set PLATFORM_OWNER_NAME and PLATFORM_OWNER_EMAIL in .env first.")
  const staffTable = `${process.env.DB_PLATFORM_NAME || "pf_platform"}.platform_staff`

  let user = await knex("users").where({ email }).whereNull("deleted_at").first()
  if (!user) {
    const given = process.env.PLATFORM_OWNER_PASSWORD
    const password = given || newPassword()
    const [id] = await knex("users").insert({
      name,
      email,
      password_hash: await hashPassword(password),
      // A generated password has to be changed at first sign-in
      must_change_password: !given,
      email_verified_at: knex.fn.now(3),
      password_changed_at: knex.fn.now(3),
    })
    user = { id }
    console.log(`  Platform owner created: ${email}`)
    // Shown only in a terminal: deploy logs (GitHub Actions) must never contain a password
    if (!given && process.stdout.isTTY) console.log(`  One-time password: ${password}  (shown once; you'll be asked to change it)`)
    else if (!given) console.log("  A one-time password was set. Use Forgot password on the sign-in page to choose your own.")
  } else {
    console.log(`  Platform owner already exists: ${email} (password unchanged)`)
  }

  const staff = await knex(staffTable).where({ user_id: user.id }).whereNull("deleted_at").first()
  if (!staff) {
    await knex(staffTable).insert({ user_id: user.id, role: "owner", created_by: user.id })
    console.log("  Added to the console team as owner")
  }
}
