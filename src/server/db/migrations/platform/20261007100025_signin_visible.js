// Whether the website shows its Sign in link. The sign-in page (auth.…) works either way.
export async function up(knex) {
  await knex("settings")
    .insert({ key: "signin_visible", value: JSON.stringify(true), description: "Show the Sign in link on the website (the sign-in page itself always works)" })
    .onConflict("key")
    .ignore()
}

export async function down(knex) {
  await knex("settings").where({ key: "signin_visible" }).delete()
}
