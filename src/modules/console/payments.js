// Ways customers can pay their PropFlow subscription. Online gateways need their keys in .env
// (never in the database); the console only switches each method on or off.
// ids match components/billing/methods.js

export const PAYMENT_GATEWAYS = [
  {
    id: "bank",
    label: "Bank transfer (IBFT)",
    icon: "bank-line",
    description: "Customers transfer to your account and Finance confirms the payment in Billing.",
    manual: true,
  },
  {
    id: "jazzcash",
    label: "JazzCash",
    icon: "smartphone-line",
    description: "Mobile wallet and JazzCash card payments, approved in the JazzCash app.",
    env: ["JAZZCASH_MERCHANT_ID", "JAZZCASH_PASSWORD", "JAZZCASH_INTEGRITY_SALT"],
  },
  {
    id: "easypaisa",
    label: "Easypaisa",
    icon: "smartphone-line",
    description: "Mobile wallet payments, approved in the Easypaisa app.",
    env: ["EASYPAISA_STORE_ID", "EASYPAISA_HASH_KEY"],
  },
  {
    id: "card",
    label: "Debit or credit card",
    icon: "bank-card-line",
    description: "Visa, Mastercard and UnionPay through PayFast.",
    env: ["PAYFAST_MERCHANT_ID", "PAYFAST_SECURED_KEY"],
  },
]

export const EMPTY_BANK = { bankName: "", accountTitle: "", accountNumber: "", iban: "", branch: "", instructions: "" }

// Pakistani IBAN: PK, 2 check digits, 4-letter bank code, 16 digits (24 characters)
export const normalizeIban = (s) => String(s ?? "").replace(/\s+/g, "").toUpperCase()
export const IBAN_PATTERN = /^PK\d{2}[A-Z]{4}\d{16}$/
