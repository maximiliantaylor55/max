const cleanDiscountCodes = (input) => {
  if (!Array.isArray(input) || input.length > 500) throw new Error('Rabattcodes ungültig.')
  const seen = new Set()
  return input.map((entry) => {
    const code = String(entry?.code || '').trim().toUpperCase()
    const type = entry?.type
    const value = Number(entry?.value)
    if (!/^[A-Z0-9_-]{3,32}$/.test(code) || seen.has(code)
      || !['percent', 'fixed'].includes(type) || !Number.isSafeInteger(value)
      || value < 1 || (type === 'percent' ? value > 100 : value > 100000000)
      || typeof entry.active !== 'boolean') {
      throw new Error('Rabattcode ungültig. Codes benötigen 3–32 Buchstaben oder Zahlen und einen gültigen Rabattwert.')
    }
    seen.add(code)
    return { id: String(entry.id || code), code, type, value, active: entry.active }
  })
}

const calculateDiscount = (codeInput, discounts, subtotalCents) => {
  const subtotal = Number(subtotalCents)
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) throw new Error('Warenkorbwert ungültig.')
  const code = String(codeInput || '').trim().toUpperCase()
  if (!code) return { code: '', amountCents: 0 }
  const discount = cleanDiscountCodes(discounts).find((entry) => entry.code === code && entry.active)
  if (!discount) throw new Error('Rabattcode ungültig oder nicht mehr verfügbar.')
  const amountCents = discount.type === 'percent'
    ? Math.round(subtotal * discount.value / 100)
    : Math.min(subtotal, discount.value)
  return { code: discount.code, amountCents }
}

const applyDiscountToItems = (items, amountCents) => {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0)
  if (!amountCents) return items
  const discountParts = items.map((item) => Math.floor(amountCents * item.lineTotalCents / subtotal))
  let remainder = amountCents - discountParts.reduce((sum, amount) => sum + amount, 0)
  for (let index = items.length - 1; index >= 0 && remainder > 0; index -= 1) {
    const available = items[index].lineTotalCents - discountParts[index]
    const added = Math.min(available, remainder)
    discountParts[index] += added
    remainder -= added
  }
  if (remainder > 0) throw new Error('Rabatt konnte nicht auf die Artikel verteilt werden.')
  return items.map((item, index) => ({
    ...item,
    lineTotalCents: item.lineTotalCents - discountParts[index],
  }))
}

module.exports = { applyDiscountToItems, calculateDiscount, cleanDiscountCodes }
