// Rezeptursystem: Rohstoff-Stammdaten + strukturierte Rezepturzeilen (Menge, Einheit, Anteil %, Kosten).
// Flüssigkeiten werden für den Anteil mit Dichte 1 (1 ml ≈ 1 g) gerechnet – das steht auch im Ausdruck.

import { catalogAliasesFor, normalizeENumber, rawMaterialCatalog } from './raw-material-catalog.js'

const formatAmountInput = (value) => Number(value).toLocaleString('de-DE', { maximumFractionDigits: 3, useGrouping: false })
const formatPriceInput = (value) => Number(value).toLocaleString('de-DE', { maximumFractionDigits: 6, useGrouping: false })

export const rawMaterialUnits = ['g', 'kg', 'mg', 'ml', 'l', 'Stück']
export const rawMaterialCategories = [
  'Wasser', 'Saft/Konzentrat', 'Zucker/Süßungsmittel', 'Säuerungsmittel', 'Aroma/Extrakt',
  'Vitamine/Mineralstoffe', 'Koffein', 'Farbe', 'Kohlensäure', 'Konservierungsstoff', 'Antioxidationsmittel',
  'Emulgator/Stabilisator', 'Zusatzstoff', 'Sonstiges',
]
export const initialRawMaterialForm = {
  name: '', eNumber: '', additiveClass: '', articleNumber: '', category: 'Sonstiges', supplier: '', unit: 'kg', pricePerUnit: '', allergens: '', notes: '',
}

// Suchtext: Name, E-Nummer (auch „e330“ ohne Leerzeichen), Artikelnummer, Lieferant, Kategorie, Funktionsklasse.
const searchText = (entry) => [entry.name, ...catalogAliasesFor(entry), entry.eNumber, normalizeENumber(entry.eNumber), entry.articleNumber, entry.supplier, entry.category, entry.additiveClass]
  .filter(Boolean).join(' ').toLowerCase()

// Treffer über einen Alltagsnamen (z. B. „Zitronensäure“ → Citronensäure) für die Anzeige.
export const matchedAlias = (entry, query) => {
  const text = String(query || '').trim().toLowerCase()
  if (text.length < 3 || String(entry?.name || '').toLowerCase().includes(text)) return ''
  return catalogAliasesFor(entry).find((alias) => alias.toLowerCase().includes(text)) || ''
}

const rankEntries = (entries, query, limit) => {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean)
  const compactQuery = normalizeENumber(query).toLowerCase()
  const matches = terms.length
    ? entries.filter((entry) => {
      const haystack = searchText(entry)
      return terms.every((term) => haystack.includes(term)) || (compactQuery && haystack.includes(compactQuery))
    })
    : entries
  const first = terms[0] || ''
  const score = (entry) => {
    if (compactQuery && normalizeENumber(entry.eNumber).toLowerCase() === compactQuery) return 0
    if (String(entry.name || '').toLowerCase().startsWith(first)) return 1
    if (catalogAliasesFor(entry).some((alias) => alias.toLowerCase().startsWith(first))) return 2
    return 3
  }
  return [...matches]
    .sort((a, b) => score(a) - score(b) || String(a.name || '').localeCompare(String(b.name || ''), 'de'))
    .slice(0, limit)
}

const isInDatabase = (rawMaterials, catalogEntry) => rawMaterials.some((entry) => String(entry.catalogId || '') === catalogEntry.catalogId
  || (catalogEntry.eNumber && normalizeENumber(entry.eNumber) === normalizeENumber(catalogEntry.eNumber))
  || [catalogEntry.name, ...(catalogEntry.aliases || [])].some((name) => String(entry.name || '').trim().toLowerCase() === name.toLowerCase()))

// Katalogeinträge, die noch nicht in der eigenen Rohstoff-Datenbank sind.
export const searchCatalog = (rawMaterials, query, limit = 6, catalog = rawMaterialCatalog) => {
  const list = Array.isArray(rawMaterials) ? rawMaterials : []
  return rankEntries(catalog.filter((entry) => !isInDatabase(list, entry)), query, limit)
}

export const catalogEntryToRawMaterial = (catalogEntry, id, now) => ({
  ...initialRawMaterialForm,
  id,
  catalogId: catalogEntry.catalogId,
  name: catalogEntry.name,
  eNumber: catalogEntry.eNumber,
  additiveClass: catalogEntry.additiveClass,
  category: catalogEntry.category,
  unit: catalogEntry.unit,
  pricePerUnit: Number.isFinite(catalogEntry.referencePrice) ? formatPriceInput(catalogEntry.referencePrice) : '',
  priceSource: Number.isFinite(catalogEntry.referencePrice) ? 'Richtwert' : '',
  createdAt: now,
  updatedAt: now,
})

export const missingCatalogEntries = (rawMaterials, filter = () => true, catalog = rawMaterialCatalog) => {
  const list = Array.isArray(rawMaterials) ? rawMaterials : []
  return catalog.filter((entry) => filter(entry) && !isInDatabase(list, entry))
}

// Anzeigename mit E-Nummer, z. B. „Citronensäure (E 330)“.
export const rawMaterialLabel = (entry) => (entry?.eNumber ? `${entry.name} (${entry.eNumber})` : entry?.name || '')

const unitFactors = {
  mg: { dimension: 'mass', factor: 0.001 },
  g: { dimension: 'mass', factor: 1 },
  kg: { dimension: 'mass', factor: 1000 },
  ml: { dimension: 'volume', factor: 1 },
  l: { dimension: 'volume', factor: 1000 },
}

export const normalizeUnit = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (['stück', 'stk', 'stk.', 'st', 'pcs'].includes(text)) return 'Stück'
  if (['liter', 'ltr'].includes(text)) return 'l'
  if (['gramm', 'gr'].includes(text)) return 'g'
  return unitFactors[text] ? text : String(value || '').trim()
}

// „12.500“, „2,1“, „1.234,5“ → Zahl (deutsche Schreibweise).
export const parseAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  let text = String(value ?? '').trim().replace(/\s/g, '')
  if (!text) return NaN
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '')
  const number = Number(text)
  return Number.isFinite(number) ? number : NaN
}

// Menge in Basiseinheit (g bzw. ml); null bei Stück oder unbekannter Einheit.
export const toBase = (amount, unit) => {
  const info = unitFactors[normalizeUnit(unit)]
  const number = parseAmount(amount)
  if (!info || !Number.isFinite(number)) return null
  return { dimension: info.dimension, value: number * info.factor }
}

// Menge in eine andere Einheit derselben Dimension umrechnen (g ↔ kg, ml ↔ l). Stück nur zu Stück.
export const convertAmount = (amount, fromUnit, toUnit) => {
  const from = normalizeUnit(fromUnit)
  const to = normalizeUnit(toUnit)
  const number = parseAmount(amount)
  if (!Number.isFinite(number)) return null
  if (from === to) return number
  const a = unitFactors[from]
  const b = unitFactors[to]
  if (!a || !b || a.dimension !== b.dimension) return null
  return (number * a.factor) / b.factor
}

// Batchgröße wie „12.500ml“ oder „10 l“ → Liter.
export const parseBatchLiters = (batchSize) => {
  const match = String(batchSize || '').trim().match(/^([\d.,\s]+)\s*(ml|l|liter)?$/i)
  if (!match) return null
  const amount = parseAmount(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = (match[2] || 'ml').toLowerCase()
  return unit === 'ml' ? amount / 1000 : amount
}

// Batchgröße „12.500ml“ / „10 l“ → { amount: '12.500', unit: 'ml' } für Eingabefeld + Einheit-Auswahl.
export const splitBatchSize = (batchSize) => {
  const match = String(batchSize || '').trim().match(/^([\d.,\s]*)\s*(ml|l|liter)?$/i)
  if (!match) return { amount: String(batchSize || ''), unit: 'ml' }
  const unit = (match[2] || 'ml').toLowerCase() === 'ml' ? 'ml' : 'l'
  return { amount: match[1].trim(), unit }
}
export const joinBatchSize = (amount, unit) => {
  const text = String(amount || '').trim()
  if (!text) return ''
  return unit === 'l' ? `${text} l` : `${text}ml`
}

// Rezepturart: fertiges Getränk oder Konzentrat (Sirup), das im Verhältnis 1 + X mit Wasser verdünnt wird.
export const recipeKinds = ['Fertiges Getränk', 'Konzentrat']
// Liter fertiges Getränk je Liter Rezeptur (1 bei fertigem Getränk, 1 + X bei Konzentrat).
export const dilutionFactor = (kind, dilution) => {
  if (kind !== 'Konzentrat') return 1
  const parts = parseAmount(dilution)
  return Number.isFinite(parts) && parts > 0 ? 1 + parts : null
}

export const createRecipeItem = (rawMaterial = null) => ({
  id: `ri-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  rawMaterialId: rawMaterial?.id ?? '',
  name: rawMaterial?.name || '',
  amount: '',
  unit: rawMaterial ? defaultRecipeUnit(rawMaterial.unit) : 'g',
  note: '',
})

// In der Rezeptur meist kleinere Einheit als im Einkauf (kg → g, l → ml).
export const defaultRecipeUnit = (unit) => ({ kg: 'g', l: 'ml' })[normalizeUnit(unit)] || normalizeUnit(unit) || 'g'

export const findRawMaterial = (rawMaterials, item) => (item?.rawMaterialId
  ? rawMaterials.find((entry) => String(entry.id) === String(item.rawMaterialId))
  : null) || null

export const searchRawMaterials = (rawMaterials, query, limit = 8) => rankEntries(Array.isArray(rawMaterials) ? rawMaterials : [], query, limit)

// Auffüllen („ad Batchgröße“, z. B. Wasser): Die Menge der markierten Zeile ist Batchgröße minus alle anderen Zeilen
// (Dichte 1, 1 g ≈ 1 ml). Nur die erste markierte Zeile zählt. Gibt { amount (in der Einheit der Zeile), error } zurück.
export const resolveFillUp = (items, batchSize) => {
  const list = Array.isArray(items) ? items : []
  const fillIndex = list.findIndex((item) => item?.fillUp)
  if (fillIndex < 0) return null
  const fillItem = list[fillIndex]
  const batchLiters = parseBatchLiters(batchSize)
  const targetBase = batchLiters ? batchLiters * 1000 : null
  const info = unitFactors[normalizeUnit(fillItem.unit)]
  if (!targetBase) return { index: fillIndex, amount: null, targetBase: null, error: 'Batchgröße fehlt – zum Auffüllen oben z. B. „10.000ml“ eintragen.' }
  if (!info) return { index: fillIndex, amount: null, targetBase, error: 'Zum Auffüllen Einheit ml, l, g oder kg wählen.' }
  const othersBase = list.reduce((sum, item, index) => {
    if (index === fillIndex) return sum
    const base = toBase(item.amount, item.unit)
    return sum + (base ? base.value : 0)
  }, 0)
  const remaining = targetBase - othersBase
  if (remaining <= 0) return { index: fillIndex, amount: 0, targetBase, error: 'Die übrigen Zutaten sind schon größer als die Batchgröße.' }
  return { index: fillIndex, amount: Math.round((remaining / info.factor) * 1000) / 1000, targetBase, error: '' }
}

// Vor dem Speichern: berechnete Auffüll-Menge fest in die Zeile schreiben (für Ausdruck, Produktion, Nährwerte).
export const applyFillUp = (items, batchSize) => {
  const fill = resolveFillUp(items, batchSize)
  if (!fill || fill.amount === null || fill.error) return items
  return items.map((item, index) => index === fill.index ? { ...item, amount: formatAmountInput(fill.amount) } : item)
}

// Zeilen berechnen: Anteil (nach Masse/Volumen, Dichte 1) und Kosten aus Preis/Einheit des Rohstoffs.
export const calculateRecipe = (items, rawMaterials = [], batchSize = '') => {
  const fill = resolveFillUp(items, batchSize)
  const rows = (Array.isArray(items) ? items : []).map((sourceItem, index) => {
    const isFill = fill && fill.index === index
    const item = isFill ? { ...sourceItem, amount: fill.amount ?? '' } : sourceItem
    const rawMaterial = findRawMaterial(rawMaterials, item)
    const base = toBase(item.amount, item.unit)
    const price = parseAmount(rawMaterial?.pricePerUnit)
    const amountInPriceUnit = rawMaterial ? convertAmount(item.amount, item.unit, rawMaterial.unit) : null
    const cost = Number.isFinite(price) && amountInPriceUnit !== null ? amountInPriceUnit * price : null
    return {
      ...sourceItem,
      fillUp: Boolean(isFill),
      resolvedAmount: Number.isFinite(parseAmount(item.amount)) ? parseAmount(item.amount) : null,
      name: item.name || rawMaterial?.name || '',
      rawMaterial,
      baseAmount: base ? base.value : null,
      cost,
      priceIsReference: Boolean(rawMaterial?.priceSource === 'Richtwert'),
    }
  })
  const totalBase = rows.reduce((sum, row) => sum + (row.baseAmount ?? 0), 0)
  const withShare = rows.map((row) => ({
    ...row,
    share: totalBase > 0 && row.baseAmount !== null ? (row.baseAmount / totalBase) * 100 : null,
  }))
  const pricedRows = withShare.filter((row) => row.cost !== null)
  const totalCost = pricedRows.reduce((sum, row) => sum + row.cost, 0)
  const batchLiters = parseBatchLiters(batchSize)
  return {
    rows: withShare,
    totalBase,
    totalCost,
    costComplete: withShare.length > 0 && pricedRows.length === withShare.length,
    missingPrices: withShare.filter((row) => row.cost === null).map((row) => row.name || 'Ohne Namen'),
    batchLiters,
    costPerLiter: batchLiters ? totalCost / batchLiters : null,
    fillUp: fill,
    referencePriced: withShare.filter((row) => row.cost !== null && row.priceIsReference).map((row) => row.name),
  }
}

// ---- Richtpreise aus dem Katalog ----
const catalogEntryFor = (rawMaterial, catalog = rawMaterialCatalog) => {
  if (!rawMaterial) return null
  const byId = rawMaterial.catalogId && catalog.find((entry) => entry.catalogId === rawMaterial.catalogId)
  if (byId) return byId
  const eNumber = normalizeENumber(rawMaterial.eNumber)
  if (eNumber) {
    const byENumber = catalog.find((entry) => entry.eNumber && normalizeENumber(entry.eNumber) === eNumber)
    if (byENumber) return byENumber
  }
  const name = String(rawMaterial.name || '').trim().toLowerCase()
  return catalog.find((entry) => [entry.name, ...(entry.aliases || [])].some((alias) => alias.toLowerCase() === name)) || null
}

// Richtpreis umgerechnet auf die Einkaufseinheit des Rohstoffs (z. B. €/kg → €/g); null, wenn keiner bekannt ist.
export const referencePriceFor = (rawMaterial, catalog = rawMaterialCatalog) => {
  const entry = catalogEntryFor(rawMaterial, catalog)
  if (!entry || !Number.isFinite(entry.referencePrice)) return null
  const unit = normalizeUnit(rawMaterial.unit) || entry.unit
  const perUnit = convertAmount(1, unit, entry.unit)
  if (perUnit === null) return null
  return Math.round(entry.referencePrice * perUnit * 1e6) / 1e6
}

const hasPrice = (rawMaterial) => Number.isFinite(parseAmount(rawMaterial?.pricePerUnit))

// Fehlende Preise (nur leere!) mit Richtpreisen füllen. ids begrenzt optional auf bestimmte Rohstoffe.
export const fillReferencePrices = (rawMaterials, now, ids = null, catalog = rawMaterialCatalog) => {
  const allowed = ids ? new Set(ids.map(String)) : null
  const updated = []
  const list = (Array.isArray(rawMaterials) ? rawMaterials : []).map((entry) => {
    if (hasPrice(entry) || (allowed && !allowed.has(String(entry.id)))) return entry
    const price = referencePriceFor(entry, catalog)
    if (price === null) return entry
    updated.push(entry.name)
    return { ...entry, pricePerUnit: formatPriceInput(price), priceSource: 'Richtwert', updatedAt: now ?? entry.updatedAt }
  })
  return { list, updated }
}

const formatNumber = (value, digits = 2) => Number(value).toLocaleString('de-DE', { maximumFractionDigits: digits })

// Kompatibel zu bisherigen Stellen (Produktionsauftrag, Nährwert-KI): Zutaten als Text „Name: Menge Einheit“.
export const recipeItemsToText = (items) => (Array.isArray(items) ? items : [])
  .filter((item) => String(item.name || '').trim())
  .map((item) => {
    const amount = parseAmount(item.amount)
    const amountText = Number.isFinite(amount) ? `${formatNumber(amount, 3)}${item.unit ? ` ${item.unit}` : ''}` : ''
    const notes = [item.fillUp ? 'auffüllen auf Batchgröße' : '', String(item.note || '').trim()].filter(Boolean).join(', ')
    return `${String(item.name).trim()}${amountText ? `: ${amountText}` : ''}${notes ? ` (${notes})` : ''}`
  })
  .join('\n')

// Alte Freitext-Rezepturen („Zucker: 320g“) in Zeilen umwandeln und Rohstoffe per Name zuordnen.
export const parseIngredientText = (text, rawMaterials = []) => String(text || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [namePart, ...rest] = line.split(':')
    const name = namePart.trim()
    const match = rest.join(':').trim().match(/^([\d.,]+)\s*([a-zA-ZäöüÄÖÜ.]*)\s*(?:\((.*)\))?$/)
    const rawMaterial = rawMaterials.find((entry) => String(entry.name || '').trim().toLowerCase() === name.toLowerCase())
    return {
      ...createRecipeItem(rawMaterial),
      name: rawMaterial?.name || name,
      amount: match ? match[1] : '',
      unit: match && match[2] ? normalizeUnit(match[2]) : rawMaterial ? defaultRecipeUnit(rawMaterial.unit) : 'g',
      note: match ? (match[3] || '') : rest.join(':').trim(),
    }
  })

export const validateRawMaterial = (form, existing = [], editingId = null) => {
  const name = String(form.name || '').trim()
  if (!name) return 'Bitte einen Namen für den Rohstoff eingeben.'
  if (existing.some((entry) => String(entry.id) !== String(editingId) && String(entry.name || '').trim().toLowerCase() === name.toLowerCase())) {
    return `Den Rohstoff „${name}“ gibt es bereits.`
  }
  if (String(form.pricePerUnit || '').trim() && !(parseAmount(form.pricePerUnit) >= 0)) return 'Der Preis ist ungültig.'
  return ''
}
