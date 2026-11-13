// Lohnherstellung: Getränke im Auftrag anderer Firmen herstellen und abfüllen.
// Kalkulation je Auftrag aus Rezeptur (Rohstoffkosten je Liter), Verpackung, Abfülllohn, Fixkosten und Aufschlag.

import { calculateRecipe, dilutionFactor, parseAmount, parseBatchLiters } from './recipe-system.js'

export const contractJobStatuses = [
  'Anfrage', 'Bemusterung', 'Muster freigegeben', 'Angebot erstellt', 'Auftrag bestätigt', 'Rohstoffe bestellt', 'In Produktion', 'Abgefüllt', 'Ausgeliefert', 'Abgerechnet', 'Abgesagt',
]
export const openContractStatuses = contractJobStatuses.filter((status) => !['Abgerechnet', 'Abgesagt'].includes(status))
export const containerSizes = ['250', '330', '500', '750', '1000']
export const containerTypes = ['Dose', 'PET-Flasche', 'Glasflasche', 'Kanister / Bag-in-Box']
export const recipeSources = {
  eigen: 'Unsere Rezeptur (ZYRO entwickelt)',
  kunde: 'Rezeptur vom Auftraggeber',
  entwicklung: 'Wir entwickeln für den Auftraggeber',
}
export const supplyOptions = { wir: 'Wir beschaffen', kunde: 'Auftraggeber stellt bei (Beistellung)' }

// Bemusterung: mehrere Musterrunden je Auftrag bis zur Freigabe durch den Auftraggeber.
export const sampleStatuses = ['In Vorbereitung', 'Versendet', 'Feedback erhalten', 'Freigegeben', 'Abgelehnt']
export const createSample = (samples = []) => ({
  id: `sm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  round: (Array.isArray(samples) ? samples.length : 0) + 1,
  variant: '',
  date: '',
  quantity: '',
  shipping: '',
  cost: '',
  status: 'In Vorbereitung',
  rating: '',
  feedback: '',
})
export const approvedSample = (samples) => (Array.isArray(samples) ? samples : []).find((sample) => sample.status === 'Freigegeben') || null

// Ablauf-Checkliste je Auftrag.
export const contractChecklist = [
  { key: 'nda', label: 'Geheimhaltungsvereinbarung (NDA) unterschrieben' },
  { key: 'spec', label: 'Produktspezifikation / Briefing erhalten' },
  { key: 'samplesApproved', label: 'Muster vom Auftraggeber freigegeben' },
  { key: 'offerAccepted', label: 'Angebot angenommen / Auftrag schriftlich' },
  { key: 'labelApproved', label: 'Etikett & Kennzeichnung (LMIV, Zutaten, Nährwerte, MHD) freigegeben' },
  { key: 'materialsReady', label: 'Rohstoffe & Verpackung verfügbar' },
  { key: 'productionDone', label: 'Produktion & Abfüllung abgeschlossen' },
  { key: 'labOk', label: 'Laboranalyse / QS-Freigabe der Charge' },
  { key: 'retainSample', label: 'Rückstellmuster gezogen und eingelagert' },
  { key: 'delivered', label: 'Ausgeliefert, Lieferschein unterschrieben' },
  { key: 'invoiced', label: 'Rechnung gestellt' },
]
export const checklistProgress = (checklist) => {
  const done = contractChecklist.filter((item) => checklist?.[item.key]).length
  return { done, total: contractChecklist.length }
}

export const createContractJobForm = () => ({
  clientName: '',
  customerId: '',
  clientContact: '',
  clientEmail: '',
  clientPhone: '',
  productName: '',
  recipeId: '',
  recipeSource: 'kunde',
  ndaSigned: false,
  containerType: 'Dose',
  containerSize: '330',
  quantity: '',
  rawMaterialsBy: 'wir',
  packagingBy: 'wir',
  rawMaterialCostPerLiter: '',
  packagingPerUnit: '0,12',
  labelPerUnit: '0,03',
  fillingPerUnit: '0,08',
  palletPerUnit: '0,01',
  setupCost: '250',
  labCost: '150',
  developmentCost: '',
  otherCost: '',
  marginPercent: '25',
  vatRate: '19',
  requestDate: '',
  deliveryDate: '',
  lotNumber: '',
  bestBefore: '',
  status: 'Anfrage',
  samples: [],
  billSamples: true,
  checklist: {},
  notes: '',
})

const number = (value) => {
  const parsed = parseAmount(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits

// Rohstoffkosten je Liter fertiges Getränk aus einer gespeicherten Rezeptur (Konzentrat wird über das Mischverhältnis umgerechnet).
export const recipeCostPerDrinkLiter = (recipe, rawMaterials = []) => {
  if (!recipe || !Array.isArray(recipe.items) || !recipe.items.length) return null
  const calc = calculateRecipe(recipe.items, rawMaterials, recipe.batchSize)
  if (calc.costPerLiter === null) return null
  const factor = dilutionFactor(recipe.kind, recipe.dilution)
  if (!factor) return null
  return { costPerLiter: calc.costPerLiter / factor, complete: calc.costComplete, missingPrices: calc.missingPrices }
}

// Rohstoffbedarf für den Auftrag: Rezepturzeilen auf die benötigte Menge hochrechnen.
export const contractMaterialNeeds = (recipe, drinkLiters) => {
  if (!recipe || !Array.isArray(recipe.items) || !(drinkLiters > 0)) return []
  const batchLiters = parseBatchLiters(recipe.batchSize)
  const factor = dilutionFactor(recipe.kind, recipe.dilution)
  if (!batchLiters || !factor) return []
  const recipeLiters = drinkLiters / factor
  const scale = recipeLiters / batchLiters
  return recipe.items
    .filter((item) => String(item.name || '').trim())
    .map((item) => {
      const amount = parseAmount(item.amount)
      const scaled = Number.isFinite(amount) ? amount * scale : null
      // Große Mengen lesbar: g → kg, ml → l
      if (scaled !== null && item.unit === 'g' && scaled >= 1000) return { name: item.name, amount: round(scaled / 1000, 3), unit: 'kg' }
      if (scaled !== null && item.unit === 'ml' && scaled >= 1000) return { name: item.name, amount: round(scaled / 1000, 3), unit: 'l' }
      return { name: item.name, amount: scaled === null ? null : round(scaled, 3), unit: item.unit }
    })
}

export const calculateContractJob = (job, recipe = null, rawMaterials = []) => {
  const quantity = Math.max(0, Math.floor(number(job.quantity)))
  const containerMl = number(job.containerSize)
  const drinkLiters = (quantity * containerMl) / 1000
  const fromRecipe = recipeCostPerDrinkLiter(recipe, rawMaterials)
  const manualCost = String(job.rawMaterialCostPerLiter ?? '').trim()
  const rawCostPerLiter = manualCost ? number(manualCost) : fromRecipe?.costPerLiter ?? 0
  const rawMaterialsCost = job.rawMaterialsBy === 'kunde' ? 0 : drinkLiters * rawCostPerLiter
  const packagingCost = job.packagingBy === 'kunde' ? 0 : quantity * (number(job.packagingPerUnit) + number(job.labelPerUnit))
  const fillingCost = quantity * (number(job.fillingPerUnit) + number(job.palletPerUnit))
  const samples = Array.isArray(job.samples) ? job.samples : []
  const sampleCost = samples.reduce((sum, sample) => sum + number(sample.cost), 0)
  const billedSampleCost = job.billSamples === false ? 0 : sampleCost
  const fixedCost = number(job.setupCost) + number(job.labCost) + number(job.developmentCost) + number(job.otherCost) + billedSampleCost
  const costTotal = rawMaterialsCost + packagingCost + fillingCost + fixedCost
  const marginAmount = costTotal * (number(job.marginPercent) / 100)
  const netTotal = costTotal + marginAmount
  const vatAmount = netTotal * (number(job.vatRate) / 100)
  const warnings = []
  if (!quantity) warnings.push('Menge fehlt.')
  if (!containerMl) warnings.push('Gebindegröße fehlt.')
  if (job.rawMaterialsBy !== 'kunde' && !manualCost && !fromRecipe) warnings.push('Keine Rohstoffkosten: Rezeptur mit Preisen wählen oder Kosten je Liter eintragen.')
  if (job.rawMaterialsBy !== 'kunde' && !manualCost && fromRecipe && !fromRecipe.complete) warnings.push(`Rezeptur unvollständig bepreist (ohne Preis: ${fromRecipe.missingPrices.join(', ')}).`)
  if (['Angebot erstellt', 'Auftrag bestätigt'].includes(job.status) && samples.length && !approvedSample(samples)) warnings.push('Noch kein Muster freigegeben.')
  if (job.recipeSource === 'kunde' && !job.ndaSigned && !job.checklist?.nda) warnings.push('Rezeptur vom Auftraggeber: Geheimhaltungsvereinbarung (NDA) noch nicht unterschrieben.')
  return {
    quantity,
    containerMl,
    drinkLiters,
    rawCostPerLiter,
    rawCostSource: manualCost ? 'manuell' : fromRecipe ? 'Rezeptur' : 'fehlt',
    rawMaterialsCost,
    packagingCost,
    fillingCost,
    fixedCost,
    sampleCost,
    billedSampleCost,
    costTotal,
    marginAmount,
    netTotal,
    vatAmount,
    grossTotal: netTotal + vatAmount,
    costPerUnit: quantity ? costTotal / quantity : 0,
    pricePerUnit: quantity ? netTotal / quantity : 0,
    pricePerLiter: drinkLiters ? netTotal / drinkLiters : 0,
    materialNeeds: job.rawMaterialsBy === 'kunde' ? [] : contractMaterialNeeds(recipe, drinkLiters),
    warnings,
  }
}

// Fortlaufende Auftragsnummer je Jahr: LH-2026-001
export const nextContractJobNumber = (jobs, date = new Date()) => {
  const year = date.getFullYear()
  const prefix = `LH-${year}-`
  const max = (Array.isArray(jobs) ? jobs : [])
    .map((job) => String(job.number || ''))
    .filter((value) => value.startsWith(prefix))
    .reduce((highest, value) => Math.max(highest, Number(value.slice(prefix.length)) || 0), 0)
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export const validateContractJob = (form) => {
  if (!String(form.clientName || '').trim()) return 'Bitte den Auftraggeber eintragen.'
  if (!String(form.productName || '').trim()) return 'Bitte das Produkt (Getränkename) eintragen.'
  if (!(Math.floor(number(form.quantity)) > 0)) return 'Bitte die Menge (Anzahl Gebinde) eintragen.'
  if (!(number(form.containerSize) > 0)) return 'Bitte die Gebindegröße eintragen.'
  const margin = parseAmount(form.marginPercent)
  if (String(form.marginPercent || '').trim() && !(margin > -100)) return 'Der Aufschlag ist ungültig.'
  return ''
}
