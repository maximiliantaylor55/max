const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48)

const cleanTiers = (tiers) => (Array.isArray(tiers) ? tiers : [])
  .map((tier) => ({ minQuantity: Math.floor(Number(tier?.minQuantity)), percent: Number(tier?.percent) }))
  .filter((tier) => Number.isSafeInteger(tier.minQuantity) && tier.minQuantity > 0 && tier.percent > 0 && tier.percent < 100)
  .sort((left, right) => left.minQuantity - right.minQuantity)

const tierPercent = (tiers, quantity) => cleanTiers(tiers)
  .filter((tier) => quantity >= tier.minQuantity)
  .reduce((best, tier) => Math.max(best, tier.percent), 0)

const discountedCratePrice = (cratePriceCents, tiers, quantity) => {
  const percent = tierPercent(tiers, quantity)
  return percent ? Math.round(cratePriceCents * (100 - percent) / 100) : cratePriceCents
}

const toNumber = (value) => Number(String(value ?? '').trim().replace(',', '.'))
const cleanExpectedDeliveryDate = (value) => {
  const date = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? '' : date
}
const nutritionFieldNames = ['energyKj', 'energyKcal', 'fat', 'saturates', 'carbohydrates', 'sugars', 'protein', 'salt']
const cleanNutritionValues = (values) => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return {}
  return Object.fromEntries(nutritionFieldNames.flatMap((name) => {
    const raw = String(values[name] ?? '').trim().replace(',', '.')
    if (!raw || raw.length > 16 || !/^\d+(?:\.\d{1,6})?$/.test(raw)) return []
    return [[name, raw]]
  }))
}
const parseNutritionText = (value) => {
  const lines = String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const readValue = (labels) => {
    const index = lines.findIndex((line) => labels.some((label) => line.toLowerCase().startsWith(label)))
    if (index < 0) return ''
    const currentLine = lines[index].replace(/^[^:]*?:\s*/, '').trim()
    const hasValue = /\d/.test(currentLine)
    return hasValue ? currentLine : (lines[index + 1] || '')
  }
  const numericValue = (text) => text.match(/\d+(?:[.,]\d+)?/)?.[0] || ''
  const energy = readValue(['energie', 'brennwert'])
  const energyKj = energy.match(/(\d+(?:[.,]\d+)?)\s*kJ/i)?.[1] || ''
  const energyKcal = energy.match(/(\d+(?:[.,]\d+)?)\s*kcal/i)?.[1] || ''
  return cleanNutritionValues({
    energyKj,
    energyKcal,
    fat: numericValue(readValue(['fett'])),
    saturates: numericValue(readValue(['davon gesättigte fettsäuren', 'gesättigte fettsäuren'])),
    carbohydrates: numericValue(readValue(['kohlenhydrate'])),
    sugars: numericValue(readValue(['davon zucker', 'zucker'])),
    protein: numericValue(readValue(['eiweiß', 'protein'])),
    salt: numericValue(readValue(['salz'])),
  })
}

// Artikel, die in der Desktop-App für den Shop freigegeben sind, werden zum Shop-Katalog.
const buildDesktopCatalog = (desktopProducts) => {
  const seen = new Set()
  const catalog = []
  for (const product of Array.isArray(desktopProducts) ? desktopProducts : []) {
    if (!product || !(product.shopActive === true || product.shopActive === 'true') || product.status === 'Inaktiv') continue
    const id = slugify(product.sku || product.name)
    const unitNet = toNumber(product.unitPrice)
    const perCase = 24
    // Ein manuell gepflegter Traypreis hat Vorrang; ohne ihn wird er aus dem Einzelpreis netto berechnet.
    const manualCents = Math.round(toNumber(product.shopCratePrice) * 100)
    const cratePriceCents = manualCents >= 1
      ? manualCents
      : Math.round(unitNet * 1.19 * perCase * 100)
    const unitWeightGrams = Math.round(toNumber(product.weightKg) * 1000)
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id) || seen.has(id) || !String(product.name || '').trim()
      || !Number.isSafeInteger(cratePriceCents) || cratePriceCents < 1
      || !Number.isSafeInteger(unitWeightGrams) || unitWeightGrams < 1) continue
    seen.add(id)
    const bottles = String(product.availableBottles ?? '').trim() === '' ? NaN : toNumber(product.availableBottles)
    const stock = Number.isSafeInteger(bottles) && bottles >= 0 ? bottles : null
    const expectedDeliveryDate = cleanExpectedDeliveryDate(product.shopExpectedDeliveryDate)
    const preorderEnabled = (product.shopPreorderEnabled === true || product.shopPreorderEnabled === 'true')
      && Boolean(expectedDeliveryDate)
      && expectedDeliveryDate >= new Date().toISOString().slice(0, 10)
    const nutritionValues = cleanNutritionValues(product.shopNutritionValues)
    const sourceImages = Array.isArray(product.shopImages) && product.shopImages.length
      ? product.shopImages
      : (product.shopImage ? [product.shopImage] : [])
    const images = [...new Set(sourceImages
      .filter((image) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(image || '')) && String(image).length < 200000))]
      .slice(0, 5)
    catalog.push({
      id,
      name: String(product.name).trim().slice(0, 100),
      description: String(product.shopDescription
        || `${String(product.volume || '500ml').replace(/330\s*ml|0[,.]33\s*l/ig, '500ml')} Dose · einzeln oder im 24er-Tray`).trim().slice(0, 1500),
      ingredients: String(product.shopIngredients || '').trim().slice(0, 600),
      nutrition: String(product.shopNutrition || '').trim().slice(0, 600),
      nutritionValues: Object.keys(nutritionValues).length ? nutritionValues : parseNutritionText(product.shopNutrition),
      cratePriceCents,
      unitWeightGrams,
      active: true,
      stock,
      preorderEnabled,
      expectedDeliveryDate,
      tiers: cleanTiers(product.shopTiers),
      depositCents: Math.max(0, Math.round(Number(product.depositPerUnit || 0) * 100)),
      category: String(product.category || '').slice(0, 40),
      image: images[0] || '',
      images,
    })
  }
  return catalog
}

module.exports = { buildDesktopCatalog, cleanNutritionValues, cleanTiers, parseNutritionText, tierPercent, discountedCratePrice, slugify }
