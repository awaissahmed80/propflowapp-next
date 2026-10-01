// Pakistani mobile numbers. Stored as +923001234567; shown as 0300 1234567.

// "0300-1234567", "300 1234567", "92300…", "+92 300 …" → "+923001234567"; anything else → null
export function normalizePkMobile(input) {
  let d = String(input ?? "").replace(/\D/g, "")
  if (d.startsWith("0092")) d = d.slice(4)
  else if (d.startsWith("92")) d = d.slice(2)
  else if (d.startsWith("0")) d = d.slice(1)
  return /^3\d{9}$/.test(d) ? `+92${d}` : null
}

// "+923001234567" → "0300 1234567"; anything else as it is
export function formatPkPhone(value) {
  const m = /^\+92(3\d{2})(\d{7})$/.exec(value ?? "")
  return m ? `0${m[1]} ${m[2]}` : (value ?? "")
}
