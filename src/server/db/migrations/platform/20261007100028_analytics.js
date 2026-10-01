// Google Analytics on the website: the GA4 Measurement ID (none = off) and whether visitors are
// asked before analytics cookies are set.
export async function up(knex) {
  await knex("settings")
    .insert([
      { key: "analytics_id", value: JSON.stringify(null), description: "Google Analytics 4 Measurement ID for the website (G-…); empty turns analytics off" },
      { key: "analytics_consent", value: JSON.stringify(false), description: "Ask website visitors before setting analytics cookies" },
    ])
    .onConflict("key")
    .ignore()
}

export async function down(knex) {
  await knex("settings").whereIn("key", ["analytics_id", "analytics_consent"]).delete()
}
