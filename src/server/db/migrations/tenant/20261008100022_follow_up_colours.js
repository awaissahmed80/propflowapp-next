// Follow-up options got colors (Lists & Labels): give existing workspaces the defaults, only
// where none has been set
const COLOURS = { tomorrow: "blue", "3-days": "sky", "next-week": "violet", "two-weeks": "teal", "next-month": "amber" }

export async function up(knex) {
  for (const [value, color] of Object.entries(COLOURS)) {
    await knex("lookups").where({ list_key: "follow-up", value }).whereNull("color").update({ color })
  }
}

export async function down() {
  // Colors are harmless to keep
}
