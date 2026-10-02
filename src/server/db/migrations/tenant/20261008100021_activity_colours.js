// Activity types got colours (Lists & Labels). Workspaces created before then have them without
// one: give each its default colour, but only where none has been set.
const COLOURS = { call: "blue", whatsapp: "green", "site-visit": "amber", meeting: "violet", email: "sky", sms: "teal" }

export async function up(knex) {
  for (const [value, color] of Object.entries(COLOURS)) {
    await knex("lookups").where({ list_key: "activity-type", value }).whereNull("color").update({ color })
  }
}

export async function down() {
  // Colours are harmless to keep
}
