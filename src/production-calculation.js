const parseNumber = (value, label, { minimum = 0, allowEmpty = false } = {}) => {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!text && allowEmpty) return 0
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) throw new Error(`${label} muss eine gültige Zahl sein.`)
  const number = Number(text)
  if (!Number.isFinite(number) || number < minimum) throw new Error(`${label} muss mindestens ${minimum} betragen.`)
  return number
}

const parseCostLines = (lines, label) => {
  let totalCents = 0
  const normalized = lines.flatMap((line) => {
    const name = String(line?.name || '').trim()
    const amountText = String(line?.amount ?? '').trim()
    const priceText = String(line?.unitPrice ?? '').trim()
    if (!name && !amountText && !priceText) return []
    if (!name) throw new Error(`Bitte für jede ${label}-Position einen Namen eintragen.`)
    const amount = parseNumber(amountText, `Menge für ${name}`, { minimum: 0.0001 })
    const unitPriceCents = Math.round(parseNumber(priceText, `Einkaufspreis für ${name}`) * 100)
    if (!unitPriceCents) throw new Error(`Der Einkaufspreis für ${name} muss größer als 0 sein.`)
    const lineTotalCents = Math.round(amount * unitPriceCents)
    totalCents += lineTotalCents
    return [{ name, amount, unit: String(line?.unit || ''), unitPriceCents, lineTotalCents }]
  })
  return { lines: normalized, totalCents }
}

const calculateProductionCost = (calculation) => {
  const batchBottles = parseNumber(calculation.batchBottles, 'Abfüllmenge', { minimum: 1 })
  if (!Number.isSafeInteger(batchBottles) || batchBottles > 100000000) {
    throw new Error('Die Abfüllmenge muss eine ganze Zahl zwischen 1 und 100.000.000 Dosen sein.')
  }
  const bottlesPerCrate = parseNumber(calculation.bottlesPerCrate ?? 24, 'Dosen pro Tray', { minimum: 1 })
  if (!Number.isSafeInteger(bottlesPerCrate) || bottlesPerCrate > 1000) {
    throw new Error('Die Traygröße muss eine ganze Zahl zwischen 1 und 1.000 Dosen sein.')
  }
  const targetMarginPercent = parseNumber(calculation.targetMarginPercent, 'Zielmarge')
  if (targetMarginPercent >= 100) throw new Error('Die Zielmarge muss unter 100 % liegen.')
  const vatRate = Number(calculation.vatRate)
  if (![0, 7, 19].includes(vatRate)) throw new Error('Bitte einen gültigen Mehrwertsteuersatz wählen.')

  const ingredients = parseCostLines(calculation.ingredients || [], 'Zutaten')
  const packaging = parseCostLines(calculation.packaging || [], 'Verpackungs')
  const laborCostCents = Math.round(parseNumber(calculation.laborCost, 'Arbeitskosten', { allowEmpty: true }) * 100)
  const overheadCostCents = Math.round(parseNumber(calculation.overheadCost, 'Gemeinkosten', { allowEmpty: true }) * 100)
  const variableCostCents = ingredients.totalCents + packaging.totalCents
  const fixedCostCents = laborCostCents + overheadCostCents
  const totalCostCents = variableCostCents + fixedCostCents
  if (!totalCostCents) throw new Error('Bitte mindestens eine Kostenposition mit Kosten erfassen.')

  const unitCostCents = Math.round(totalCostCents / batchBottles)
  const exactUnitCostCents = totalCostCents / batchBottles
  const targetSellingPriceNetCents = Math.ceil(exactUnitCostCents / (1 - targetMarginPercent / 100))
  const targetSellingPriceGrossCents = Math.round(targetSellingPriceNetCents * (100 + vatRate) / 100)
  const marginPercent = (targetSellingPriceNetCents - exactUnitCostCents) / targetSellingPriceNetCents * 100
  const batchProfitCents = targetSellingPriceNetCents * batchBottles - totalCostCents
  const contributionPerBottleCents = targetSellingPriceNetCents - variableCostCents / batchBottles
  const breakEvenBottles = fixedCostCents === 0
    ? 0
    : contributionPerBottleCents > 0
      ? Math.ceil(fixedCostCents / contributionPerBottleCents)
      : null

  return {
    ingredients,
    packaging,
    batchBottles,
    bottlesPerCrate,
    ingredientCostCents: ingredients.totalCents,
    packagingCostCents: packaging.totalCents,
    laborCostCents,
    overheadCostCents,
    variableCostCents,
    fixedCostCents,
    totalCostCents,
    unitCostCents,
    crateCostCents: Math.round(exactUnitCostCents * bottlesPerCrate),
    targetMarginPercent,
    vatRate,
    targetSellingPriceNetCents,
    targetSellingPriceGrossCents,
    crateSellingPriceNetCents: targetSellingPriceNetCents * bottlesPerCrate,
    crateSellingPriceGrossCents: targetSellingPriceGrossCents * bottlesPerCrate,
    batchSellingPriceNetCents: targetSellingPriceNetCents * batchBottles,
    batchSellingPriceGrossCents: targetSellingPriceGrossCents * batchBottles,
    batchVatCents: (targetSellingPriceGrossCents - targetSellingPriceNetCents) * batchBottles,
    marginPercent,
    batchProfitCents,
    breakEvenBottles,
  }
}

export { calculateProductionCost }
