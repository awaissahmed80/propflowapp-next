// Payment methods offered per currency
export const PAYMENT_METHODS = {
  PKR: [
    { id: "card", label: "Debit or credit card", icon: "bank-card-line", note: "Visa, Mastercard and UnionPay" },
    { id: "jazzcash", label: "JazzCash", icon: "smartphone-line", note: "Approve in the JazzCash app", wallet: true },
    { id: "easypaisa", label: "Easypaisa", icon: "smartphone-line", note: "Approve in the Easypaisa app", wallet: true },
    { id: "bank", label: "Bank transfer (IBFT)", icon: "bank-line", note: "Confirmed within one working day" },
  ],
  USD: [
    { id: "card", label: "Card", icon: "bank-card-line", note: "Visa, Mastercard and American Express" },
    { id: "bank", label: "Wire transfer", icon: "bank-line", note: "Confirmed within two working days" },
  ],
}

// Ways staff can record a payment received outside the gateways
const OFFLINE = [
  { id: "cash", label: "Cash" },
  { id: "cheque", label: "Cheque" },
]

export const methodLabel = (id, currency = "PKR") =>
  [...PAYMENT_METHODS[currency], ...PAYMENT_METHODS.PKR, ...OFFLINE].find((m) => m.id === id)?.label ?? id
