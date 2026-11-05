const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const normalizeLotInput = (lot, bestBefore) => {
  const cleanLot = String(lot || '').trim()
  const cleanDate = String(bestBefore || '').trim()
  if (cleanLot.length > 40) throw new Error('Die Chargennummer darf höchstens 40 Zeichen haben.')
  if (cleanDate && (!DATE_PATTERN.test(cleanDate) || Number.isNaN(Date.parse(cleanDate)))) throw new Error('Das MHD ist ungültig.')
  return { lot: cleanLot, bestBefore: cleanDate }
}

// Früheste Ablaufdatum zuerst, Chargen ohne MHD zuletzt.
const compareFefo = (left, right) => {
  if (left.bestBefore && right.bestBefore) return left.bestBefore.localeCompare(right.bestBefore) || left.lot.localeCompare(right.lot)
  if (left.bestBefore) return -1
  if (right.bestBefore) return 1
  return left.lot.localeCompare(right.lot)
}

const refreshLotSummary = (product) => {
  product.lots = (product.lots || []).filter((entry) => entry.quantity > 0).sort(compareFefo)
  const first = product.lots[0]
  if (first) {
    product.lotNumber = first.lot
    product.bestBefore = first.bestBefore
  }
}

const addLot = (product, { lot, bestBefore, quantity }) => {
  const input = normalizeLotInput(lot, bestBefore)
  if (!input.lot && !input.bestBefore) return
  const lots = Array.isArray(product.lots) ? product.lots : []
  const existing = lots.find((entry) => entry.lot === input.lot && entry.bestBefore === input.bestBefore)
  if (existing) existing.quantity += quantity
  else lots.push({ ...input, quantity })
  product.lots = lots
  refreshLotSummary(product)
}

// Bucht die Menge nach FEFO aus den Chargen. Bestand ohne Charge wird nicht zugeordnet.
const allocateFefo = (product, quantity) => {
  const lots = [...(product.lots || [])].sort(compareFefo)
  const picked = []
  let remaining = quantity
  for (const entry of lots) {
    if (remaining <= 0) break
    const take = Math.min(entry.quantity, remaining)
    if (take <= 0) continue
    entry.quantity -= take
    remaining -= take
    picked.push({ lot: entry.lot, bestBefore: entry.bestBefore, quantity: take })
  }
  if (Array.isArray(product.lots)) refreshLotSummary(product)
  return picked
}

module.exports = { addLot, allocateFefo, compareFefo, normalizeLotInput }
