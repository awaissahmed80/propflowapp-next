// Workspace defaults for Pakistan. Only adds missing keys: values the workspace changes are kept.
// The company name and city are written by provisioning from what the owner entered at setup.
const SETTINGS = [
  ["currency", "PKR", "Currency for prices and accounts"],
  ["timezone", "Asia/Karachi", "Time zone for dates and reports"],
  ["financial_year_start_month", 7, "First month of the financial year (July)"],
  ["area_units", ["marla", "kanal", "sq_ft", "sq_yd"], "Area units offered on plots and units"],
  ["marla_sq_ft", 225, "Square feet in one marla for this workspace's projects"],
]

export async function seed(knex) {
  await knex("settings")
    .insert(SETTINGS.map(([key, value, description]) => ({ key, value: JSON.stringify(value), description })))
    .onConflict("key")
    .ignore()
}
