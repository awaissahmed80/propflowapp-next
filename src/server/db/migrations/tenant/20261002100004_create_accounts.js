import { datetime, money, tableDefaults, timestamps, uniqueAlive } from "../../columns.js"

export async function up(knex) {
  // Chart of accounts. Headers group accounts (1000 Assets › 1100 Cash & bank › 1110 Cash in hand).
  // Cash and bank accounts carry kind = cash | bank; bank accounts also carry the bank's details.
  // System accounts are used by the apps (receipts land in them) and can't be deleted.
  await knex.schema.createTable("accounts", (t) => {
    tableDefaults(t)
    t.bigIncrements("id")
    t.string("code", 20).notNullable()
    t.string("name", 150).notNullable()
    t.string("type", 12).notNullable().index() // asset | liability | equity | income | expense
    t.string("parent_code", 20).nullable().index()
    t.boolean("is_header").notNullable().defaultTo(false)
    t.string("kind", 10).nullable().index() // cash | bank
    t.boolean("is_system").notNullable().defaultTo(false)
    // The bank account money is received into unless a receipt says otherwise
    t.boolean("is_default").notNullable().defaultTo(false)
    t.string("description", 255).nullable()
    t.string("bank_name", 100).nullable()
    t.string("account_title", 150).nullable()
    t.string("account_number", 40).nullable()
    t.string("iban", 34).nullable()
    t.string("branch", 150).nullable()
    money(t, "opening_balance").notNullable().defaultTo(0)
    datetime(t, "opening_date").nullable()
    t.boolean("is_active").notNullable().defaultTo(true)
    t.integer("sort_order").notNullable().defaultTo(0)
    timestamps(t, knex)
  })
  await uniqueAlive(knex, "accounts", "code")
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("accounts")
}
