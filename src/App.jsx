import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import './App.css'
import { analyzeOfferDraft, firebaseEnabled, generateMachinebauReport, generateRecipeDraft } from './firebase'
import { createMachinebauDraft, createMachinebauRecord, machinebauTypes } from './machinebau.js'
import {
  createHrEmployee,
  decryptHrSensitiveData,
  encryptHrSensitiveData,
  normalizeSocialSecurityNumber,
} from './hr-sensitive-data.js'
import { calculateFinanceReport, calculateVatSubmissionPreview } from './finance-accounting.js'
import {
  buildDatevPreparationCsv,
  createPurchaseFinanceEntry,
  createSalesInvoiceFinanceEntry,
  getSkr03AccountSuggestion,
} from './erp-accounting.js'
import { calculateProductionCost } from './production-calculation.js'
import { getShopIssues, getShopStock } from './shop-status.js'
import {
  getArchiveDocumentsBytes,
  maxArchiveDocumentsBytes,
  maxEmailArchiveAttachmentBytes,
} from './mailbox-archive.js'
import Mailbox from './Mailbox.jsx'
import SipSoftphone from './SipSoftphone.jsx'

const companyDetails = {
  name: 'Liberty Street Food GmbH',
  street: 'Birlenbacherstr 59',
  city: '57078 Siegen',
  taxNumber: '044/238/25255',
  vatId: 'DE458399062',
  iban: 'DE42460500010030988323',
}
const CustomerMap = lazy(() => import('./CustomerMap.jsx'))
const initialInvoiceCompanyDetails = {
  id: 'global',
  ...companyDetails,
  postalCode: '57078',
  city: 'Siegen',
  country: 'Deutschland',
  email: 'info@zyro-getränke.de',
  phone: '',
  website: 'https://www.zyro-getränke.de',
  managingDirectors: '',
  legalForm: '',
  registeredOffice: '',
  commercialRegister: '',
  registrationCourt: '',
  documentLayout: 'zyro',
}
const invoiceCompanyFields = [
  { name: 'name', label: 'Firmenname', maxLength: 120, required: true },
  { name: 'street', label: 'Straße und Hausnummer', maxLength: 180, required: true },
  { name: 'postalCode', label: 'Postleitzahl', maxLength: 20, required: true },
  { name: 'city', label: 'Ort', maxLength: 100, required: true },
  { name: 'country', label: 'Land', maxLength: 80, required: true },
  { name: 'email', label: 'Firmen-E-Mail', type: 'email', maxLength: 254 },
  { name: 'phone', label: 'Telefon', type: 'tel', maxLength: 40 },
  { name: 'website', label: 'Website', type: 'url', maxLength: 200 },
  { name: 'taxNumber', label: 'Steuernummer', maxLength: 40 },
  { name: 'vatId', label: 'Umsatzsteuer-ID', maxLength: 40 },
  { name: 'iban', label: 'IBAN', maxLength: 34 },
]
const invoiceCompanyLegalFields = [
  { name: 'managingDirectors', label: 'Geschäftsführer (Namen)', maxLength: 300, placeholder: 'Mehrere Namen mit Komma trennen' },
  { name: 'legalForm', label: 'Rechtsform', maxLength: 80, placeholder: 'z. B. GmbH' },
  { name: 'registeredOffice', label: 'Unternehmenssitz', maxLength: 100 },
  { name: 'commercialRegister', label: 'Handelsregistereintrag', maxLength: 80, placeholder: 'z. B. HRB 12345' },
  { name: 'registrationCourt', label: 'Registergericht', maxLength: 100 },
]
const allInvoiceCompanyFields = [...invoiceCompanyFields, ...invoiceCompanyLegalFields, { name: 'documentLayout' }]
const documentLayoutOptions = [
  { value: 'zyro', label: 'ZYRO – markant' },
  { value: 'modern', label: 'Modern – dunkelblau' },
  { value: 'classic', label: 'Klassisch – seriös' },
]

const initialBottlerDetails = {
  id: 'global',
  name: 'Nanotrade GmbH',
  street: 'Paul-Joseph-Str. 12',
  city: '64658 Fürth',
}
const salesDocumentTypes = {
  angebot: { label: 'Angebot', prefix: 'ANG' },
  rechnung: { label: 'Rechnung', prefix: 'RE' },
  kundenauftrag: { label: 'Auftragsbestätigung', prefix: 'KA' },
}

const allowedRecipeIngredientCategories = [
  'Wasser',
  'Frucht-/Saftkonzentrat',
  'Aroma/Extrakt',
  'Zucker/Süßungsmittel',
  'Säuerungsmittel',
  'Kohlensäure',
  'Vitamine/Mineralstoffe',
  'Koffein (nur wenn angefordert)',
]

const paymentMethods = ['Vorkasse', 'Rechnung', 'Überweisung', 'Barzahlung', 'PayPal', 'Lastschrift', 'Sonstiges']
const shippingMethods = ['DPD Paket', 'Spedition', 'Selbstabholung', 'Sonstiges']
const defaultShopShippingTiers = [
  { maxWeightGrams: 2000, label: 'DPD Paket bis 2 kg', priceCents: 619 },
  { maxWeightGrams: 5000, label: 'DPD Paket bis 5 kg', priceCents: 769 },
  { maxWeightGrams: 10000, label: 'DPD Paket bis 10 kg', priceCents: 1049 },
  { maxWeightGrams: 20000, label: 'DPD Paket bis 20 kg', priceCents: 1899 },
  { maxWeightGrams: 31500, label: 'DPD Paket bis 31,5 kg', priceCents: 2399 },
]
const defaultShopShippingPricePerPalletCents = 8500
const defaultShopShippingTraysPerPallet = 64
const defaultBusinessDpdMaxTrays = 2

const salesDocumentStatuses = {
  angebot: ['Offen', 'Angenommen', 'Abgelehnt', 'Abgelaufen'],
  kundenauftrag: ['Offen', 'Bestätigt', 'In Produktion', 'Kommissionierung', 'Verpackt', 'Versendet', 'Abgeschlossen', 'Storniert'],
  rechnung: ['Entwurf', 'Versendet', 'Bezahlt', 'Überfällig', 'Storniert'],
}

const ticketStatusLabels = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  wartend: 'Wartet auf Rückmeldung',
  erledigt: 'Erledigt',
  abgelehnt: 'Abgelehnt',
  freigegeben: 'Freigegeben',
}

const generalTicketStatuses = ['offen', 'in_bearbeitung', 'wartend', 'erledigt', 'abgelehnt']

const isRecipeApproved = (recipe) => ['Freigegeben', 'Aktiv'].includes(recipe?.status)

const seedProducts = [
  { id: 1, name: 'Zyro Citrus Rush', sku: 'ZYR-CR-001', category: 'Energy', volume: '500ml', status: 'Aktiv' },
  { id: 2, name: 'Zyro Berry Pulse', sku: 'ZYR-BP-002', category: 'Fruit', volume: '500ml', status: 'Aktiv' },
  { id: 3, name: 'Zyro Zero Lime', sku: 'ZYR-ZL-003', category: 'Zero', volume: '500ml', status: 'In Planung' },
  { id: 'web-pfirsich-maracuja', name: 'Pfrisch Maracuja', sku: '', category: 'Fruit', volume: '500ml', status: 'Aktiv' },
]

const seedRecipes = [
  {
    id: 1,
    name: 'Zyro Citrus Rush',
    type: 'Energy',
    batchSize: '12.500ml',
    description: 'Zitronen-Lime mit leichter Grüntee-Note',
    ingredients: 'Wasser: 7.400ml\nZitronensaft: 2.100ml\nKoffein: 180mg\nZucker: 320g\nNaturfarben: 40ml',
    status: 'Aktiv',
  },
  {
    id: 2,
    name: 'Zyro Berry Pulse',
    type: 'Fruit',
    batchSize: '10.000ml',
    description: 'Himbeer- und Brombeerprofil mit mildem Aroma',
    ingredients: 'Wasser: 6.300ml\nHimbeersaft: 1.800ml\nBrombeersaft: 1.100ml\nSüßungsmittel: 420g\nFarbstoff: 30ml',
    status: 'Freigegeben',
  },
]

const seedOrders = []
const legacyDemoOrderKeys = new Set(['101|CH26-001', '102|CH26-002', '103|CH26-003'])
const seedInventory = [
  { item: 'Zitronensaft', stock: 86, ideal: 80, status: 'Gut' },
  { item: 'Himbeersaft', stock: 71, ideal: 75, status: 'Gut' },
  { item: 'Koffein', stock: 44, ideal: 60, status: 'Nachbestellen' },
  { item: 'Wasser', stock: 93, ideal: 85, status: 'Gut' },
]

const baseTabs = ['dashboard', 'tickets', 'telefon', 'dokumente', 'etiketten', 'produkte', 'rezepturen', 'bestellungen', 'verkauf', 'kunden', 'analyse', 'lager', 'mde', 'versand', 'chargen', 'einkauf']
const financeCategories = {
  income: ['Warenverkauf', 'Sonstige Einnahmen', 'Erstattungen'],
  expense: ['Wareneinkauf', 'Verpackung und Versand', 'Miete und Nebenkosten', 'Telefon und Internet', 'Marketing', 'Fahrtkosten', 'Gebühren', 'Versicherungen', 'Büro und Verwaltung', 'Sonstige Betriebsausgaben'],
}
const financeReceiptType = (file) => file.type || ({
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}[file.name.split('.').pop()?.toLowerCase()] || '')
const createProductionCalculationForm = () => ({
  title: '',
  productId: '',
  batchBottles: '1000',
  bottlesPerCrate: '24',
  ingredients: [{ name: '', amount: '', unit: 'kg', unitPrice: '' }],
  packaging: [{ name: '', amount: '', unit: 'Stück', unitPrice: '' }],
  laborCost: '',
  overheadCost: '',
  targetMarginPercent: '40',
  vatRate: '19',
  offerAnalysis: null,
})
const formatFileSize = (size) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / (1024 * 1024)).toFixed(1)} MB`
const employeePermissionTabs = [...baseTabs, 'finanzen']
const canManageFinance = (user) => user?.role === 'admin'
  || (Array.isArray(user?.permissions) && user.permissions.includes('finanzen'))
const createFinanceEntryForm = () => {
  const today = new Date().toISOString().slice(0, 10)
  return { type: 'expense', category: 'Wareneinkauf', date: today, paidAt: today, description: '', counterparty: '', documentNumber: '', grossAmount: '', vatRate: '19', accountNumber: '', sourceDocumentId: '', receiptAvailable: false }
}
const createPaymentRequestForm = () => ({
  clientName: '',
  recipientName: '',
  recipientIban: '',
  recipientBic: '',
  amount: '',
  purpose: '',
  reference: '',
  requestedExecutionDate: new Date().toISOString().slice(0, 10),
})
const paymentStatusLabels = {
  pending: 'Offen',
  approved: 'Freigegeben',
  rejected: 'Abgelehnt',
  exported: 'SEPA-Datei erstellt',
  paid: 'Überwiesen',
}
const formatPaymentAmount = (cents) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const getPaymentDate = () => new Date()
const escapePaymentXml = (value) => String(value || '').replace(/[<>&'"]/g, (character) => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
}[character]))
const buildPaymentSepaXml = (settings, requests, createdAt = new Date()) => {
  const formatCents = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
  const today = createdAt.toISOString().slice(0, 10)
  const groups = new Map()
  requests.forEach((request) => {
    const executionDate = request.requestedExecutionDate < today ? today : request.requestedExecutionDate
    groups.set(executionDate, [...(groups.get(executionDate) || []), request])
  })
  const totalCents = requests.reduce((sum, request) => sum + request.amountCents, 0)
  const messageId = `ZYRO-${createdAt.toISOString().replace(/\D/g, '').slice(0, 20)}`
  const debtorAgent = settings.bic
    ? `<BIC>${escapePaymentXml(settings.bic.toUpperCase())}</BIC>`
    : '<Othr><Id>NOTPROVIDED</Id></Othr>'
  const paymentInfos = [...groups.entries()].map(([executionDate, group], groupIndex) => {
    const groupCents = group.reduce((sum, request) => sum + request.amountCents, 0)
    const transactions = group.map((request) => {
      const endToEndId = request.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35) || 'NOTPROVIDED'
      const remittance = [request.purpose, request.reference].filter(Boolean).join(' · ').slice(0, 140)
      const creditorAgent = request.recipientBic && /^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/i.test(request.recipientBic)
        ? `<BIC>${escapePaymentXml(request.recipientBic.toUpperCase())}</BIC>`
        : '<Othr><Id>NOTPROVIDED</Id></Othr>'
      return `<CdtTrfTxInf><PmtId><EndToEndId>${escapePaymentXml(endToEndId)}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${formatCents(request.amountCents)}</InstdAmt></Amt><CdtrAgt><FinInstnId>${creditorAgent}</FinInstnId></CdtrAgt><Cdtr><Nm>${escapePaymentXml(request.recipientName)}</Nm></Cdtr><CdtrAcct><Id><IBAN>${escapePaymentXml(request.recipientIban.replace(/\s+/g, '').toUpperCase())}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${escapePaymentXml(remittance)}</Ustrd></RmtInf></CdtTrfTxInf>`
    }).join('')
    return `<PmtInf><PmtInfId>${messageId}-${groupIndex + 1}</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${group.length}</NbOfTxs><CtrlSum>${formatCents(groupCents)}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${executionDate}</ReqdExctnDt><Dbtr><Nm>${escapePaymentXml(settings.accountName)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${escapePaymentXml(settings.iban.replace(/\s+/g, '').toUpperCase())}</IBAN></Id></DbtrAcct><DbtrAgt><FinInstnId>${debtorAgent}</FinInstnId></DbtrAgt><ChrgBr>SLEV</ChrgBr>${transactions}</PmtInf>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn><GrpHdr><MsgId>${messageId}</MsgId><CreDtTm>${createdAt.toISOString()}</CreDtTm><NbOfTxs>${requests.length}</NbOfTxs><CtrlSum>${formatCents(totalCents)}</CtrlSum><InitgPty><Nm>${escapePaymentXml(settings.accountName)}</Nm></InitgPty></GrpHdr>${paymentInfos}</CstmrCdtTrfInitn></Document>`
}
const initialElsterSetup = {
  businessName: '',
  taxNumber: '',
  taxOffice: '',
  federalState: '',
  filingPeriod: 'monthly',
  developerStatus: 'not-started',
  manufacturerId: '',
  ericVersion: '',
}
const elsterSetupFromEntries = (entries) => ({
  ...initialElsterSetup,
  ...(Array.isArray(entries) ? entries.find((entry) => entry?.id === 'setup') : null),
})
const elsterSetupEntry = (setup) => ({ id: 'setup', ...setup })
const requestedManagementMode = new URLSearchParams(window.location.search).get('mode')
const scannerStandalone = requestedManagementMode === 'scanner'
if (scannerStandalone) {
  document.documentElement.classList.add('scanner-mode')
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
}
const permissionLabels = {
  dashboard: 'Dashboard',
  tickets: 'Tickets',
  telefon: 'Telefon',
  dokumente: 'Dokumentenarchiv',
  etiketten: 'Dosendesign',
  produkte: 'Produkte',
  rezepturen: 'Rezepturen',
  bestellungen: 'Bestellungen',
  verkauf: 'Verkauf',
  kunden: 'Kunden',
  analyse: 'Umsatzanalyse',
  finanzen: 'Finanzen',
  lager: 'Lager',
  mde: 'MDE · Scanner',
  versand: 'Versand & Tracking',
  chargen: 'Chargen',
  maschinenbau: 'Maschinenbau',
}

const initialRecipeForm = { name: '', type: 'Energy', batchSize: '', description: '', ingredients: '', labReports: [] }
const createLabTestForm = () => ({
  sampleCode: 'A',
  recipeId: '',
  peachFlavorGrams: '',
  passionFruitFlavorGrams: '',
  phValue: '',
  fruitiness: 5,
  naturalness: 5,
  aftertaste: 'not-tested',
  sweetness: 'not-tested',
  observations: '',
})
const labAftertasteLabels = {
  poor: 'Schlecht',
  medium: 'Mittel',
  'very-good': 'Sehr gut',
  'not-tested': 'Noch nicht getestet',
}
const labSweetnessLabels = {
  'too-little': 'Zu wenig süß',
  balanced: 'Ausgewogen',
  'too-sweet': 'Zu süß',
  'not-tested': 'Noch nicht getestet',
}
const labRatingLabels = (rating) => `${rating}/10`
const initialProductForm = { name: '', sku: '', ean13: '', category: 'Energy', volume: '500ml', productionQuantity: '', productionUnit: 'Dosen', availableBottles: '', unitPrice: '', status: 'Aktiv', labReports: [], labelAttachment: null, depositPerUnit: '', minStock: '', lotNumber: '', bestBefore: '', bottlesPerCase: '24', weightKg: '', shopImage: '', shopImages: [], shopActive: false, shopPreorderEnabled: false, shopExpectedDeliveryDate: '', shopCratePrice: '', shopDescription: '', shopIngredients: '', shopNutrition: '', shopNutritionValues: {}, tier1Qty: '', tier1Pct: '', tier2Qty: '', tier2Pct: '' }
const shopCatalogProductId = (product) => String(product.sku || product.name || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48)
const nutritionFields = [
  { name: 'energyKj', label: 'Brennwert', unit: 'kJ', step: '1' },
  { name: 'energyKcal', label: 'Brennwert', unit: 'kcal', step: '1' },
  { name: 'fat', label: 'Fett', unit: 'g', step: '0.1' },
  { name: 'saturates', label: 'davon gesättigte Fettsäuren', unit: 'g', step: '0.1' },
  { name: 'carbohydrates', label: 'Kohlenhydrate', unit: 'g', step: '0.1' },
  { name: 'sugars', label: 'davon Zucker', unit: 'g', step: '0.1' },
  { name: 'protein', label: 'Eiweiß', unit: 'g', step: '0.1' },
  { name: 'salt', label: 'Salz', unit: 'g', step: '0.01' },
]
const formatNutritionValues = (values = {}) => {
  const lines = []
  if (values.energyKj || values.energyKcal) {
    lines.push(`Brennwert ${values.energyKj ? `${values.energyKj} kJ` : ''}${values.energyKj && values.energyKcal ? ' / ' : ''}${values.energyKcal ? `${values.energyKcal} kcal` : ''}`)
  }
  nutritionFields.slice(2).forEach((field) => {
    if (values[field.name] !== '' && values[field.name] !== undefined) lines.push(`${field.label} ${values[field.name]} ${field.unit}`)
  })
  return lines.join('\n')
}
const productExtras = (form) => ({
  labelAttachment: form.labelAttachment || null,
  shopImages: (Array.isArray(form.shopImages) && form.shopImages.length ? form.shopImages : (form.shopImage ? [form.shopImage] : [])).slice(0, 5),
  shopImage: (Array.isArray(form.shopImages) && form.shopImages.length ? form.shopImages[0] : form.shopImage) || '',
  shopActive: Boolean(form.shopActive),
  shopPreorderEnabled: Boolean(form.shopPreorderEnabled),
  shopExpectedDeliveryDate: String(form.shopExpectedDeliveryDate || ''),
  shopCratePrice: Math.max(0, Number(String(form.shopCratePrice).replace(',', '.')) || 0),
  shopDescription: String(form.shopDescription || '').trim().slice(0, 1500),
  shopIngredients: String(form.shopIngredients || '').trim().slice(0, 600),
  shopNutritionValues: Object.fromEntries(nutritionFields.map(({ name }) => [name, String(form.shopNutritionValues?.[name] ?? '').trim()])),
  shopNutrition: (Object.values(form.shopNutritionValues || {}).some((value) => String(value).trim() !== '')
    ? formatNutritionValues(form.shopNutritionValues)
    : String(form.shopNutrition || '').trim()).slice(0, 600),
  shopTiers: [[form.tier1Qty, form.tier1Pct], [form.tier2Qty, form.tier2Pct]]
    .map(([qty, pct]) => ({ minQuantity: Math.floor(Number(qty)), percent: Number(String(pct).replace(',', '.')) }))
    .filter((tier) => tier.minQuantity > 0 && tier.percent > 0 && tier.percent < 100),
  depositPerUnit: Math.max(0, Number(String(form.depositPerUnit).replace(',', '.')) || 0),
  minStock: form.minStock === '' ? null : Math.max(0, Math.floor(Number(form.minStock)) || 0),
  lotNumber: String(form.lotNumber || '').trim(),
  bestBefore: form.bestBefore || '',
  bottlesPerCase: 24,
  weightKg: Math.max(0, Number(String(form.weightKg).replace(',', '.')) || 0),
})
const productExtrasToForm = (product) => ({
  labelAttachment: product.labelAttachment || null,
  shopImage: (Array.isArray(product.shopImages) && product.shopImages.length ? product.shopImages[0] : product.shopImage) || '',
  shopImages: (Array.isArray(product.shopImages) && product.shopImages.length ? product.shopImages : (product.shopImage ? [product.shopImage] : [])).slice(0, 5),
  shopActive: Boolean(product.shopActive),
  shopPreorderEnabled: Boolean(product.shopPreorderEnabled),
  shopExpectedDeliveryDate: product.shopExpectedDeliveryDate || '',
  shopCratePrice: product.shopCratePrice ? String(product.shopCratePrice) : '',
  shopDescription: product.shopDescription || '',
  shopIngredients: product.shopIngredients || '',
  shopNutrition: product.shopNutrition || '',
  shopNutritionValues: product.shopNutritionValues || {},
  tier1Qty: product.shopTiers?.[0] ? String(product.shopTiers[0].minQuantity) : '',
  tier1Pct: product.shopTiers?.[0] ? String(product.shopTiers[0].percent) : '',
  tier2Qty: product.shopTiers?.[1] ? String(product.shopTiers[1].minQuantity) : '',
  tier2Pct: product.shopTiers?.[1] ? String(product.shopTiers[1].percent) : '',
  depositPerUnit: product.depositPerUnit ? String(product.depositPerUnit) : '',
  minStock: Number.isSafeInteger(product.minStock) ? String(product.minStock) : '',
  lotNumber: product.lotNumber || '',
  bestBefore: product.bestBefore || '',
  bottlesPerCase: '24',
  weightKg: product.weightKg ? String(product.weightKg) : '',
})
const isLowStock = (product) => Number.isSafeInteger(product.minStock) && Number.isSafeInteger(product.availableBottles) && product.availableBottles < product.minStock
const displayProductVolume = (volume) => /330\s*ml|0[,.]33\s*l/i.test(String(volume || ''))
  ? '500ml'
  : (volume || '500ml')
const isBestBeforeSoon = (product) => {
  if (!product.bestBefore) return false
  const days = (new Date(product.bestBefore).getTime() - Date.now()) / 86400000
  return days < 60
}
const isValidExpectedDeliveryDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value >= new Date().toISOString().slice(0, 10)
}
const initialBottleLabel = { ean13: '', volume: '0,5 l', tagline: '', productDescription: '', backDescription: '', artworkDataUrl: '', ingredients: '', allergens: '', energyKj: '', energyKcal: '', fat: '', saturates: '', carbohydrates: '', sugars: '', protein: '', salt: '', nutritionEstimated: false, nutritionEstimatedAt: '', nutritionConfirmed: false, operatorName: companyDetails.name, operatorAddress: `${companyDetails.street}\n${companyDetails.city}`, storage: '', deposit: '', lotNumber: '', bestBefore: '', labelFormat: 'rundum', widthMm: '190', heightMm: '100', design: null }
const isValidEan13 = (value) => {
  if (!/^\d{13}$/.test(value)) return false
  const digits = [...value].map(Number)
  const checkDigit = (10 - digits.slice(0, 12).reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3), 0) % 10) % 10
  return digits[12] === checkDigit
}
const initialOrderForm = { customer: companyDetails.name, product: 'ZYRO Pfirsich-Maracuja-Limonade', bottleCount: '', crateCount: '', bottler: initialBottlerDetails.name, recipeId: '', productionNotes: '', handoffDate: '', dueDate: '', status: 'In Produktion' }
const initialCustomerForm = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  shippingAddress: '',
  vatId: '',
  iban: '',
  paymentTerms: '',
  paymentMethod: '',
  notes: '',
}
const initialSalesDocumentForm = { kind: 'angebot', customerId: '', recipient: '', recipientEmail: '', recipientAddress: '', lotNumber: '', relatedOrderId: '', items: [{ productId: '', quantity: '1', unitPrice: '' }], vatRate: '19', documentDate: new Date().toISOString().slice(0, 10), dueDate: '', paymentMethod: 'Vorkasse', customPaymentMethod: '', shippingMethod: 'DPD Paket', customShippingMethod: '', notes: '', status: 'Offen' }
const createReportDraft = (userName = '') => ({
  title: '',
  type: 'Qualitätsbericht',
  date: new Date().toISOString().slice(0, 10),
  product: '',
  batchNumber: '',
  summary: '',
  content: '',
  status: 'Entwurf',
  author: userName,
})
const initialInventoryForm = { item: '', stock: '', ideal: '', status: 'Gut' }
const initialMdeReceipt = { barcode: '', quantity: '1', note: '', lot: '', bestBefore: '', preparedChargeId: '' }
const initialLoginForm = { username: '', password: '' }
const initialRegistrationForm = { name: '', username: '', password: '', activationKey: '' }
const initialUserForm = { role: 'mitarbeiter' }
const initialTicketForm = { subject: '', category: 'allgemein', priority: 'normal', description: '', targetType: '', targetId: '', targetName: '', targetDetails: null }

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]))

const renderReportInline = (text, keyPrefix) => text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
  part.startsWith('**') && part.endsWith('**')
    ? <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    : <span key={`${keyPrefix}-${index}`}>{part}</span>
))

const renderReportContent = (content) => String(content || '').split('\n').map((line, index) => {
  const key = `report-line-${index}`
  if (!line.trim()) return <div className="report-preview-spacer" key={key} />
  if (line.startsWith('## ')) return <h3 key={key}>{renderReportInline(line.slice(3), key)}</h3>
  if (line.startsWith('- ')) return <p className="report-preview-list-item" key={key}>{renderReportInline(line.slice(2), key)}</p>
  return <p key={key}>{renderReportInline(line, key)}</p>
})

const getSalesDocumentItems = (salesDocument) => {
  if (salesDocument?.items?.length) return salesDocument.items
  if (!salesDocument) return []

  return [{
    productId: salesDocument.productId ?? '',
    productName: salesDocument.productName ?? '',
    productSku: salesDocument.productSku ?? '',
    productCategory: salesDocument.productCategory ?? '',
    productVolume: salesDocument.productVolume ?? '',
    description: salesDocument.description ?? '',
    quantity: salesDocument.quantity ?? 1,
    unitPrice: salesDocument.unitPrice ?? 0,
  }]
}

const getCurrentTimestamp = () => new Date().toISOString()
const getDateAfterDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const formatTimestamp = (value) => {
  if (value == null || value === '') return 'Nicht verfügbar'
  const date = value?.toDate instanceof Function ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Nicht verfügbar'
    : new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

const readUserNotifications = (userId) => {
  try {
    const notifications = JSON.parse(window.localStorage.getItem(`zyro-notifications-${userId}`) || '[]')
    return Array.isArray(notifications) ? notifications : []
  } catch {
    return []
  }
}

const readStorage = (key, fallback) => {
  if (typeof window === 'undefined') return fallback
  const persisted = window.zyroData?.get(key)
  if (persisted?.found) return persisted.value
  const item = window.localStorage.getItem(key)
  return item ? JSON.parse(item) : fallback
}

const normalizeInvoiceCompanyEmailForDisplay = (email) => {
  const value = String(email || '').trim()
  if (/^info@libertystreetfood\.de$/i.test(value) || /^info@xn--zyro-getrnke-ocb\.de$/i.test(value)) {
    return 'info@zyro-getränke.de'
  }
  return value
}

const readInvoiceCompanyDetails = () => {
  const entries = readStorage('zyro-company-details', [])
  const details = {
    ...initialInvoiceCompanyDetails,
    ...(Array.isArray(entries) ? entries.find((entry) => entry?.id === 'global') : {}),
  }
  return { ...details, email: normalizeInvoiceCompanyEmailForDisplay(details.email) }
}

const readBottlerDetails = () => {
  const entries = readStorage('zyro-bottler-details', [initialBottlerDetails])
  return {
    ...initialBottlerDetails,
    ...(Array.isArray(entries) ? entries.find((entry) => entry?.id === 'global') : {}),
  }
}

const readOrders = () => readStorage('zyro-orders', seedOrders)
  .filter((order) => !legacyDemoOrderKeys.has(`${order.id}|${order.lotNumber}`))

const callRingtonePatterns = {
  classic: { label: 'Klassisch', notes: [880, 0, 698, 0], noteDuration: 0.18, gap: 0.09, pause: 0.85 },
  gentle: { label: 'Sanft', notes: [659, 784, 659], noteDuration: 0.2, gap: 0.12, pause: 1 },
  digital: { label: 'Digital', notes: [988, 784, 1175], noteDuration: 0.12, gap: 0.07, pause: 0.9 },
}

const startCallRingtone = (patternName, volume) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  const pattern = callRingtonePatterns[patternName]
  if (!AudioContextClass || !pattern || volume <= 0) return () => {}

  const audioContext = new AudioContextClass()
  let isActive = true
  let timeoutId
  let noteIndex = 0
  const oscillators = new Set()
  const playNote = () => {
    if (!isActive) return
    const frequency = pattern.notes[noteIndex]
    const noteLength = pattern.noteDuration
    if (frequency) {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const startAt = audioContext.currentTime
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, startAt)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * 0.12), startAt + 0.02)
      gain.gain.setValueAtTime(Math.max(0.0002, volume * 0.12), startAt + noteLength * 0.65)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + noteLength)
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillators.add(oscillator)
      oscillator.addEventListener('ended', () => {
        oscillators.delete(oscillator)
        oscillator.disconnect()
        gain.disconnect()
      }, { once: true })
      oscillator.start(startAt)
      oscillator.stop(startAt + noteLength)
    }
    noteIndex = (noteIndex + 1) % pattern.notes.length
    const cycleFinished = noteIndex === 0
    timeoutId = window.setTimeout(playNote, (frequency ? noteLength + pattern.gap : pattern.gap) * 1000 + (cycleFinished ? pattern.pause * 1000 : 0))
  }

  audioContext.resume().then(() => {
    if (isActive) playNote()
  }).catch(() => {
    if (isActive) audioContext.close()
  })

  return () => {
    isActive = false
    window.clearTimeout(timeoutId)
    for (const oscillator of oscillators) {
      try { oscillator.stop() } catch { /* The note may already have ended. */ }
    }
    oscillators.clear()
    if (audioContext.state !== 'closed') audioContext.close()
  }
}

const playIncomingNotificationSound = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  try {
    const audioContext = new AudioContextClass()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const startAt = audioContext.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(740, startAt)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + 0.25)
    oscillator.addEventListener('ended', () => audioContext.close(), { once: true })
  } catch {
    // Audio can be unavailable when the operating system blocks playback.
  }
}

const writeStorage = (key, value, sessionToken) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Electron's local data file remains available when browser storage reaches its quota.
  }
  window.zyroData?.set(key, value, sessionToken)
    .then((result) => {
      if (result?.success === false) window.dispatchEvent(new CustomEvent('zyro-data-write-error', { detail: { message: result.message, key } }))
    })
    .catch((error) => window.dispatchEvent(new CustomEvent('zyro-data-write-error', { detail: { message: error.message, key } })))
}

function App() {
  const [activeTab, setActiveTabState] = useState('dashboard')
  const [dashboardDate] = useState(() => new Date())
  const [users, setUsers] = useState(() => readStorage('zyro-users', []))
  const [currentUser, setCurrentUser] = useState(null)
  const setActiveTab = (tab) => {
    const userPermissions = currentUser?.permissions || baseTabs
    const allowed = userPermissions.includes(tab)
      || tab === 'zahlungen'
      || (tab === 'mde' && userPermissions.includes('lager'))
      || (tab === 'versand' && (userPermissions.includes('mde') || userPermissions.includes('lager')))
    if (!currentUser || tab === 'profil' || currentUser.role === 'admin' || allowed) {
      setActiveTabState(tab)
      if (tab === 'anfragen' && networkStatus.mode !== 'client' && authSessionToken) loadContactMessages()
    }
  }
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', address: '', avatarDataUrl: '' })
  const [profileFeedback, setProfileFeedback] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [accountForm, setAccountForm] = useState({ username: '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [accountFeedback, setAccountFeedback] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [products, setProducts] = useState(() => readStorage('zyro-products', seedProducts))
  const [shopSettings, setShopSettings] = useState(() => readStorage('zyro-shop-settings', []))
  const [shopDiscounts, setShopDiscounts] = useState(() => readStorage('zyro-shop-discounts', []))
  const [shopMessage, setShopMessage] = useState('')
  const [businessCustomers, setBusinessCustomers] = useState([])
  const [businessCustomersLoading, setBusinessCustomersLoading] = useState(false)
  const [businessCustomersLoaded, setBusinessCustomersLoaded] = useState(false)
  const [deletingCustomerEmail, setDeletingCustomerEmail] = useState('')
  const [customerDeleteConfirmation, setCustomerDeleteConfirmation] = useState(null)
  const [customerDeleteEmailInput, setCustomerDeleteEmailInput] = useState('')
  const [recipes, setRecipes] = useState(() => readStorage('zyro-recipes', seedRecipes))
  const [labTests, setLabTests] = useState(() => readStorage('zyro-lab-tests', []))
  const [labTestForm, setLabTestForm] = useState(createLabTestForm)
  const [labTestMessage, setLabTestMessage] = useState('')
  const [labTestSaving, setLabTestSaving] = useState(false)
  const [orders, setOrders] = useState(readOrders)
  const [salesDocuments, setSalesDocuments] = useState(() => readStorage('zyro-sales-documents', []))
  const [suppliers, setSuppliers] = useState(() => readStorage('zyro-suppliers', []))
  const [purchaseOrders, setPurchaseOrders] = useState(() => readStorage('zyro-purchase-orders', []))
  const [supplierForm, setSupplierForm] = useState({ name: '', street: '', postalCode: '', city: '', country: 'Deutschland', email: '', phone: '', taxId: '' })
  const [editingSupplierId, setEditingSupplierId] = useState('')
  const [purchaseOrderForm, setPurchaseOrderForm] = useState({ supplierId: '', expectedDate: '', vatRate: '19', invoiceNumber: '', invoiceDate: '', dueDate: '', paidAt: '', note: '', lines: [{ productId: '', quantity: '1', unitCost: '' }] })
  const [purchaseMessage, setPurchaseMessage] = useState('')
  const [purchaseBusyId, setPurchaseBusyId] = useState('')
  const [purchaseReceiptDrafts, setPurchaseReceiptDrafts] = useState({})
  const [sendingSalesDocumentId, setSendingSalesDocumentId] = useState('')
  const [invoiceCompanyDetails, setInvoiceCompanyDetails] = useState(readInvoiceCompanyDetails)
  const [invoiceCompanyForm, setInvoiceCompanyForm] = useState(readInvoiceCompanyDetails)
  const [invoiceCompanyMessage, setInvoiceCompanyMessage] = useState('')
  const [invoiceCompanySaving, setInvoiceCompanySaving] = useState(false)
  const [bottlerDetails, setBottlerDetails] = useState(readBottlerDetails)
  const [bottlerForm, setBottlerForm] = useState(readBottlerDetails)
  const [bottlerMessage, setBottlerMessage] = useState('')
  const [bottlerSaving, setBottlerSaving] = useState(false)
  const applyBottlerDetails = (entries) => {
    const details = {
      ...initialBottlerDetails,
      ...(Array.isArray(entries) ? entries.find((entry) => entry?.id === 'global') : {}),
    }
    setBottlerDetails(details)
    setBottlerForm(details)
  }
  const [documentPreviewKind, setDocumentPreviewKind] = useState('rechnung')
  const [productReviews, setProductReviews] = useState([])
  const [productReviewsLoading, setProductReviewsLoading] = useState(false)
  const [reviewModerationBusyId, setReviewModerationBusyId] = useState('')
  const [reviewModerationMessage, setReviewModerationMessage] = useState('')
  const [salesTarget, setSalesTarget] = useState(() => readStorage('zyro-sales-target', []))
  const [salesTargetDraft, setSalesTargetDraft] = useState(() => String(readStorage('zyro-sales-target', [])[0]?.targetBottles || ''))
  const [salesTargetMessage, setSalesTargetMessage] = useState('')
  const [financeEntries, setFinanceEntries] = useState(() => readStorage('zyro-finance-entries', []))
  const [paymentRequests, setPaymentRequests] = useState(() => readStorage('zyro-payment-requests', []))
  const [paymentSettings, setPaymentSettings] = useState(() => readStorage('zyro-payment-settings', []))
  const [paymentSettingsForm, setPaymentSettingsForm] = useState(() => ({
    accountName: readStorage('zyro-payment-settings', [])[0]?.accountName || '',
    iban: readStorage('zyro-payment-settings', [])[0]?.iban || '',
    bic: readStorage('zyro-payment-settings', [])[0]?.bic || '',
  }))
  const [paymentRequestForm, setPaymentRequestForm] = useState(createPaymentRequestForm)
  const [paymentMessage, setPaymentMessage] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [productionCalculations, setProductionCalculations] = useState(() => readStorage('zyro-cost-calculations', []))
  const [productionCalculationForm, setProductionCalculationForm] = useState(createProductionCalculationForm)
  const [editingProductionCalculationId, setEditingProductionCalculationId] = useState('')
  const [productionCalculationMessage, setProductionCalculationMessage] = useState('')
  const [offerAnalysisLoading, setOfferAnalysisLoading] = useState(false)
  const [financeMonth, setFinanceMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [financeEntryForm, setFinanceEntryForm] = useState(createFinanceEntryForm)
  const [financeReceiptFiles, setFinanceReceiptFiles] = useState([])
  const [financeEntrySaving, setFinanceEntrySaving] = useState(false)
  const [editingFinanceEntryId, setEditingFinanceEntryId] = useState('')
  const [financeMessage, setFinanceMessage] = useState('')
  const [elsterSetup, setElsterSetup] = useState(initialElsterSetup)
  const [elsterSetupMessage, setElsterSetupMessage] = useState('')
  const [elsterSetupSaving, setElsterSetupSaving] = useState(false)
  const [showElsterPreview, setShowElsterPreview] = useState(false)
  const [stockMovements, setStockMovements] = useState(() => readStorage('zyro-stock-movements', []))
  const [adjustForm, setAdjustForm] = useState({ productId: '', type: 'Bruch', quantity: '', note: '' })
  const [adjustMessage, setAdjustMessage] = useState('')
  const [reports, setReports] = useState(() => readStorage('zyro-reports', []))
  const [machinebauRecords, setMachinebauRecords] = useState(() => readStorage('zyro-machinebau', []))
  const [machinebauDraft, setMachinebauDraft] = useState(null)
  const [editingMachinebauId, setEditingMachinebauId] = useState('')
  const [machinebauTypeFilter, setMachinebauTypeFilter] = useState('alle')
  const [machinebauSearch, setMachinebauSearch] = useState('')
  const [machinebauMessage, setMachinebauMessage] = useState('')
  const [machinebauAiLoading, setMachinebauAiLoading] = useState(false)
  const [hrSensitiveRecords, setHrSensitiveRecords] = useState(() => readStorage('zyro-hr-sensitive', []))
  const [hrSvNumbers, setHrSvNumbers] = useState({})
  const [hrSvPassphrase, setHrSvPassphrase] = useState('')
  const [hrSvUnlockDraft, setHrSvUnlockDraft] = useState('')
  const [hrSvConfirmDraft, setHrSvConfirmDraft] = useState('')
  const [hrEmployees, setHrEmployees] = useState([])
  const [hrEmployeeDraft, setHrEmployeeDraft] = useState(null)
  const [editingHrEmployeeId, setEditingHrEmployeeId] = useState('')
  const [hrSvMessage, setHrSvMessage] = useState('')
  const [hrSvBusy, setHrSvBusy] = useState(false)
  const [uploadedDocuments, setUploadedDocuments] = useState(() => readStorage('zyro-archive-documents', []))
  const [customers, setCustomers] = useState(() => readStorage('zyro-customers', []))
  const [deleteRequests, setDeleteRequests] = useState(() => readStorage('zyro-delete-requests', []))
  const [auditEntries, setAuditEntries] = useState(() => readStorage('zyro-audit-log', []))
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('alle')
  const [automaticBackups, setAutomaticBackups] = useState([])
  const [backupMessage, setBackupMessage] = useState('')
  const [backupEncryptionAvailable, setBackupEncryptionAvailable] = useState(true)
  const [websiteAdminTokenConfigured, setWebsiteAdminTokenConfigured] = useState(false)
  const [websiteOrders, setWebsiteOrders] = useState(() => readStorage('zyro-website-orders', []))
  const [websiteAdminMessage, setWebsiteAdminMessage] = useState('')
  const [contactMessages, setContactMessages] = useState([])
  const [contactMessagesLoading, setContactMessagesLoading] = useState(false)
  const [contactMessagesError, setContactMessagesError] = useState('')
  const [contactAdminTokenDraft, setContactAdminTokenDraft] = useState('')
  const [contactReplyDrafts, setContactReplyDrafts] = useState({})
  const [sendingContactReplies, setSendingContactReplies] = useState({})
  const [contactReplyMessage, setContactReplyMessage] = useState('')
  const [contactFilter, setContactFilter] = useState('open')
  const [inquiryNotifyEmail, setInquiryNotifyEmail] = useState('')
  const [inquiryNotifyDraft, setInquiryNotifyDraft] = useState('')
  const [ticketForm, setTicketForm] = useState(initialTicketForm)
  const [ticketFeedback, setTicketFeedback] = useState('')
  const [ticketMessageDrafts, setTicketMessageDrafts] = useState({})
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketStatusFilter, setTicketStatusFilter] = useState('alle')
  const [documentSearch, setDocumentSearch] = useState('')
  const [documentTypeFilter, setDocumentTypeFilter] = useState('alle')
  const [archiveUploadMessage, setArchiveUploadMessage] = useState('')
  const [reportDraft, setReportDraft] = useState(null)
  const [editingReportId, setEditingReportId] = useState('')
  const [viewingReport, setViewingReport] = useState(null)
  const [reportFeedback, setReportFeedback] = useState('')
  const reportContentRef = useRef(null)
  const salesDocumentPreviewIdRef = useRef(null)
  const [notificationItems, setNotificationItems] = useState([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => window.localStorage.getItem('zyro-notification-sound') !== 'false')
  const [customerForm, setCustomerForm] = useState(initialCustomerForm)
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [viewingCustomer, setViewingCustomer] = useState(null)
  const [customerIbanVisible, setCustomerIbanVisible] = useState(false)
  const [inventory, setInventory] = useState(() => readStorage('zyro-inventory', seedInventory))
  const [productForm, setProductForm] = useState(initialProductForm)
  const [nutritionEditorOpen, setNutritionEditorOpen] = useState(false)
  const [productFormMessage, setProductFormMessage] = useState('')
  const [labelProductId, setLabelProductId] = useState('')
  const [bottleLabel, setBottleLabel] = useState(initialBottleLabel)
  const [labelMessage, setLabelMessage] = useState('')
  const [labelDesignLoading, setLabelDesignLoading] = useState(false)
  const [labelSaving, setLabelSaving] = useState(false)
  const labelBarcodeRef = useRef(null)
  const [recipeForm, setRecipeForm] = useState(initialRecipeForm)
  const [labReportMessage, setLabReportMessage] = useState('')
  const [viewingLabReport, setViewingLabReport] = useState(null)
  const [networkStatus, setNetworkStatus] = useState({ mode: 'local', hostAddress: '', addresses: [], port: 47821, running: false, accessCode: '' })
  const [mailboxUnreadCount, setMailboxUnreadCount] = useState(0)
  const [callConnectionStatus, setCallConnectionStatus] = useState('getrennt')
  const [callUsers, setCallUsers] = useState([])
  const [callInfo, setCallInfo] = useState(null)
  const [callError, setCallError] = useState('')
  const [callMuted, setCallMuted] = useState(false)
  const [callRingtone, setCallRingtone] = useState(() => window.localStorage.getItem('zyro-call-ringtone') || 'classic')
  const [callRingtoneVolume, setCallRingtoneVolume] = useState(() => {
    const storedVolume = Number(window.localStorage.getItem('zyro-call-ringtone-volume'))
    return Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : 0.65
  })
  const ringtoneStopRef = useRef(() => {})
  const ringtonePreviewTimerRef = useRef(null)
  const [ringtonePreviewing, setRingtonePreviewing] = useState(false)
  const [callCameraEnabled, setCallCameraEnabled] = useState(true)
  const [localVideoStream, setLocalVideoStream] = useState(null)
  const [remoteAudioStream, setRemoteAudioStream] = useState(null)
  const callPeerRef = useRef(null)
  const callStreamRef = useRef(null)
  const activeCallIdRef = useRef('')
  const pendingCallSignalsRef = useRef([])
  const finishCallRef = useRef(() => {})
  const remoteAudioRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const localVideoRef = useRef(null)
  const [networkDataMessage, setNetworkDataMessage] = useState('')
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const [networkSettingsOpen, setNetworkSettingsOpen] = useState(false)
  const [cloudStatus, setCloudStatus] = useState(null)
  const [cloudTokenInput, setCloudTokenInput] = useState('')
  const [cloudMessage, setCloudMessage] = useState('')
  const [networkInitialized, setNetworkInitialized] = useState(() => !window.zyroData)
  const [hostAddressInput, setHostAddressInput] = useState('')
  const [accessCodeInput, setAccessCodeInput] = useState('')
  const sharedRevisionRef = useRef('')
  const sharedSyncSkipRef = useRef(new Set())
  const networkSyncReadyRef = useRef(false)
  const notificationActivityRef = useRef(null)
  const [editingRecipeId, setEditingRecipeId] = useState(null)
  const [recipeApprovalMessage, setRecipeApprovalMessage] = useState('')
  const [recipeAiLoading, setRecipeAiLoading] = useState(false)
  const [recipeAiMessage, setRecipeAiMessage] = useState('')
  const [aiStatus, setAiStatus] = useState(null)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false)
  const [openAiApiKey, setOpenAiApiKey] = useState('')
  const [openAiKeySaving, setOpenAiKeySaving] = useState(false)
  const [orderForm, setOrderForm] = useState(initialOrderForm)
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [scanCode, setScanCode] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const [scannedOrder, setScannedOrder] = useState(null)
  const [salesDocumentForm, setSalesDocumentForm] = useState(initialSalesDocumentForm)
  const [editingSalesDocumentId, setEditingSalesDocumentId] = useState(null)
  const [salesFeedback, setSalesFeedback] = useState('')
  const backupInputRef = useRef(null)
  const [qualityDrafts, setQualityDrafts] = useState({})
  const [inventoryForm, setInventoryForm] = useState(initialInventoryForm)
  const [mdeReceipt, setMdeReceipt] = useState(initialMdeReceipt)
  const [mdeMessage, setMdeMessage] = useState('')
  const [mdeBusy, setMdeBusy] = useState(false)
  const [mdeInputMode, setMdeInputMode] = useState('receipt')
  const [mdeOrderId, setMdeOrderId] = useState('')
  const [mdeOrderScan, setMdeOrderScan] = useState('')
  const [mdeScannedQuantities, setMdeScannedQuantities] = useState({})
  const [mdeProductScan, setMdeProductScan] = useState('')
  const [mdeShipmentDrafts, setMdeShipmentDrafts] = useState({})
  const mdeScanInputRef = useRef(null)
  const mdeChargeSelectRef = useRef(null)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingInventoryItem, setEditingInventoryItem] = useState(null)
  const [expandedInventoryItem, setExpandedInventoryItem] = useState(seedInventory[0]?.item ?? null)
  const [loginForm, setLoginForm] = useState(initialLoginForm)
  const [userForm, setUserForm] = useState(initialUserForm)
  const [activationPermissions, setActivationPermissions] = useState([...baseTabs])
  const [userPermissionDrafts, setUserPermissionDrafts] = useState({})
  const [permissionMessage, setPermissionMessage] = useState('')
  const [registrationForm, setRegistrationForm] = useState(initialRegistrationForm)
  const [authMode, setAuthMode] = useState('login')
  const [authStatus, setAuthStatus] = useState(null)
  const [authSessionToken, setAuthSessionToken] = useState('')
  const [authError, setAuthError] = useState('')
  const [activationMessage, setActivationMessage] = useState('')
  const [issuedActivationKey, setIssuedActivationKey] = useState('')
  const [desktopUpdateState, setDesktopUpdateState] = useState(null)
  const [desktopUpdateBusy, setDesktopUpdateBusy] = useState(false)

  const loadContactMessages = async () => {
    await Promise.resolve()
    setContactMessagesLoading(true)
    setContactMessagesError('')
    try {
      const result = await window.zyroWebOrders.listContactMessages(authSessionToken)
      setContactMessages(Array.isArray(result.messages) ? result.messages : [])
      if (result.notifyEmail) setInquiryNotifyEmail(result.notifyEmail)
      setWebsiteAdminTokenConfigured(true)
    } catch (error) {
      setContactMessagesError(error.message)
    } finally {
      setContactMessagesLoading(false)
    }
  }

  const saveContactAdminToken = async (event) => {
    event.preventDefault()
    setContactMessagesError('')
    try {
      await window.zyroWebOrders.setAdminToken(contactAdminTokenDraft, authSessionToken)
      setContactAdminTokenDraft('')
      await loadContactMessages()
    } catch (error) {
      setContactMessagesError(error.message)
    }
  }

  const sendContactReply = async (message) => {
    const reply = String(contactReplyDrafts[message.id] || '').trim()
    if (!reply) {
      setContactReplyMessage('Bitte zuerst eine Antwort eingeben.')
      return
    }
    setContactReplyMessage('')
    setSendingContactReplies((current) => ({ ...current, [message.id]: true }))
    try {
      await window.zyroWebOrders.replyContactMessage(message.id, reply, authSessionToken)
      setContactReplyDrafts((current) => ({ ...current, [message.id]: '' }))
      setContactReplyMessage(`Antwort an ${message.email} wurde gesendet.`)
      await loadContactMessages()
    } catch (error) {
      setContactReplyMessage(`Antwort konnte nicht gesendet werden: ${error.message}`)
    } finally {
      setSendingContactReplies((current) => ({ ...current, [message.id]: false }))
    }
  }

  const setContactMessageStatus = async (message, status) => {
    setContactMessagesError('')
    try {
      await window.zyroWebOrders.updateContactMessage(message.id, status, authSessionToken)
      await loadContactMessages()
    } catch (error) {
      setContactMessagesError(error.message)
    }
  }

  const saveInquiryNotifyEmail = async (event) => {
    event.preventDefault()
    setContactMessagesError('')
    try {
      const result = await window.zyroWebOrders.inquirySettings(inquiryNotifyDraft.trim(), authSessionToken)
      setInquiryNotifyEmail(result.notifyEmail)
      setInquiryNotifyDraft('')
      setContactReplyMessage(`Benachrichtigungs- und Antwortadresse: ${result.notifyEmail}`)
    } catch (error) {
      setContactMessagesError(error.message)
    }
  }

  const deleteContactMessage = async (message) => {
    if (!window.confirm(`Kontaktanfrage von ${message.name} endgültig löschen?`)) return
    setContactMessagesError('')
    try {
      await window.zyroWebOrders.deleteContactMessage(message.id, authSessionToken)
      setContactMessages((current) => current.filter((entry) => entry.id !== message.id))
    } catch (error) {
      setContactMessagesError(error.message)
    }
  }

  const persistCollection = (key, value, sessionToken) => {
    if (!networkSyncReadyRef.current || !sessionToken) return
    if (sharedSyncSkipRef.current.delete(key)) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // The shared data file is the source of truth for network updates.
      }
      return
    }
    writeStorage(key, value, sessionToken)
  }

  const savePaymentRequests = async (requests) => {
    const result = await window.zyroData?.set('zyro-payment-requests', requests, authSessionToken)
    if (!result?.success) throw new Error(result?.message || 'Zahlungsanträge konnten nicht gespeichert werden.')
    sharedSyncSkipRef.current.add('zyro-payment-requests')
    setPaymentRequests(requests)
  }

  const saveLabTest = async (event) => {
    event.preventDefault()
    setLabTestSaving(true)
    setLabTestMessage('')
    const peachFlavorGrams = Number(String(labTestForm.peachFlavorGrams).replace(',', '.'))
    const passionFruitFlavorGrams = Number(String(labTestForm.passionFruitFlavorGrams).replace(',', '.'))
    const phText = String(labTestForm.phValue).trim()
    const phValue = phText ? Number(phText.replace(',', '.')) : null
    if (!Number.isFinite(peachFlavorGrams) || peachFlavorGrams < 0
      || !Number.isFinite(passionFruitFlavorGrams) || passionFruitFlavorGrams < 0
      || (phText && (!Number.isFinite(phValue) || phValue < 0 || phValue > 14))) {
      setLabTestMessage('Bitte gültige Aromamengen und einen pH-Wert zwischen 0 und 14 eingeben.')
      setLabTestSaving(false)
      return
    }
    const selectedRecipe = recipes.find((recipe) => String(recipe.id) === labTestForm.recipeId)
    const entry = {
      id: crypto.randomUUID(),
      sampleCode: labTestForm.sampleCode,
      recipeId: selectedRecipe ? String(selectedRecipe.id) : '',
      recipeName: selectedRecipe?.name || '',
      peachFlavorGrams,
      passionFruitFlavorGrams,
      phValue,
      fruitiness: Number(labTestForm.fruitiness),
      naturalness: Number(labTestForm.naturalness),
      aftertaste: labTestForm.aftertaste,
      sweetness: labTestForm.sweetness,
      observations: labTestForm.observations.trim(),
      createdAt: new Date().toISOString(),
      createdById: String(currentUser.id),
      createdByName: currentUser.name,
    }
    try {
      const result = await window.zyroData?.set('zyro-lab-tests', [entry, ...labTests], authSessionToken)
      if (!result?.success) throw new Error(result?.message || 'Versuchsprotokoll konnte nicht gespeichert werden.')
      sharedSyncSkipRef.current.add('zyro-lab-tests')
      setLabTests((current) => [entry, ...current])
      setLabTestForm(createLabTestForm())
      setLabTestMessage(`Probe ${entry.sampleCode} wurde gespeichert.`)
    } catch (error) {
      setLabTestMessage(`Versuchsprotokoll konnte nicht gespeichert werden: ${error.message}`)
    } finally {
      setLabTestSaving(false)
    }
  }

  const applyPaymentSettings = (settings) => {
    const entries = Array.isArray(settings) ? settings : []
    setPaymentSettings(entries)
    const savedSettings = entries[0] || {}
    setPaymentSettingsForm({
      accountName: savedSettings.accountName || '',
      iban: savedSettings.iban || '',
      bic: savedSettings.bic || '',
    })
  }

  const savePaymentSettings = async (settings) => {
    const result = await window.zyroData?.set('zyro-payment-settings', settings, authSessionToken)
    if (!result?.success) throw new Error(result?.message || 'Zahlungskonto konnte nicht gespeichert werden.')
    sharedSyncSkipRef.current.add('zyro-payment-settings')
    applyPaymentSettings(settings)
  }

  const submitPaymentRequest = async (event) => {
    event.preventDefault()
    setPaymentSaving(true)
    setPaymentMessage('')
    const amountText = String(paymentRequestForm.amount).trim()
    const amount = Number(amountText.replace(',', '.'))
    const amountCents = Math.round(amount * 100)
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(amountText)
      || !Number.isFinite(amount) || !Number.isSafeInteger(amountCents) || amountCents < 1) {
      setPaymentMessage('Bitte einen gültigen Betrag in Euro eingeben.')
      setPaymentSaving(false)
      return
    }
    const request = {
      id: crypto.randomUUID(),
      requesterId: String(currentUser.id),
      requesterName: currentUser.name,
      createdAt: getPaymentDate().toISOString(),
      clientName: paymentRequestForm.clientName.trim(),
      recipientName: paymentRequestForm.recipientName.trim(),
      recipientIban: paymentRequestForm.recipientIban.replace(/\s+/g, '').toUpperCase(),
      recipientBic: paymentRequestForm.recipientBic.trim().toUpperCase(),
      amountCents,
      purpose: paymentRequestForm.purpose.trim(),
      reference: paymentRequestForm.reference.trim(),
      requestedExecutionDate: paymentRequestForm.requestedExecutionDate,
      status: 'pending',
    }
    const visibleRequests = currentUser.role === 'admin'
      ? paymentRequests
      : paymentRequests.filter((entry) => String(entry.requesterId) === String(currentUser.id))
    try {
      await savePaymentRequests([...visibleRequests, request])
      setPaymentRequestForm(createPaymentRequestForm())
      setPaymentMessage('Zahlungsantrag wurde zur Prüfung eingereicht.')
    } catch (error) {
      setPaymentMessage(`Zahlungsantrag konnte nicht gespeichert werden: ${error.message}`)
    } finally {
      setPaymentSaving(false)
    }
  }

  const savePaymentAccount = async (event) => {
    event.preventDefault()
    setPaymentSaving(true)
    setPaymentMessage('')
    try {
      await savePaymentSettings([{
        id: 'global',
        accountName: paymentSettingsForm.accountName.trim(),
        iban: paymentSettingsForm.iban.trim(),
        bic: paymentSettingsForm.bic.trim().toUpperCase(),
      }])
      setPaymentMessage('Zahlungskonto wurde gespeichert.')
    } catch (error) {
      setPaymentMessage(`Zahlungskonto konnte nicht gespeichert werden: ${error.message}`)
    } finally {
      setPaymentSaving(false)
    }
  }

  const reviewPaymentRequest = async (request, decision) => {
    const rejectionReason = decision === 'rejected' ? window.prompt('Grund für die Ablehnung:')?.trim() : ''
    if (decision === 'rejected' && !rejectionReason) {
      setPaymentMessage('Bitte für eine Ablehnung einen Grund eingeben.')
      return
    }
    const timestamp = getPaymentDate().toISOString()
    const updatedRequests = paymentRequests.map((entry) => entry.id === request.id
      ? {
        ...entry,
        status: decision,
        reviewedById: String(currentUser.id),
        reviewedByName: currentUser.name,
        reviewedAt: timestamp,
        ...(decision === 'rejected' ? { rejectionReason } : {}),
      }
      : entry)
    setPaymentMessage('')
    try {
      await savePaymentRequests(updatedRequests)
      setPaymentMessage(decision === 'approved' ? 'Zahlungsantrag freigegeben.' : 'Zahlungsantrag abgelehnt.')
    } catch (error) {
      setPaymentMessage(`Status konnte nicht gespeichert werden: ${error.message}`)
    }
  }

  const exportApprovedPayments = async () => {
    const approvedRequests = paymentRequests.filter((request) => request.status === 'approved')
    const settings = paymentSettings[0]
    if (!settings) {
      setPaymentMessage('Bitte zuerst das Firmen-Zahlungskonto hinterlegen.')
      return
    }
    if (!approvedRequests.length) {
      setPaymentMessage('Es gibt keine freigegebenen Zahlungsanträge für den Export.')
      return
    }
    setPaymentMessage('')
    setPaymentSaving(true)
    try {
      const createdAt = getPaymentDate()
      const xml = buildPaymentSepaXml(settings, approvedRequests, createdAt)
      const batchId = crypto.randomUUID()
      const exportedRequests = paymentRequests.map((request) => request.status === 'approved'
        ? {
          ...request,
          status: 'exported',
          exportedById: String(currentUser.id),
          exportedByName: currentUser.name,
          exportedAt: createdAt.toISOString(),
          exportBatchId: batchId,
        }
        : request)
      await savePaymentRequests(exportedRequests)
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `zyro-sepa-${createdAt.toISOString().slice(0, 10)}.xml`
      link.click()
      URL.revokeObjectURL(url)
      setPaymentMessage(`${approvedRequests.length} Zahlungsantrag/-anträge wurden als SEPA-Datei exportiert. Bitte die Datei im Banking prüfen und freigeben.`)
    } catch (error) {
      setPaymentMessage(`SEPA-Export fehlgeschlagen: ${error.message}`)
    } finally {
      setPaymentSaving(false)
    }
  }

  const markPaymentAsPaid = async (request) => {
    const paymentReference = window.prompt('Bankreferenz (optional):')?.trim() || ''
    const updatedRequests = paymentRequests.map((entry) => entry.id === request.id
      ? {
        ...entry,
        status: 'paid',
        paidById: String(currentUser.id),
        paidByName: currentUser.name,
        paidAt: getPaymentDate().toISOString().slice(0, 10),
        paymentReference,
      }
      : entry)
    setPaymentMessage('')
    try {
      await savePaymentRequests(updatedRequests)
      setPaymentMessage('Zahlungsantrag als überwiesen markiert.')
    } catch (error) {
      setPaymentMessage(`Überweisungsstatus konnte nicht gespeichert werden: ${error.message}`)
    }
  }

  useEffect(() => {
    if (!window.zyroUpdater) return undefined
    const unsubscribe = window.zyroUpdater.onState(setDesktopUpdateState)
    window.zyroUpdater.getState()
      .then(setDesktopUpdateState)
      .catch((error) => setDesktopUpdateState({
        supported: true,
        status: 'error',
        currentVersion: '',
        availableVersion: '',
        percent: 0,
        error: error.message,
      }))
    return unsubscribe
  }, [])

  useEffect(() => {
    const restorers = {
      'zyro-sales-documents': setSalesDocuments,
      'zyro-suppliers': setSuppliers,
      'zyro-purchase-orders': setPurchaseOrders,
      'zyro-sales-target': setSalesTarget,
      'zyro-finance-entries': setFinanceEntries,
      'zyro-payment-requests': setPaymentRequests,
      'zyro-payment-settings': applyPaymentSettings,
      'zyro-lab-tests': setLabTests,
      'zyro-cost-calculations': setProductionCalculations,
      'zyro-elster-setup': (value) => setElsterSetup(elsterSetupFromEntries(value)),
      'zyro-company-details': (value) => {
        const details = { ...initialInvoiceCompanyDetails, ...(Array.isArray(value) ? value.find((entry) => entry?.id === 'global') : {}) }
        setInvoiceCompanyDetails(details)
        setInvoiceCompanyForm(details)
      },
      'zyro-bottler-details': applyBottlerDetails,
      'zyro-stock-movements': setStockMovements,
      'zyro-reports': setReports,
      'zyro-machinebau': setMachinebauRecords,
      'zyro-hr-sensitive': setHrSensitiveRecords,
      'zyro-archive-documents': setUploadedDocuments,
      'zyro-orders': setOrders,
      'zyro-customers': setCustomers,
      'zyro-products': setProducts,
      'zyro-recipes': setRecipes,
      'zyro-inventory': setInventory,
      'zyro-website-orders': setWebsiteOrders,
      'zyro-delete-requests': setDeleteRequests,
      'zyro-shop-settings': setShopSettings,
      'zyro-shop-discounts': setShopDiscounts,
    }
    const handleDataWriteError = (event) => {
      setNetworkDataMessage(`Speichern fehlgeschlagen: ${event.detail.message}`)
      // Restore the accepted state so rejected changes are not shown as saved.
      const persisted = window.zyroData?.get(event.detail.key, authSessionToken)
      if (restorers[event.detail.key] && persisted?.found && Array.isArray(persisted.value)) {
        sharedSyncSkipRef.current.add(event.detail.key)
        restorers[event.detail.key](persisted.value)
      }
    }
    const handleCloudDataRestored = (event) => {
      const { key, value } = event.detail || {}
      if (!Array.isArray(value) || !restorers[key]) return
      sharedSyncSkipRef.current.add(key)
      restorers[key](value)
      setNetworkDataMessage(`Cloud-Datensatz „${key}“ wurde wiederhergestellt.`)
    }
    window.addEventListener('zyro-data-write-error', handleDataWriteError)
    window.addEventListener('zyro-data-sync-restored', handleCloudDataRestored)
    return () => {
      window.removeEventListener('zyro-data-write-error', handleDataWriteError)
      window.removeEventListener('zyro-data-sync-restored', handleCloudDataRestored)
    }
  }, [authSessionToken])

  useEffect(() => {
    const handleCloudSyncError = (event) => {
      setCloudStatus((current) => ({
        ...current,
        enabled: true,
        lastError: event.detail.message,
      }))
      setNetworkDataMessage(`Cloud-Sync ausstehend: ${event.detail.message}`)
    }
    const handleCloudSyncSuccess = () => {
      setCloudStatus({
        enabled: true,
        lastError: '',
        lastSyncAt: Date.now(),
      })
      setNetworkDataMessage((current) => current.startsWith('Cloud-Sync ausstehend:') ? '' : current)
    }
    window.addEventListener('zyro-data-sync-error', handleCloudSyncError)
    window.addEventListener('zyro-data-sync-success', handleCloudSyncSuccess)
    return () => {
      window.removeEventListener('zyro-data-sync-error', handleCloudSyncError)
      window.removeEventListener('zyro-data-sync-success', handleCloudSyncSuccess)
    }
  }, [])

  useEffect(() => {
    if (!networkInitialized || !window.zyroAuth) return
    let isActive = true
    window.zyroAuth.getStatus()
      .then((status) => {
        if (!isActive) return
        setAuthStatus(status)
        setUsers(status.users || [])
        if (status.sessionUser) {
          setNotificationItems(readUserNotifications(status.sessionUser.id))
          setCurrentUser(status.sessionUser)
          const canUseMde = status.sessionUser.role === 'admin'
            || status.sessionUser.permissions?.includes('mde')
            || status.sessionUser.permissions?.includes('lager')
          const canUseShipment = status.sessionUser.role === 'admin'
            || status.sessionUser.permissions?.includes('versand')
            || status.sessionUser.permissions?.includes('mde')
            || status.sessionUser.permissions?.includes('lager')
          const requestedMode = requestedManagementMode === 'versand' ? 'versand' : 'mde'
          setActiveTabState(requestedManagementMode && (requestedMode === 'versand' ? canUseShipment : canUseMde)
            ? requestedMode
            : status.sessionUser.role === 'admin' ? 'dashboard' : status.sessionUser.permissions?.[0] || 'dashboard')
          setProfileForm({
            name: status.sessionUser.name || '',
            email: status.sessionUser.email || '',
            phone: status.sessionUser.phone || '',
            address: status.sessionUser.address || '',
            avatarDataUrl: status.sessionUser.avatarDataUrl || '',
          })
          setAccountForm({
            username: status.sessionUser.username || '',
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          })
          setAuthSessionToken(status.sessionToken)
        }
        if (status.needsSetup) {
          setCurrentUser(null)
          setAuthMode('register')
        }
      })
      .catch((error) => {
        setAuthStatus((current) => current || { needsSetup: false, bootstrapKey: '', users: [] })
        setAuthError(error.message)
      })
    return () => { isActive = false }
  }, [networkInitialized])

  useEffect(() => {
    window.localStorage.removeItem('zyro-current-user')
    window.zyroData?.set('zyro-current-user', null)
  }, [])

  useEffect(() => {
    persistCollection('zyro-products', products, authSessionToken)
  }, [products, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-shop-settings', shopSettings, authSessionToken)
  }, [shopSettings, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-shop-discounts', shopDiscounts, authSessionToken)
  }, [shopDiscounts, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-recipes', recipes, authSessionToken)
  }, [recipes, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-lab-tests', labTests, authSessionToken)
  }, [labTests, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-orders', orders, authSessionToken)
  }, [orders, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-sales-documents', salesDocuments, authSessionToken)
  }, [salesDocuments, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-suppliers', suppliers, authSessionToken)
  }, [suppliers, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-purchase-orders', purchaseOrders, authSessionToken)
  }, [purchaseOrders, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-company-details', [invoiceCompanyDetails], authSessionToken)
  }, [invoiceCompanyDetails, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-bottler-details', [bottlerDetails], authSessionToken)
  }, [bottlerDetails, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-sales-target', salesTarget, authSessionToken)
  }, [salesTarget, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-finance-entries', financeEntries, authSessionToken)
  }, [financeEntries, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-payment-requests', paymentRequests, authSessionToken)
  }, [paymentRequests, authSessionToken])

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      persistCollection('zyro-payment-settings', paymentSettings, authSessionToken)
    }
  }, [paymentSettings, authSessionToken, currentUser?.role])

  useEffect(() => {
    persistCollection('zyro-cost-calculations', productionCalculations, authSessionToken)
  }, [productionCalculations, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-stock-movements', stockMovements, authSessionToken)
  }, [stockMovements, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-reports', reports, authSessionToken)
  }, [reports, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-machinebau', machinebauRecords, authSessionToken)
  }, [machinebauRecords, authSessionToken])

  useEffect(() => {
    if (currentUser?.role === 'admin') persistCollection('zyro-hr-sensitive', hrSensitiveRecords, authSessionToken)
  }, [hrSensitiveRecords, authSessionToken, currentUser?.role])

  useEffect(() => {
    persistCollection('zyro-archive-documents', uploadedDocuments, authSessionToken)
  }, [uploadedDocuments, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-website-orders', websiteOrders, authSessionToken)
  }, [websiteOrders, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-customers', customers, authSessionToken)
  }, [customers, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-inventory', inventory, authSessionToken)
  }, [inventory, authSessionToken])

  useEffect(() => {
    persistCollection('zyro-delete-requests', deleteRequests, authSessionToken)
  }, [deleteRequests, authSessionToken])

  useEffect(() => {
    if (!currentUser || !networkInitialized) return
    const previousSnapshot = notificationActivityRef.current
    const nextTickets = new Map(deleteRequests.map((ticket) => [String(ticket.id), {
      status: ticket.status,
      messageIds: new Set((ticket.messages || []).map((message) => String(message.id))),
    }]))
    if (!previousSnapshot || previousSnapshot.userId !== String(currentUser.id)) {
      notificationActivityRef.current = { userId: String(currentUser.id), tickets: nextTickets }
      return
    }

    const incoming = []
    deleteRequests.forEach((ticket) => {
      const previous = previousSnapshot.tickets.get(String(ticket.id))
      if (!previous) {
        if (String(ticket.requestedById) !== String(currentUser.id) && ticket.requestedBy !== currentUser.name) {
          incoming.push({
            id: `${ticket.id}:created`,
            ticketId: ticket.id,
            title: ticket.subject || ticket.targetName || 'Neue Anfrage',
            detail: `Neue Anfrage von ${ticket.requestedBy}`,
            createdAt: ticket.requestedAt || new Date().toISOString(),
            read: false,
          })
        }
        return
      }

      const newMessages = (ticket.messages || []).filter((message) => !previous.messageIds.has(String(message.id)))
      newMessages.forEach((message) => {
        if (String(message.byId) === String(currentUser.id) || message.by === currentUser.name) return
        incoming.push({
          id: `${ticket.id}:${message.id}`,
          ticketId: ticket.id,
          title: ticket.subject || ticket.targetName || 'Neue Ticketnachricht',
          detail: `Nachricht von ${message.by}`,
          createdAt: message.createdAt || new Date().toISOString(),
          read: false,
        })
      })

      if (ticket.status !== previous.status && ticket.reviewedBy && ticket.reviewedBy !== currentUser.name) {
        incoming.push({
          id: `${ticket.id}:status:${ticket.status}`,
          ticketId: ticket.id,
          title: ticket.subject || ticket.targetName || 'Ticket aktualisiert',
          detail: `Status geändert: ${ticket.status}`,
          createdAt: ticket.reviewedAt || new Date().toISOString(),
          read: false,
        })
      }
    })
    notificationActivityRef.current = { userId: String(currentUser.id), tickets: nextTickets }

    let notificationTimer
    if (incoming.length > 0) {
      const storageKey = `zyro-notifications-${currentUser.id}`
      notificationTimer = window.setTimeout(() => {
        setNotificationItems((current) => {
          const updated = [...incoming, ...current].slice(0, 50)
          window.localStorage.setItem(storageKey, JSON.stringify(updated))
          return updated
        })
      }, 0)
      if (notificationSoundEnabled) playIncomingNotificationSound()
    }
    return () => window.clearTimeout(notificationTimer)
  }, [deleteRequests, currentUser, networkInitialized, notificationSoundEnabled])

  useEffect(() => {
    if (!window.zyroData) return
    let isActive = true
    sharedRevisionRef.current = ''
    const collectionSetters = {
      'zyro-users': setUsers,
      'zyro-products': setProducts,
      'zyro-recipes': setRecipes,
      'zyro-lab-tests': setLabTests,
      'zyro-orders': setOrders,
      'zyro-sales-documents': setSalesDocuments,
      'zyro-suppliers': setSuppliers,
      'zyro-purchase-orders': setPurchaseOrders,
      'zyro-sales-target': setSalesTarget,
      'zyro-finance-entries': setFinanceEntries,
      'zyro-payment-requests': setPaymentRequests,
      'zyro-payment-settings': applyPaymentSettings,
      'zyro-cost-calculations': setProductionCalculations,
      'zyro-elster-setup': (entries) => setElsterSetup(elsterSetupFromEntries(entries)),
      'zyro-company-details': (entries) => {
        const details = { ...initialInvoiceCompanyDetails, ...(Array.isArray(entries) ? entries.find((entry) => entry?.id === 'global') : {}) }
        setInvoiceCompanyDetails(details)
        setInvoiceCompanyForm(details)
      },
      'zyro-bottler-details': applyBottlerDetails,
      'zyro-stock-movements': setStockMovements,
      'zyro-reports': setReports,
      'zyro-machinebau': setMachinebauRecords,
      'zyro-hr-sensitive': setHrSensitiveRecords,
      'zyro-archive-documents': setUploadedDocuments,
      'zyro-website-orders': setWebsiteOrders,
      'zyro-customers': setCustomers,
      'zyro-inventory': setInventory,
      'zyro-delete-requests': setDeleteRequests,
      'zyro-audit-log': setAuditEntries,
      'zyro-shop-settings': setShopSettings,
      'zyro-shop-discounts': setShopDiscounts,
    }
    const collectionDefaults = {
      'zyro-users': [],
      'zyro-activation-keys': [],
      'zyro-products': seedProducts,
      'zyro-recipes': seedRecipes,
      'zyro-lab-tests': [],
      'zyro-orders': seedOrders,
      'zyro-sales-documents': [],
      'zyro-suppliers': [],
      'zyro-purchase-orders': [],
      'zyro-sales-target': [],
      'zyro-finance-entries': [],
      'zyro-payment-requests': [],
      'zyro-payment-settings': [],
      'zyro-cost-calculations': [],
      'zyro-elster-setup': [],
      'zyro-company-details': [initialInvoiceCompanyDetails],
      'zyro-bottler-details': [initialBottlerDetails],
      'zyro-stock-movements': [],
      'zyro-reports': [],
      'zyro-machinebau': [],
      'zyro-hr-sensitive': [],
      'zyro-archive-documents': [],
      'zyro-website-orders': [],
      'zyro-customers': [],
      'zyro-inventory': seedInventory,
      'zyro-delete-requests': [],
      'zyro-audit-log': [],
      'zyro-shop-settings': [],
      'zyro-shop-discounts': [],
    }
    const applyHostSnapshot = (snapshot, force = false) => {
      if (!isActive || !snapshot?.revision || (!force && snapshot.revision === sharedRevisionRef.current)) return
      sharedRevisionRef.current = snapshot.revision
      Object.entries(collectionSetters).forEach(([key, setter]) => {
        sharedSyncSkipRef.current.add(key)
        setter(Array.isArray(snapshot.data?.[key]) ? snapshot.data[key] : collectionDefaults[key])
      })
    }
    const syncNetworkState = async () => {
      try {
        const status = await window.zyroData.getNetworkStatus()
        if (!isActive) return
        setNetworkStatus((current) => JSON.stringify(current) === JSON.stringify(status) ? current : status)
        const snapshot = await window.zyroData.getSnapshot(authSessionToken)
        if (!isActive) return
        applyHostSnapshot(snapshot, !networkSyncReadyRef.current)
        networkSyncReadyRef.current = true
        setNetworkInitialized(true)
        setNetworkDataMessage('')
      } catch (error) {
        if (isActive) setNetworkDataMessage(`Verbindung zum Haupt-PC fehlgeschlagen: ${error.message}`)
      }
    }

    syncNetworkState()
    const syncInterval = window.setInterval(syncNetworkState, 3000)

    return () => {
      isActive = false
      window.clearInterval(syncInterval)
    }
  }, [authSessionToken])

  const finishInternalCall = useCallback((notifyRemote = true) => {
    const callId = activeCallIdRef.current
    if (notifyRemote && callId) window.zyroCalls?.send({ type: 'call:end', callId })
    activeCallIdRef.current = ''
    pendingCallSignalsRef.current = []
    const peer = callPeerRef.current
    callPeerRef.current = null
    peer?.destroy()
    callStreamRef.current?.getTracks().forEach((track) => track.stop())
    callStreamRef.current = null
    setLocalVideoStream(null)
    setRemoteAudioStream(null)
    setCallInfo(null)
    setCallMuted(false)
    setCallCameraEnabled(true)
  }, [])
  useEffect(() => {
    finishCallRef.current = finishInternalCall
  }, [finishInternalCall])

  const setupInternalPeer = async (initiator, callId, stream) => {
    const { default: Peer } = await import('simple-peer')
    const peer = new Peer({
      initiator,
      trickle: true,
      stream,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    })
    callPeerRef.current = peer
    peer.on('signal', (data) => window.zyroCalls?.send({ type: 'call:signal', callId, data }))
    peer.on('stream', (remoteStream) => setRemoteAudioStream(remoteStream))
    peer.on('connect', () => setCallInfo((current) => current?.callId === callId ? { ...current, status: 'connected' } : current))
    peer.on('error', (error) => {
      setCallError(`Audioverbindung fehlgeschlagen: ${error.message}`)
      if (activeCallIdRef.current === callId) finishCallRef.current(false)
    })
    peer.on('close', () => {
      if (activeCallIdRef.current === callId) finishCallRef.current(false)
    })
    const queuedSignals = pendingCallSignalsRef.current
    pendingCallSignalsRef.current = []
    queuedSignals.forEach((signal) => {
      try { peer.signal(signal) } catch (error) { setCallError(`Anrufsignal ungültig: ${error.message}`) }
    })
    return peer
  }

  useEffect(() => {
    if (!currentUser?.id || !authSessionToken || !window.zyroCalls) return

    let isActive = true
    const unsubscribeMessages = window.zyroCalls.onMessage((message) => {
      if (message.type === 'call:ready' || message.type === 'call:users') {
        setCallUsers(message.users || [])
        setCallConnectionStatus('verbunden')
        setCallError('')
      } else if (message.type === 'call:incoming') {
        if (activeCallIdRef.current) {
          window.zyroCalls.send({ type: 'call:reject', callId: message.callId })
          return
        }
        activeCallIdRef.current = message.callId
        pendingCallSignalsRef.current = []
        setCallInfo({ callId: message.callId, remoteUser: message.caller, status: 'incoming', videoEnabled: Boolean(message.videoEnabled) })
      } else if (message.type === 'call:signal') {
        if (message.callId !== activeCallIdRef.current) return
        if (callPeerRef.current) {
          try { callPeerRef.current.signal(message.data) } catch (error) { setCallError(`Anrufsignal ungültig: ${error.message}`) }
        } else if (pendingCallSignalsRef.current.length < 64) {
          pendingCallSignalsRef.current.push(message.data)
        }
      } else if (message.type === 'call:ringing') {
        setCallInfo((current) => current?.callId === message.callId ? { ...current, status: 'ringing' } : current)
      } else if (message.type === 'call:accepted') {
        setCallInfo((current) => current?.callId === message.callId ? { ...current, status: 'connecting' } : current)
      } else if (message.type === 'call:rejected' || message.type === 'call:unavailable' || message.type === 'call:ended') {
        if (message.type !== 'call:ended' || message.reason !== 'Anruf beendet.') setCallError(message.reason || message.message || 'Der Anruf wurde beendet.')
        finishCallRef.current(false)
      }
    })
    const unsubscribeErrors = window.zyroCalls.onError((message) => setCallError(message))
    const unsubscribeDisconnected = window.zyroCalls.onDisconnected(() => {
      setCallConnectionStatus('getrennt')
      setCallError('Telefonnetz wurde getrennt.')
      finishCallRef.current(false)
    })

    const connectingTimer = window.setTimeout(() => setCallConnectionStatus('verbinde'), 0)
    window.zyroCalls.connect(authSessionToken)
      .then(() => { if (isActive) setCallConnectionStatus('verbunden') })
      .catch((error) => {
        if (!isActive) return
        setCallConnectionStatus('getrennt')
        setCallError(`Telefonnetz nicht erreichbar: ${error.message}`)
      })

    return () => {
      isActive = false
      window.clearTimeout(connectingTimer)
      unsubscribeMessages()
      unsubscribeErrors()
      unsubscribeDisconnected()
      finishCallRef.current(false)
      window.zyroCalls.disconnect().catch(() => {})
    }
  }, [currentUser?.id, authSessionToken, networkStatus.mode])

  useEffect(() => {
    if (callInfo?.status !== 'incoming' || !callRingtonePatterns[callRingtone]) return undefined
    ringtoneStopRef.current()
    ringtoneStopRef.current = startCallRingtone(callRingtone, callRingtoneVolume)
    return () => {
      ringtoneStopRef.current()
      ringtoneStopRef.current = () => {}
    }
  }, [callInfo?.callId, callInfo?.status, callRingtone, callRingtoneVolume])

  useEffect(() => () => {
    window.clearTimeout(ringtonePreviewTimerRef.current)
    ringtoneStopRef.current()
  }, [])

  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteAudioStream
  }, [remoteAudioStream])

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteAudioStream
    if (localVideoRef.current) localVideoRef.current.srcObject = localVideoStream
  }, [localVideoStream, remoteAudioStream])

  useEffect(() => {
    const barcodeElement = labelBarcodeRef.current
    if (!barcodeElement) return
    barcodeElement.replaceChildren()
    if (!/^\d{13}$/.test(bottleLabel.ean13)) return
    try {
      JsBarcode(barcodeElement, bottleLabel.ean13, { format: 'EAN13', displayValue: true, width: 1.4, height: 30, margin: 0, fontSize: 10 })
    } catch {
      barcodeElement.replaceChildren()
    }
  }, [activeTab, bottleLabel.ean13])

  const startInternalCall = async (targetUser, videoEnabled = false) => {
    if (callConnectionStatus !== 'verbunden' || activeCallIdRef.current) return
    setCallError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoEnabled })
      const callId = crypto.randomUUID()
      activeCallIdRef.current = callId
      pendingCallSignalsRef.current = []
      callStreamRef.current = stream
      setLocalVideoStream(stream)
      setCallCameraEnabled(videoEnabled)
      setCallInfo({ callId, remoteUser: targetUser, status: 'calling', videoEnabled })
      window.zyroCalls.send({ type: 'call:invite', callId, targetUserId: String(targetUser.id), videoEnabled })
      setupInternalPeer(true, callId, stream).catch((error) => {
        setCallError(`WebRTC konnte nicht geladen werden: ${error.message}`)
        finishCallRef.current(true)
      })
    } catch (error) {
      finishCallRef.current(false)
      setCallError(`${videoEnabled ? 'Kamera und Mikrofon' : 'Mikrofon'} konnten nicht gestartet werden: ${error.message}`)
    }
  }

  const acceptInternalCall = async () => {
    const pendingCall = callInfo
    if (!pendingCall || pendingCall.status !== 'incoming') return
    setCallError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: Boolean(pendingCall.videoEnabled) })
      callStreamRef.current = stream
      setLocalVideoStream(stream)
      setCallCameraEnabled(Boolean(pendingCall.videoEnabled))
      setCallInfo({ ...pendingCall, status: 'connecting' })
      await setupInternalPeer(false, pendingCall.callId, stream)
      window.zyroCalls.send({ type: 'call:accept', callId: pendingCall.callId })
    } catch (error) {
      window.zyroCalls.send({ type: 'call:reject', callId: pendingCall.callId })
      finishCallRef.current(false)
      setCallError(`${pendingCall.videoEnabled ? 'Kamera und Mikrofon' : 'Mikrofon'} konnten nicht gestartet werden: ${error.message}`)
    }
  }

  const rejectInternalCall = () => {
    if (callInfo?.callId) window.zyroCalls.send({ type: 'call:reject', callId: callInfo.callId })
    finishCallRef.current(false)
  }

  const toggleCallMute = () => {
    const nextMuted = !callMuted
    callStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    setCallMuted(nextMuted)
  }

  const toggleCallCamera = () => {
    const nextCameraEnabled = !callCameraEnabled
    callStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = nextCameraEnabled })
    setCallCameraEnabled(nextCameraEnabled)
  }

  useEffect(() => {
    if (!window.zyroAI) return

    let isMounted = true
    window.zyroAI.getStatus()
      .then((status) => {
        if (isMounted) setAiStatus(status)
      })
      .catch((error) => {
        if (isMounted) setRecipeAiMessage(`KI-Status nicht verfügbar: ${error.message}`)
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'admin' || currentUser?.role !== 'admin' || networkStatus.mode === 'client' || !authSessionToken || !window.zyroWebOrders) return
    let isActive = true
    window.zyroWebOrders.getStatus(authSessionToken)
      .then((status) => {
        if (isActive) setWebsiteAdminTokenConfigured(Boolean(status.configured))
      })
      .catch((error) => {
        if (isActive) setWebsiteAdminMessage(error.message)
      })
    return () => { isActive = false }
  }, [activeTab, currentUser?.role, authSessionToken, networkStatus.mode])

  useEffect(() => {
    if (activeTab !== 'admin' || currentUser?.role !== 'admin' || !authSessionToken || !window.zyroMde?.listProductReviews) return
    let isActive = true
    window.zyroMde.listProductReviews(authSessionToken)
      .then((result) => {
        if (isActive) setProductReviews(Array.isArray(result.reviews) ? result.reviews : [])
      })
      .catch((error) => {
        if (isActive) setReviewModerationMessage(`Bewertungen konnten nicht geladen werden: ${error.message}`)
      })
      .finally(() => {
        if (isActive) setProductReviewsLoading(false)
      })
    return () => { isActive = false }
  }, [activeTab, currentUser?.role, authSessionToken])

  const availableTabs = currentUser?.role === 'admin'
    ? [...baseTabs, 'shop', 'anfragen', 'postfach', 'admin', 'protokoll', 'finanzen', 'zahlungen', 'kalkulation']
    : employeePermissionTabs.filter((tab) => {
      const permissions = currentUser?.permissions || baseTabs
      return permissions.includes(tab)
        || (tab === 'mde' && permissions.includes('lager'))
        || (tab === 'versand' && (permissions.includes('mde') || permissions.includes('lager')))
    }).concat('zahlungen')
  const tabs = scannerStandalone
    ? availableTabs.filter((tab) => tab === 'mde' || tab === 'versand')
    : availableTabs
  const visiblePaymentRequests = currentUser?.role === 'admin'
    ? paymentRequests
    : paymentRequests.filter((request) => String(request.requesterId) === String(currentUser?.id || ''))

  const filteredAuditEntries = auditEntries.filter((entry) =>
    (auditActionFilter === 'alle' || entry.action === auditActionFilter)
    && `${entry.userName} ${entry.collection} ${entry.label} ${entry.action}`.toLocaleLowerCase().includes(auditSearch.trim().toLocaleLowerCase()),
  )

  const filteredMachinebauRecords = useMemo(() => machinebauRecords
    .filter((record) => machinebauTypeFilter === 'alle' || record.type === machinebauTypeFilter)
    .filter((record) => `${record.title} ${record.reference} ${record.status} ${record.responsible} ${record.summary} ${record.details}`
      .toLocaleLowerCase().includes(machinebauSearch.trim().toLocaleLowerCase()))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))), [
    machinebauRecords,
    machinebauSearch,
    machinebauTypeFilter,
  ])
  const machinebauStats = useMemo(() => ({
    assets: machinebauRecords.filter((record) => record.type === 'anlage').length,
    projects: machinebauRecords.filter((record) => record.type === 'projekt' && record.status !== 'Abgeschlossen').length,
    workOrders: machinebauRecords.filter((record) => record.type === 'fertigungsauftrag' && !['Abgeschlossen', 'Storniert'].includes(record.status)).length,
    overdue: machinebauRecords.filter((record) => ['wartung', 'service'].includes(record.type)
      && record.dueDate && record.dueDate <= dashboardDate.toISOString().slice(0, 10)
      && !['Erledigt', 'Abgeschlossen'].includes(record.status)).length,
  }), [dashboardDate, machinebauRecords])

  const documentArchive = useMemo(() => [
    ...salesDocuments.map((salesDocument) => ({
      id: `sales-${salesDocument.id}`,
      type: 'beleg',
      typeLabel: salesDocumentTypes[salesDocument.kind]?.label || 'Verkaufsbeleg',
      title: `${salesDocument.number} · ${salesDocumentTypes[salesDocument.kind]?.label || 'Verkaufsbeleg'}`,
      detail: salesDocument.recipient || 'Kein Empfänger angegeben',
      date: salesDocument.documentDate || '',
      searchText: [salesDocument.number, salesDocument.recipient, salesDocument.recipientEmail, salesDocument.recipientAddress, salesDocument.relatedOrderId, salesDocument.responsibleName].join(' '),
      salesDocument,
    })),
    ...salesDocuments.filter((salesDocument) => salesDocument.shippingLabelCreatedAt).map((salesDocument) => ({
      id: `shipping-label-${salesDocument.id}`,
      type: 'versandetikett',
      typeLabel: 'Versandetikett',
      title: `${salesDocument.number} · Versandetikett`,
      detail: [salesDocument.recipient, salesDocument.carrierName || salesDocument.carrier, salesDocument.trackingNumber, salesDocument.shippingLabelCreatedBy && `erstellt von ${salesDocument.shippingLabelCreatedBy}`].filter(Boolean).join(' · ') || 'Versandetikett',
      date: String(salesDocument.shippingLabelCreatedAt).slice(0, 10),
      searchText: [salesDocument.number, salesDocument.recipient, salesDocument.recipientEmail, salesDocument.carrierName, salesDocument.carrier, salesDocument.trackingNumber, salesDocument.shippingLabelCreatedBy].join(' '),
      shippingLabelDocument: salesDocument,
    })),
    ...reports.map((report) => ({
      id: `report-${report.id}`,
      type: 'bericht',
      typeLabel: report.type || 'Bericht',
      title: report.title || 'Unbenannter Bericht',
      detail: [report.product, report.batchNumber && `Charge ${report.batchNumber}`, report.status].filter(Boolean).join(' · ') || 'Bericht',
      date: report.date || report.updatedAt || '',
      searchText: [report.product, report.batchNumber, report.status, report.author, report.summary].join(' '),
      report,
    })),
    ...uploadedDocuments.map((document) => ({
      id: `archive-upload-${document.id}`,
      type: 'datei',
      typeLabel: 'Hochgeladene Datei',
      title: document.name,
      detail: [document.uploadedBy || 'Unbekannt', document.sourceLabel, formatFileSize(document.size)].filter(Boolean).join(' · '),
      searchText: [document.name, document.uploadedBy, document.sourceLabel].join(' '),
      date: document.uploadedAt || '',
      sourceLabel: document.sourceLabel || '',
      uploadedDocument: document,
    })),
    ...products.filter((product) => product.labelAttachment?.dataUrl).map((product) => ({
      id: `product-label-${product.id}`,
      type: 'produktetikett',
      typeLabel: 'Produktetikett',
      title: product.labelAttachment.name,
      detail: `Produkt · ${product.name} · ${product.sku}`,
      date: product.labelAttachment.uploadedAt || '',
      searchText: [product.name, product.sku, product.labelAttachment.name].join(' '),
      productLabel: product.labelAttachment,
      parentId: product.id,
    })),
    ...products.flatMap((product) => (product.labReports || []).map((report) => ({
      id: `product-lab-${product.id}-${report.id}`,
      type: 'laborbericht',
      typeLabel: 'Laborbericht',
      title: report.name,
      detail: `Produkt · ${product.name}`,
      date: report.uploadedAt || '',
      searchText: [report.name, product.name, product.sku].join(' '),
      report,
      reportScope: 'produkt',
      parentId: product.id,
    }))),
    ...recipes.flatMap((recipe) => (recipe.labReports || []).map((report) => ({
      id: `recipe-lab-${recipe.id}-${report.id}`,
      type: 'laborbericht',
      typeLabel: 'Laborbericht',
      title: report.name,
      detail: `Rezeptur · ${recipe.name}`,
      date: report.uploadedAt || '',
      searchText: [report.name, recipe.name].join(' '),
      report,
      reportScope: 'rezeptur',
      parentId: recipe.id,
    }))),
  ].sort((left, right) => String(right.date).localeCompare(String(left.date))), [salesDocuments, reports, products, recipes, uploadedDocuments])

  const normalizeArchiveSearchText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  const archiveSearchTerms = normalizeArchiveSearchText(documentSearch).trim().split(/\s+/).filter(Boolean)
  const filteredDocumentArchive = documentArchive.filter((document) => {
    const searchableText = normalizeArchiveSearchText([
      document.id,
      document.typeLabel,
      document.title,
      document.detail,
      document.searchText,
      document.report?.summary,
      document.report?.author,
    ].join(' '))
    return (documentTypeFilter === 'alle' || document.type === documentTypeFilter)
      && archiveSearchTerms.every((term) => searchableText.includes(term))
  })

  const totals = useMemo(() => {
    const activeProducts = products.length
    const activeRecipes = recipes.length
    const openOrders = orders.filter((order) => !['Abgeschlossen', 'Storniert'].includes(order.status)).length
    const critical = inventory.filter((item) => item.status === 'Nachbestellen').length
    const trackedBottleProducts = products.filter((product) => Number.isSafeInteger(product.availableBottles) && product.availableBottles >= 0)
    const availableBottles = trackedBottleProducts.reduce((sum, product) => sum + product.availableBottles, 0)

    return { activeProducts, activeRecipes, openOrders, critical, availableBottles, trackedBottleProductCount: trackedBottleProducts.length }
  }, [products, recipes, orders, inventory])

  const activeProductionOrders = orders.filter((order) => order.status === 'In Produktion')
  const liveLabelPalette = Array.isArray(bottleLabel.design?.palette)
    && bottleLabel.design.palette.length === 3
    && bottleLabel.design.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color))
    ? bottleLabel.design.palette
    : ['#07131f', '#f2ad55', '#fff3df']
  const liveLabelMotif = ['citrus', 'berry', 'tropical', 'energy', 'botanical', 'geometric'].includes(bottleLabel.design?.motif)
    ? bottleLabel.design.motif
    : 'botanical'
  const liveMotifBackgrounds = {
    citrus: `radial-gradient(circle at 95% 0%, ${liveLabelPalette[1]} 0 12%, transparent 12.5%)`,
    berry: `radial-gradient(circle at 95% 0%, ${liveLabelPalette[1]} 0 9%, transparent 9.5%), radial-gradient(circle at 88% 8%, ${liveLabelPalette[2]} 0 5%, transparent 5.5%)`,
    tropical: `linear-gradient(130deg, transparent 75%, ${liveLabelPalette[1]} 75% 80%, transparent 80%)`,
    energy: `repeating-linear-gradient(135deg, transparent 0 24px, ${liveLabelPalette[1]} 24px 28px, transparent 28px 46px)`,
    botanical: `radial-gradient(ellipse at 100% 0%, ${liveLabelPalette[1]} 0 18%, transparent 18.5%)`,
    geometric: `linear-gradient(135deg, transparent 75%, ${liveLabelPalette[1]} 75% 80%, transparent 80%), linear-gradient(45deg, transparent 84%, ${liveLabelPalette[2]} 84% 88%, transparent 88%)`,
  }

  const customerOptions = useMemo(() => {
    const knownCustomers = [...salesDocuments.map((salesDocument) => ({
      id: salesDocument.customerId,
      name: salesDocument.recipient,
      address: salesDocument.recipientAddress,
    })), ...orders.map((order) => ({ name: order.customer, address: '' })), ...customers]
    return [...new Map(knownCustomers.filter((customer) => customer.name).map((customer) => [customer.name.toLocaleLowerCase(), customer])).values()]
  }, [customers, orders, salesDocuments])

  const mdeOpenOrders = salesDocuments.filter((document) =>
    document.kind === 'kundenauftrag' && !['Verpackt', 'Versendet', 'Storniert'].includes(document.status),
  )
  const mdeSelectedOrder = salesDocuments.find((document) => String(document.id) === String(mdeOrderId)) || null
  const mdeOrderLines = useMemo(() => {
    const quantities = new Map()
    getSalesDocumentItems(mdeSelectedOrder).forEach((item) => {
      const productId = String(item.productId ?? '')
      const existing = quantities.get(productId)
      const product = products.find((entry) => String(entry.id) === productId)
      if (!productId || !product) return
      quantities.set(productId, {
        productId,
        name: product.name || item.productName || 'Produkt',
        sku: product.sku || item.productSku || '',
        ean: product.ean13 || '',
        required: (existing?.required || 0) + Number(item.quantity || 0),
        available: product.availableBottles,
        scanned: Number(mdeSelectedOrder?.mdeScannedQuantities?.[productId] ?? mdeScannedQuantities[productId] ?? 0),
        lots: (product.lots || []).filter((entry) => entry.quantity > 0),
      })
    })
    return [...quantities.values()]
  }, [mdeSelectedOrder, mdeScannedQuantities, products])
  const mdeReceiptProductMatches = products.filter((product) => [
    product.sku,
    product.ean13,
    product.bottleLabel?.ean13,
  ].some((value) => String(value || '').trim().toLocaleLowerCase() === mdeReceipt.barcode.trim().toLocaleLowerCase()))
  const mdeReceiptProduct = mdeReceiptProductMatches.length === 1 ? mdeReceiptProductMatches[0] : null
  const mdePreparedCharges = mdeReceiptProduct
    ? orders.filter((order) => (
      String(order.product || '').trim().toLocaleLowerCase() === String(mdeReceiptProduct.name || '').trim().toLocaleLowerCase()
      && String(order.lotNumber || '').trim()
      && !['Storniert', 'Abgebrochen'].includes(order.status)
    ))
    : []
  const mdePreparedCharge = mdePreparedCharges.find((order) => String(order.id) === mdeReceipt.preparedChargeId) || null

  useEffect(() => {
    if (activeTab === 'mde') mdeScanInputRef.current?.focus({ preventScroll: true })
  }, [activeTab, mdeInputMode, mdeOrderId])

  const revenueAnalytics = useMemo(() => {
    const customerTotals = new Map(customerOptions.map((customer) => [customer.name.toLocaleLowerCase(), {
      id: customer.id,
      name: customer.name,
      address: customer.address || '',
      invoiceCount: 0,
      net: 0,
      gross: 0,
      paid: 0,
      outstanding: 0,
    }]))
    let net = 0
    let gross = 0
    let paid = 0
    let outstanding = 0
    let invoiceCount = 0

    salesDocuments
      .filter((salesDocument) => salesDocument.kind === 'rechnung' && !['Entwurf', 'Storniert'].includes(salesDocument.status))
      .forEach((salesDocument) => {
        const customerKey = (salesDocument.recipient || '').trim().toLocaleLowerCase()
        if (!customerKey) return
        const invoiceNet = getSalesDocumentItems(salesDocument).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
        const invoiceGross = invoiceNet * (1 + (Number(salesDocument.vatRate) || 0) / 100)
        const customerTotal = customerTotals.get(customerKey) || {
          id: salesDocument.customerId,
          name: salesDocument.recipient,
          address: salesDocument.recipientAddress || '',
          invoiceCount: 0,
          net: 0,
          gross: 0,
          paid: 0,
          outstanding: 0,
        }
        customerTotal.invoiceCount += 1
        customerTotal.net += invoiceNet
        customerTotal.gross += invoiceGross
        if (salesDocument.status === 'Bezahlt') {
          customerTotal.paid += invoiceGross
          paid += invoiceGross
        } else {
          customerTotal.outstanding += invoiceGross
          outstanding += invoiceGross
        }
        net += invoiceNet
        gross += invoiceGross
        invoiceCount += 1
        customerTotals.set(customerKey, customerTotal)
      })

    return {
      net,
      gross,
      paid,
      outstanding,
      invoiceCount,
      customers: [...customerTotals.values()].sort((first, second) => second.gross - first.gross || first.name.localeCompare(second.name, 'de')),
    }
  }, [customerOptions, salesDocuments])

  const monthlyRevenue = useMemo(() => {
    const months = Array.from({ length: 12 }, (_entry, index) => new Date(dashboardDate.getFullYear(), dashboardDate.getMonth() - 11 + index, 1))
    const monthTotals = new Map(months.map((month) => [
      `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
      { net: 0, gross: 0, count: 0 },
    ]))

    salesDocuments
      .filter((salesDocument) => salesDocument.kind === 'rechnung' && !['Entwurf', 'Storniert'].includes(salesDocument.status))
      .forEach((salesDocument) => {
        const monthKey = String(salesDocument.documentDate || '').slice(0, 7)
        const totalsForMonth = monthTotals.get(monthKey)
        if (!totalsForMonth) return

        const net = getSalesDocumentItems(salesDocument).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
        totalsForMonth.net += net
        totalsForMonth.gross += net * (1 + (Number(salesDocument.vatRate) || 0) / 100)
        totalsForMonth.count += 1
      })

    const values = months.map((month) => {
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
      return {
        key,
        label: month.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }),
        ...monthTotals.get(key),
      }
    })

    return {
      values,
      maximum: Math.max(...values.map((month) => month.gross), 0),
    }
  }, [dashboardDate, salesDocuments])

  const financeReport = useMemo(
    () => calculateFinanceReport(financeEntries, financeMonth),
    [financeEntries, financeMonth],
  )
  const productionCalculationPreview = useMemo(() => {
    try {
      return calculateProductionCost(productionCalculationForm)
    } catch {
      return null
    }
  }, [productionCalculationForm])
  const elsterPreview = useMemo(
    () => calculateVatSubmissionPreview(financeEntries, financeMonth, elsterSetup.filingPeriod),
    [financeEntries, financeMonth, elsterSetup.filingPeriod],
  )
  useEffect(() => {
    if (activeTab !== 'finanzen' || currentUser?.role !== 'admin' || !authSessionToken || !networkInitialized) return
    const existing = window.zyroData?.get('zyro-elster-setup', authSessionToken)
    if (Array.isArray(existing?.value) && existing.value.length > 0) return
    if (networkStatus.mode === 'client' || !window.zyroElster) return
    let isActive = true
    window.zyroElster.getSetup(authSessionToken)
      .then(async (setup) => {
        const hasLegacyValues = Object.entries(setup).some(([field, value]) => (
          field !== 'filingPeriod' && field !== 'developerStatus' && value !== ''
        ))
        if (!isActive || !hasLegacyValues) return
        const result = await window.zyroData.set('zyro-elster-setup', [elsterSetupEntry(setup)], authSessionToken)
        if (result?.success === false) throw new Error(result.message || 'Speichern fehlgeschlagen.')
        setElsterSetup({ ...initialElsterSetup, ...setup })
        setElsterSetupMessage(networkStatus.cloudEnabled || networkStatus.mode === 'client'
          ? 'Bisherige lokale Angaben wurden übernommen und werden mit der Cloud synchronisiert.'
          : 'Bisherige lokale Angaben wurden übernommen. Cloud-Sync ist noch nicht aktiviert.')
      })
      .catch((error) => {
        if (isActive) setElsterSetupMessage(`ELSTER-Einstellungen konnten nicht geladen werden: ${error.message}`)
      })
    return () => { isActive = false }
  }, [activeTab, currentUser?.role, authSessionToken, networkInitialized, networkStatus.mode, networkStatus.cloudEnabled])

  const formatFinanceEuro = (cents) => new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format((Number(cents) || 0) / 100)

  const handleProductionCalculationInput = (event) => {
    const { name, value } = event.target
    const selectedProduct = name === 'productId'
      ? products.find((product) => String(product.id) === value)
      : null
    const productCrateSize = Number(selectedProduct?.bottlesPerCase)
    setProductionCalculationForm((current) => ({
      ...current,
      [name]: value,
      ...(Number.isSafeInteger(productCrateSize) && productCrateSize > 0
        ? { bottlesPerCrate: String(productCrateSize) }
        : {}),
    }))
    setProductionCalculationMessage('')
  }

  const updateProductionCostLine = (group, index, field, value) => {
    setProductionCalculationForm((current) => ({
      ...current,
      [group]: current[group].map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line),
    }))
    setProductionCalculationMessage('')
  }

  const addProductionCostLine = (group) => {
    setProductionCalculationForm((current) => ({
      ...current,
      [group]: [...current[group], { name: '', amount: '', unit: group === 'ingredients' ? 'kg' : 'Stück', unitPrice: '' }],
    }))
  }

  const analyzeOfferFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (currentUser?.role !== 'admin') {
      setProductionCalculationMessage('Angebote dürfen nur von einem Admin analysiert werden.')
      return
    }
    if (!window.zyroAI?.analyzeOffer && !firebaseEnabled) {
      setProductionCalculationMessage('Die Angebotsanalyse ist in dieser Installation nicht eingerichtet.')
      return
    }
    if (window.zyroAI?.analyzeOffer && !aiStatus?.configured) {
      setProductionCalculationMessage(networkStatus.mode === 'client'
        ? 'Bitte den Gemini-Zugang am Haupt-PC einrichten.'
        : 'Bitte zuerst in den Rezeptur-Einstellungen einen Gemini API-Schlüssel hinterlegen.')
      return
    }
    setOfferAnalysisLoading(true)
    setProductionCalculationMessage('')
    try {
      const contentType = file.type || ({
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      }[file.name.split('.').pop()?.toLowerCase()] || '')
      if (file.size > 10 * 1024 * 1024) throw new Error('Das Angebot darf höchstens 10 MB groß sein.')
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        throw new Error('Bitte ein PDF-, PNG-, JPG- oder WEBP-Angebot hochladen.')
      }
      const analysisRequest = window.zyroAI?.analyzeOffer
        ? window.zyroAI.analyzeOffer(
          file.name,
          contentType,
          new Uint8Array(await file.arrayBuffer()),
          authSessionToken,
        )
        : analyzeOfferDraft(file.name, contentType, await file.arrayBuffer())
      let timeoutId
      const analysis = await Promise.race([
        analysisRequest,
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error('Die Analyse hat nach 95 Sekunden nicht geantwortet. Bitte Verbindung und Gemini-Zugang prüfen und es erneut versuchen.')),
            95000,
          )
        }),
      ]).finally(() => window.clearTimeout(timeoutId))
      setProductionCalculationForm((current) => ({
        ...current,
        title: current.title || [analysis.supplierName, analysis.offerNumber].filter(Boolean).join(' · ') || file.name,
        offerAnalysis: { ...analysis, applied: false },
      }))
      setProductionCalculationMessage('Angebot analysiert. Bitte Positionen und Preise vor der Übernahme prüfen.')
    } catch (error) {
      setProductionCalculationMessage(`Angebotsanalyse fehlgeschlagen: ${error.message}`)
    } finally {
      setOfferAnalysisLoading(false)
    }
  }

  const applyOfferAnalysis = () => {
    const analysis = productionCalculationForm.offerAnalysis
    if (!analysis) return
    if (analysis.currency && analysis.currency.toUpperCase() !== 'EUR') {
      setProductionCalculationMessage('Das Angebot ist nicht in EUR. Preise bitte manuell umrechnen und eintragen.')
      return
    }
    const ingredientLines = []
    const packagingLines = []
    analysis.items.forEach((item) => {
      if (item.priceBasis !== 'netto' || item.unitPriceNet <= 0 || item.quantity <= 0) return
      const line = {
        name: item.name,
        amount: '',
        unit: item.unit || 'Stück',
        unitPrice: String(item.unitPriceNet),
      }
      if (item.category === 'ingredient') ingredientLines.push(line)
      if (item.category === 'packaging') packagingLines.push(line)
    })
    if (!ingredientLines.length && !packagingLines.length) {
      setProductionCalculationMessage('Keine eindeutig erkannten Netto-Positionen zum Übernehmen. Bitte Werte manuell prüfen und eintragen.')
      return
    }
    setProductionCalculationForm((current) => ({
      ...current,
      ingredients: [...current.ingredients.filter((line) => line.name || line.amount || line.unitPrice), ...ingredientLines],
      packaging: [...current.packaging.filter((line) => line.name || line.amount || line.unitPrice), ...packagingLines],
      offerAnalysis: { ...analysis, applied: true },
    }))
    setProductionCalculationMessage('Erkannte Netto-Positionen übernommen. Mengen und Preise vor dem Speichern kontrollieren.')
  }

  const saveProductionCalculation = (event) => {
    event.preventDefault()
    try {
      const title = productionCalculationForm.title.trim()
      if (!title) throw new Error('Bitte einen Namen für die Kalkulation eintragen.')
      const result = calculateProductionCost(productionCalculationForm)
      const calculation = {
        id: editingProductionCalculationId || crypto.randomUUID(),
        title,
        productId: productionCalculationForm.productId,
        productName: products.find((product) => String(product.id) === productionCalculationForm.productId)?.name || '',
        batchBottles: result.batchBottles,
        bottlesPerCrate: result.bottlesPerCrate,
        ingredients: result.ingredients.lines.map((line) => ({
          name: line.name,
          amount: line.amount,
          unit: line.unit,
          unitPrice: line.unitPriceCents / 100,
        })),
        packaging: result.packaging.lines.map((line) => ({
          name: line.name,
          amount: line.amount,
          unit: line.unit,
          unitPrice: line.unitPriceCents / 100,
        })),
        laborCost: result.laborCostCents / 100,
        overheadCost: result.overheadCostCents / 100,
        targetMarginPercent: result.targetMarginPercent,
        vatRate: result.vatRate,
        offerAnalysis: productionCalculationForm.offerAnalysis,
        updatedAt: new Date().toISOString(),
      }
      setProductionCalculations((current) => editingProductionCalculationId
        ? current.map((entry) => entry.id === editingProductionCalculationId ? calculation : entry)
        : [calculation, ...current])
      setEditingProductionCalculationId('')
      setProductionCalculationForm(createProductionCalculationForm())
      setProductionCalculationMessage(networkStatus.cloudEnabled || ['host', 'client'].includes(networkStatus.mode)
        ? 'Kalkulation gespeichert und für den Cloud-/Netzwerk-Sync vorgemerkt.'
        : 'Kalkulation lokal gespeichert. Cloud-Sync aktivieren, um sie zwischen PCs zu synchronisieren.')
    } catch (error) {
      setProductionCalculationMessage(error.message)
    }
  }

  const editProductionCalculation = (calculation) => {
    setEditingProductionCalculationId(calculation.id)
    setProductionCalculationForm({
      title: calculation.title || '',
      productId: calculation.productId || '',
      batchBottles: String(calculation.batchBottles ?? ''),
      bottlesPerCrate: String(calculation.bottlesPerCrate ?? 24),
      ingredients: (calculation.ingredients || []).map((line) => ({
        ...line,
        amount: String(line.amount ?? ''),
        unitPrice: String(line.unitPrice ?? ''),
      })),
      packaging: (calculation.packaging || []).map((line) => ({
        ...line,
        amount: String(line.amount ?? ''),
        unitPrice: String(line.unitPrice ?? ''),
      })),
      laborCost: String(calculation.laborCost ?? ''),
      overheadCost: String(calculation.overheadCost ?? ''),
      targetMarginPercent: String(calculation.targetMarginPercent ?? '40'),
      vatRate: String(calculation.vatRate ?? '19'),
      offerAnalysis: calculation.offerAnalysis || null,
    })
    setProductionCalculationMessage('')
    setActiveTab('kalkulation')
  }

  const removeProductionCalculation = (calculation) => {
    if (!window.confirm(`Kalkulation „${calculation.title}“ endgültig löschen?`)) return
    setProductionCalculations((current) => current.filter((entry) => entry.id !== calculation.id))
    if (editingProductionCalculationId === calculation.id) {
      setEditingProductionCalculationId('')
      setProductionCalculationForm(createProductionCalculationForm())
    }
    setProductionCalculationMessage('Kalkulation wurde gelöscht.')
  }

  const handleProductInput = (event) => {
    const { name, value } = event.target
    setProductForm((current) => ({ ...current, [name]: value }))
    setProductFormMessage('')
  }

  const handleProductImages = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (files.some((file) => !file.type.startsWith('image/'))) {
      setProductFormMessage('Bitte eine Bilddatei (JPG, PNG, WebP) wählen.')
      return
    }
    try {
      const currentImages = productForm.shopImages?.length ? productForm.shopImages : (productForm.shopImage ? [productForm.shopImage] : [])
      if (currentImages.length + files.length > 5) {
        setProductFormMessage('Pro Produkt sind höchstens 5 Bilder möglich.')
        return
      }
      const compressedImages = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => {
          const scale = Math.min(1, 720 / Math.max(image.width, image.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(image.width * scale)
          canvas.height = Math.round(image.height * scale)
          const context = canvas.getContext('2d')
          if (!context) {
            URL.revokeObjectURL(url)
            reject(new Error('Bild konnte nicht verarbeitet werden.'))
            return
          }
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.78)
          if (dataUrl.length > 190000) {
            reject(new Error('Ein Bild ist zu groß. Bitte kleinere Bilder wählen.'))
            return
          }
          resolve(dataUrl)
        }
        image.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('Mindestens ein Bild konnte nicht gelesen werden.'))
        }
        image.src = url
      })))
      const nextImages = [...currentImages, ...compressedImages]
      setProductForm((current) => ({ ...current, shopImages: nextImages, shopImage: nextImages[0] || '' }))
      setProductFormMessage('')
    } catch (error) {
      setProductFormMessage(error.message || 'Die Produktbilder konnten nicht verarbeitet werden.')
    }
  }

  const handleProductLabelUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const typeByExtension = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    }
    const extension = file.name.split('.').pop()?.toLowerCase()
    const contentType = file.type || typeByExtension[extension]
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      setProductFormMessage('Für das Produktetikett bitte eine PDF-, JPG-, PNG- oder WebP-Datei wählen.')
      return
    }
    if (file.size < 1 || file.size > 2 * 1024 * 1024) {
      setProductFormMessage('Das Produktetikett darf höchstens 2 MB groß sein.')
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setProductForm((current) => ({
        ...current,
        labelAttachment: {
          name: file.name.slice(0, 180),
          type: contentType,
          size: file.size,
          dataUrl,
          uploadedAt: new Date().toISOString().slice(0, 10),
        },
      }))
      setProductFormMessage('')
    } catch (error) {
      setProductFormMessage(`Produktetikett konnte nicht gelesen werden: ${error.message}`)
    }
  }

  const selectLabelProduct = (productId) => {
    setLabelProductId(String(productId))
    const product = products.find((entry) => String(entry.id) === String(productId))
    const linkedRecipe = recipes.find((recipe) => recipe.name === product?.name)
    const savedLabel = product?.bottleLabel || {}
    const usesPreviousRundumDefault = savedLabel.labelFormat === 'rundum'
      && String(savedLabel.widthMm) === '185'
      && String(savedLabel.heightMm) === '90'
    setBottleLabel({
      ...initialBottleLabel,
      ...savedLabel,
      ean13: product?.ean13 || savedLabel.ean13 || '',
      volume: savedLabel.volume || '0,5 l',
      labelFormat: savedLabel.labelFormat || 'rundum',
      widthMm: usesPreviousRundumDefault ? '190' : savedLabel.widthMm || '190',
      heightMm: usesPreviousRundumDefault ? '100' : savedLabel.heightMm || '100',
      ingredients: product?.bottleLabel?.ingredients || linkedRecipe?.ingredients || '',
    })
    setLabelMessage('')
  }

  const handleBottleLabelInput = (event) => {
    const { name, value } = event.target
    const nutritionFields = new Set(['energyKj', 'energyKcal', 'fat', 'saturates', 'carbohydrates', 'sugars', 'protein', 'salt'])
    setBottleLabel((current) => ({
      ...current,
      [name]: value,
      ...(nutritionFields.has(name) ? { nutritionConfirmed: false } : {}),
    }))
  }

  const handleLabelArtworkUpload = (event) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLabelMessage('Bitte ein Produkt- oder Fruchtmotiv als Bild auswählen.')
      input.value = ''
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setLabelMessage('Das Motivbild darf höchstens 8 MB groß sein.')
      input.value = ''
      return
    }

    readFileAsDataUrl(file).then((dataUrl) => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          setLabelMessage('Das Motivbild konnte nicht verarbeitet werden.')
          return
        }
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        setBottleLabel((current) => ({ ...current, artworkDataUrl: canvas.toDataURL('image/jpeg', 0.86) }))
        setLabelMessage('Motivbild geladen. Etikett anschließend speichern.')
      }
      image.onerror = () => setLabelMessage('Das Motivbild konnte nicht geöffnet werden.')
      image.src = dataUrl
    }).catch((error) => setLabelMessage(`Motivbild konnte nicht geladen werden: ${error.message}`))
      .finally(() => { input.value = '' })
  }

  const estimateBottleLabelNutrition = async () => {
    const product = products.find((entry) => String(entry.id) === String(labelProductId))
    if (!product) {
      setLabelMessage('Bitte zuerst ein Produkt auswählen.')
      return
    }
    if (!window.zyroAI || !aiStatus?.labelConfigured) {
      setLabelMessage(networkStatus?.mode === 'client'
        ? 'ChatGPT muss zuerst am Haupt-PC eingerichtet werden.'
        : 'Bitte zuerst im Etikettenbereich einen OpenAI API-Schlüssel für ChatGPT hinterlegen.')
      return
    }
    const recipe = recipes.find((entry) => entry.name === product.name)
    const ingredients = String(recipe?.ingredients || bottleLabel.ingredients).trim()
    if (!ingredients || !/\d/.test(ingredients)) {
      setLabelMessage('Bitte eine Rezeptur mit Zutatenmengen hinterlegen, bevor die KI Nährwerte schätzt.')
      return
    }

    setLabelDesignLoading(true)
    setLabelMessage('')
    const prompt = [
      'Schätze Nährwerte für das folgende Getränk auf Basis der Zutaten und Mengen. Rechne die Werte auf genau 100 ml Endprodukt um und berücksichtige die Batchgröße. Die Werte sind Schätzungen, keine Laboranalyse.',
      'Antworte ausschließlich mit JSON: energyKj, energyKcal, fat, saturates, carbohydrates, sugars, protein und salt. Alle Werte müssen nichtnegative Zahlen sein. Mengen in kJ, kcal oder g je 100 ml. Unbekannte Werte vorsichtig schätzen; nichts als gesundheitliche Aussage formulieren.',
      `Produkt: ${product.name}`,
      `Füllmenge: ${bottleLabel.volume}`,
      `Batchgröße: ${recipe?.batchSize || 'nicht angegeben'}`,
      `Zutaten und Mengen: ${ingredients.slice(0, 3000)}`,
    ].join('\n')
    try {
      const result = await window.zyroAI.estimateLabelNutrition(prompt)
      setBottleLabel((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(result.nutrition).map(([field, value]) => [field, String(value)])),
        nutritionEstimated: true,
        nutritionEstimatedAt: getCurrentTimestamp(),
        nutritionConfirmed: false,
      }))
      setLabelMessage('Nährwerte geschätzt. Vor dem Druck fachlich oder anhand einer Laboranalyse prüfen und bestätigen.')
    } catch (error) {
      setLabelMessage(`Nährwerte konnten nicht geschätzt werden: ${error.message}`)
    } finally {
      setLabelDesignLoading(false)
    }
  }


  const generateBottleLabelDesign = async () => {
    const product = products.find((entry) => String(entry.id) === String(labelProductId))
    if (!product) {
      setLabelMessage('Bitte zuerst ein Produkt auswählen.')
      return
    }
    if (!window.zyroAI || !aiStatus?.labelConfigured) {
      setLabelMessage(networkStatus?.mode === 'client'
        ? 'ChatGPT muss zuerst am Haupt-PC eingerichtet werden.'
        : 'Bitte zuerst im Etikettenbereich einen OpenAI API-Schlüssel für ChatGPT hinterlegen.')
      return
    }

    setLabelDesignLoading(true)
    setLabelMessage('')
    const prompt = [
      'Entwirf eine visuelle Richtung für ein hochwertiges horizontales Rundumetikett für eine 500-ml-Getränkedose. Gestalte es wie ein Premium-Dosendesign in tiefem Marineblau, warmem Gold und Cremeweiß. Drei Zonen: links eine schmale Markenstory, mittig groß Produktname und Fruchtmotiv, rechts Zutaten/Nährwerte/EAN in einer dunklen, ruhigen und gut lesbaren Fläche.',
      'Antworte ausschließlich als JSON mit genau diesen Feldern: palette (Array mit genau 3 Hex-Farben in der Reihenfolge dunkle Grundfarbe, Gold-Akzent, helle Schriftfarbe), motif (einer von citrus, berry, tropical, energy, botanical, geometric), direction (kurze visuelle Beschreibung, maximal 180 Zeichen).',
      'Keine weiteren Felder. Erfinde keine Texte, Nährwerte, Zutaten, Allergene, EAN-Codes, Gesundheits- oder Umweltversprechen. Halte den Kontrast hoch und die Nährwertzone gut lesbar.',
      `Produkt: ${product.name}`,
      `Kategorie: ${product.category}`,
      `Füllmenge: ${bottleLabel.volume}`,
      `Produktbeschreibung: ${bottleLabel.productDescription.slice(0, 300)}`,
      `Zutaten als visueller Kontext: ${bottleLabel.ingredients.slice(0, 800)}`,
    ].join('\n')
    try {
      const result = await window.zyroAI.generateLabelDesign(prompt)
      setBottleLabel((current) => ({ ...current, design: result.design }))
      setLabelMessage('KI-Design erstellt. Pflichtangaben bleiben unverändert; Vorschau vor dem Druck prüfen.')
    } catch (error) {
      setLabelMessage(`KI-Design fehlgeschlagen: ${error.message}`)
    } finally {
      setLabelDesignLoading(false)
    }
  }

  const saveBottleLabel = async () => {
    const product = products.find((entry) => String(entry.id) === String(labelProductId))
    if (!product) {
      setLabelMessage('Bitte zuerst ein Produkt auswählen.')
      return
    }
    if (bottleLabel.ean13 && !isValidEan13(bottleLabel.ean13)) {
      setLabelMessage('Bitte eine gültige 13-stellige EAN-13 mit korrekter Prüfziffer eingeben.')
      return
    }
    if (bottleLabel.ean13 && products.some((entry) => String(entry.id) !== String(labelProductId)
      && (entry.ean13 === bottleLabel.ean13 || entry.bottleLabel?.ean13 === bottleLabel.ean13))) {
      setLabelMessage('Diese EAN ist bereits einem anderen Produkt zugeordnet.')
      return
    }
    setLabelSaving(true)
    const updatedProducts = products.map((entry) => String(entry.id) === String(labelProductId)
      ? { ...entry, ean13: bottleLabel.ean13, bottleLabel: { ...bottleLabel } }
      : entry)
    try {
      if (window.zyroData) {
        const result = await window.zyroData.set('zyro-products', updatedProducts, authSessionToken)
        if (result?.success === false) throw new Error(result.message || 'Speichern wurde abgelehnt.')
        sharedSyncSkipRef.current.add('zyro-products')
      } else {
        window.localStorage.setItem('zyro-products', JSON.stringify(updatedProducts))
      }
      setProducts(updatedProducts)
      setLabelMessage('Etikett gespeichert und mit dem Haupt-PC synchronisiert.')
    } catch (error) {
      setLabelMessage(`Etikett konnte nicht gespeichert werden: ${error.message}`)
    } finally {
      setLabelSaving(false)
    }
  }

  const previewBottleLabel = () => {
    const product = products.find((entry) => String(entry.id) === String(labelProductId))
    if (!product) {
      setLabelMessage('Bitte zuerst ein Produkt auswählen.')
      return
    }
    if (!isValidEan13(bottleLabel.ean13)) {
      setLabelMessage('Die EAN-13-Prüfziffer ist ungültig. Bitte den Barcode prüfen.')
      return
    }
    if (!bottleLabel.ingredients.trim() || !bottleLabel.allergens.trim() || !bottleLabel.operatorName.trim() || !bottleLabel.operatorAddress.trim()) {
      setLabelMessage('Zutaten, Allergenangabe und verantwortliches Unternehmen mit Anschrift sind erforderlich.')
      return
    }
    const nutritionValues = ['energyKj', 'energyKcal', 'fat', 'saturates', 'carbohydrates', 'sugars', 'protein', 'salt']
    if (nutritionValues.some((field) => bottleLabel[field] === '' || !Number.isFinite(Number(bottleLabel[field])) || Number(bottleLabel[field]) < 0)) {
      setLabelMessage('Bitte alle Nährwerte als gültige Werte ab 0 je 100 ml eintragen.')
      return
    }
    if (!bottleLabel.nutritionConfirmed) {
      setLabelMessage('Bitte Nährwerte vor dem Druck fachlich oder anhand einer Laboranalyse prüfen und bestätigen.')
      return
    }
    const widthMm = Number(bottleLabel.widthMm)
    const heightMm = Number(bottleLabel.heightMm)
    if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < 40 || widthMm > 200 || heightMm < 40 || heightMm > 250) {
      setLabelMessage('Etikettenmaße müssen zwischen 40–200 mm Breite und 40–250 mm Höhe liegen.')
      return
    }

    try {
      const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(barcodeSvg, bottleLabel.ean13, { format: 'EAN13', displayValue: true, width: 1.7, height: 34, margin: 0, fontSize: 12 })
      const defaultPalette = ['#07131f', '#f2ad55', '#fff3df']
      const palette = Array.isArray(bottleLabel.design?.palette)
        && bottleLabel.design.palette.length === 3
        && bottleLabel.design.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color))
        ? bottleLabel.design.palette
        : defaultPalette
      const motif = ['citrus', 'berry', 'tropical', 'energy', 'botanical', 'geometric'].includes(bottleLabel.design?.motif)
        ? bottleLabel.design.motif
        : 'botanical'
      const motifBackgrounds = {
        citrus: `radial-gradient(circle at 94% 12%, ${palette[1]} 0 8mm, transparent 8.4mm), radial-gradient(circle at 90% 14%, ${palette[2]} 0 2mm, transparent 2.4mm)`,
        berry: `radial-gradient(circle at 92% 12%, ${palette[1]} 0 6mm, transparent 6.4mm), radial-gradient(circle at 85% 16%, ${palette[2]} 0 3mm, transparent 3.4mm)`,
        tropical: `linear-gradient(125deg, transparent 76%, ${palette[1]} 76% 80%, transparent 80%), radial-gradient(circle at 94% 12%, ${palette[2]} 0 7mm, transparent 7.4mm)`,
        energy: `repeating-linear-gradient(135deg, transparent 0 8mm, ${palette[1]} 8mm 9mm, transparent 9mm 15mm)`,
        botanical: `radial-gradient(ellipse at 100% 0%, ${palette[1]} 0 18mm, transparent 18.4mm)`,
        geometric: `linear-gradient(135deg, transparent 75%, ${palette[1]} 75% 79%, transparent 79%), linear-gradient(45deg, transparent 82%, ${palette[2]} 82% 86%, transparent 86%)`,
      }
      const nutritionRows = [
        ['Energie', `${escapeHtml(bottleLabel.energyKj || '–')} kJ / ${escapeHtml(bottleLabel.energyKcal || '–')} kcal`],
        ['Fett', `${escapeHtml(bottleLabel.fat || '–')} g`],
        ['davon gesättigte Fettsäuren', `${escapeHtml(bottleLabel.saturates || '–')} g`],
        ['Kohlenhydrate', `${escapeHtml(bottleLabel.carbohydrates || '–')} g`],
        ['davon Zucker', `${escapeHtml(bottleLabel.sugars || '–')} g`],
        ['Eiweiß', `${escapeHtml(bottleLabel.protein || '–')} g`],
        ['Salz', `${escapeHtml(bottleLabel.salt || '–')} g`],
      ].map(([name, value]) => `<tr><td>${name}</td><td>${value}</td></tr>`).join('')
      const artworkDataUrl = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(bottleLabel.artworkDataUrl || '') ? bottleLabel.artworkDataUrl : ''
      const artworkMarkup = artworkDataUrl
        ? `<img class="hero-image" src="${escapeHtml(artworkDataUrl)}" alt="Produktmotiv">`
        : `<div class="hero-placeholder"><span>${escapeHtml(motif)}</span><strong>${escapeHtml(bottleLabel.productDescription || product.name)}</strong></div>`
      const labelHtml = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Etikett ${escapeHtml(product.name)}</title><style>
        @page{size:${widthMm}mm ${heightMm}mm;margin:0}
        *{box-sizing:border-box}
        html,body{width:${widthMm}mm;height:${heightMm}mm;margin:0;font:6.2pt/1.2 Arial,sans-serif;color:${palette[2]}}
        body{overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .label{position:relative;isolation:isolate;width:100%;height:100%;display:grid;grid-template-columns:23% 50% 27%;overflow:hidden;border:.35mm solid ${palette[1]};background:${palette[0]}}
        .label-left,.label-center,.label-right{position:relative;min-width:0;padding:2.5mm;overflow:hidden}
        .label-left{z-index:1;display:flex;flex-direction:column;gap:2.2mm;border-right:.3mm solid ${palette[1]};background:linear-gradient(145deg,${palette[0]},#020a11);color:${palette[2]}}
        .brand{font-size:7pt;font-weight:800;letter-spacing:.4mm;color:${palette[1]}}
        .tagline{margin:0;padding-bottom:1.5mm;border-bottom:.3mm solid ${palette[1]};font-size:8pt;line-height:1.25;font-weight:700;letter-spacing:.5mm;text-transform:uppercase;color:${palette[1]}}
        .back-copy{margin:0;white-space:pre-line;font-size:6.2pt;line-height:1.35;color:${palette[2]}}
        .label-left small{margin-top:auto;font-size:5.2pt;letter-spacing:.2mm;color:${palette[1]}}
        .label-center{z-index:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:1mm;text-align:center;background:${palette[0]};background-image:linear-gradient(145deg,transparent 71%,${palette[1]} 71% 73%,transparent 73%),linear-gradient(325deg,transparent 83%,${palette[1]} 83% 85%,transparent 85%),${motifBackgrounds[motif]};background-size:100% 100%,100% 100%,cover}
        .center-mark{font:italic 18pt/1 Georgia,serif;font-weight:700;color:${palette[1]}}
        .center-brand{margin-top:-1mm;font-size:22pt;line-height:1;font-weight:800;letter-spacing:1mm;color:${palette[2]}}
        .product{max-width:100%;margin:0;font-size:15pt;line-height:1.05;letter-spacing:.3mm;text-transform:uppercase;color:${palette[1]};overflow-wrap:anywhere}
        .product-description{margin:0;font-size:7pt;line-height:1.35;letter-spacing:.45mm;text-transform:uppercase;color:${palette[2]}}
        .hero-art{width:100%;min-height:0;flex:1;display:grid;place-items:center;overflow:hidden}
        .hero-image{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 1mm 1.5mm rgba(0,0,0,.4))}
        .hero-placeholder{width:68%;height:85%;display:grid;place-items:center;align-content:center;gap:2mm;border:.6mm solid ${palette[1]};border-radius:50%;background:radial-gradient(circle at 35% 30%,${palette[1]},${palette[0]} 72%);color:${palette[2]};font-size:8pt}
        .center-foot{display:flex;align-items:center;justify-content:center;gap:2mm;width:100%;padding-top:1.2mm;border-top:.3mm solid ${palette[1]};font-size:7pt;font-weight:700;letter-spacing:.8mm;color:${palette[1]}}
        .center-foot span{font-size:9pt;letter-spacing:.2mm;color:${palette[2]}}
        .label-right{z-index:1;display:flex;flex-direction:column;gap:1.2mm;border-left:.3mm solid ${palette[1]};background:linear-gradient(145deg,${palette[0]},#020a11);color:${palette[2]}}
        .right-description{margin:0;font-size:6.2pt;font-weight:700}
        .section{margin:0;font-size:5.6pt;line-height:1.25}
        .section strong{display:block;margin-bottom:.4mm;font-size:6pt;color:${palette[1]}}
        .nutrition{width:100%;border-collapse:collapse;font-size:5.4pt}
        .nutrition caption{text-align:left;font-weight:700;border:.25mm solid ${palette[1]};padding:.6mm;color:${palette[2]}}
        .nutrition td{padding:.35mm 0;border-bottom:.2mm solid rgba(255,243,223,.35)}
        .nutrition td:last-child{text-align:right;white-space:nowrap}
        .volume{font-size:11pt;line-height:1;font-weight:700;color:${palette[2]}}
        .legal{margin-top:auto;font-size:4.8pt;line-height:1.25;white-space:pre-line}
        .barcode{display:flex;justify-content:center;max-height:11mm;overflow:hidden;padding:.6mm;background:#fff}
        .barcode svg{width:38mm;max-width:100%;height:auto}
        @media screen{body{box-shadow:0 1mm 4mm #666}}
        </style></head><body><main class="label"><aside class="label-left"><div class="brand">ZYRO®</div>${bottleLabel.tagline ? `<h2 class="tagline">${escapeHtml(bottleLabel.tagline)}</h2>` : ''}${bottleLabel.backDescription ? `<p class="back-copy">${escapeHtml(bottleLabel.backDescription)}</p>` : ''}<small>${escapeHtml(bottleLabel.operatorName)}</small></aside><section class="label-center"><div class="center-mark">Z</div><div class="center-brand">ZYRO</div><h1 class="product">${escapeHtml(product.name)}</h1>${bottleLabel.productDescription ? `<p class="product-description">${escapeHtml(bottleLabel.productDescription)}</p>` : ''}<div class="hero-art">${artworkMarkup}</div><div class="center-foot">PREMIUM GETRÄNK <span>${escapeHtml(bottleLabel.volume)}</span></div></section><aside class="label-right"><p class="right-description">${escapeHtml(bottleLabel.productDescription || `${product.category} · Erfrischungsgetränk`)}</p><p class="section"><strong>Zutaten</strong>${escapeHtml(bottleLabel.ingredients).replace(/\n/g, '<br>')}</p><p class="section"><strong>Allergene</strong>${escapeHtml(bottleLabel.allergens)}</p><table class="nutrition"><caption>Nährwerte je 100 ml</caption><tbody>${nutritionRows}</tbody></table>${bottleLabel.storage ? `<p class="section"><strong>Aufbewahrung</strong>${escapeHtml(bottleLabel.storage)}</p>` : ''}${bottleLabel.deposit ? `<p class="section"><strong>${escapeHtml(bottleLabel.deposit)}</strong></p>` : ''}<div class="volume">${escapeHtml(bottleLabel.volume)}</div><div class="barcode">${barcodeSvg.outerHTML}</div><div class="legal">${escapeHtml(bottleLabel.operatorName)}<br>${escapeHtml(bottleLabel.operatorAddress).replace(/\n/g, '<br>')}${bottleLabel.lotNumber ? `<br>Los: ${escapeHtml(bottleLabel.lotNumber)}` : ''}${bottleLabel.bestBefore ? `<br>MHD: ${escapeHtml(bottleLabel.bestBefore)}` : ''}</div></aside></main></body></html>`
      const previewWindow = window.open('', '_blank')
      if (!previewWindow) throw new Error('Die Vorschau wurde vom Browser blockiert.')
      previewWindow.document.write(labelHtml)
      previewWindow.document.close()
      showPrintPreview(previewWindow, {
        html: labelHtml,
        fileName: `${product.sku || product.name}-Etikett.pdf`,
        pageSizeMm: { width: widthMm, height: heightMm },
      })
      setLabelMessage('Etikettenvorschau geöffnet.')
    } catch (error) {
      setLabelMessage(`Etikett konnte nicht erstellt werden: ${error.message}`)
    }
  }

  const handleRecipeInput = (event) => {
    const { name, value } = event.target
    setRecipeForm((current) => ({ ...current, [name]: value }))
  }

  const handleLabReportUpload = async (event, setForm) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    setLabReportMessage('')
    if (files.length === 0) return

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (files.some((file) => !allowedTypes.includes(file.type))) {
      setLabReportMessage('Erlaubt sind PDF-, PNG-, JPG- und WebP-Dateien.')
      return
    }
    if (files.some((file) => file.size > 8 * 1024 * 1024)) {
      setLabReportMessage('Ein Laborbericht darf höchstens 8 MB groß sein.')
      return
    }

    try {
      const reports = await Promise.all(files.map(async (file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
      })))
      setForm((current) => ({ ...current, labReports: [...(current.labReports || []), ...reports] }))
      setLabReportMessage(`${reports.length} Laborbericht${reports.length === 1 ? '' : 'e'} hinzugefügt.`)
    } catch {
      setLabReportMessage('Die ausgewählte Datei konnte nicht gelesen werden.')
    }
  }

  const handleArchiveDocumentUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    setArchiveUploadMessage('')
    if (files.length === 0) return

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (files.some((file) => !allowedTypes.includes(file.type) || file.size < 1)) {
      setArchiveUploadMessage('Erlaubt sind PDF-, JPG-, PNG- und WebP-Dateien.')
      return
    }
    if (files.some((file) => file.size > 2 * 1024 * 1024)) {
      setArchiveUploadMessage('Eine Datei darf höchstens 2 MB groß sein.')
      return
    }

    try {
      const documents = await Promise.all(files.map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
        uploadedAt: new Date().toISOString().slice(0, 10),
        uploadedBy: currentUser?.name || '',
      })))
      const updatedDocuments = [...uploadedDocuments, ...documents]
      if (getArchiveDocumentsBytes(updatedDocuments) > maxArchiveDocumentsBytes) {
        setArchiveUploadMessage('Das Dokumentenarchiv kann höchstens 7 MB an Dateidaten enthalten. Bitte lade kleinere oder weniger Dateien hoch.')
        return
      }
      setUploadedDocuments(updatedDocuments)
      setArchiveUploadMessage(`${documents.length} Datei${documents.length === 1 ? '' : 'en'} hinzugefügt.`)
    } catch (error) {
      setArchiveUploadMessage(`Datei konnte nicht gelesen werden: ${error.message}`)
    }
  }

  const archiveMailboxAttachments = ({ attachments = [], folder, mailboxEmail, message }) => {
    const sourceLabel = [
      folder === 'sent' ? 'Gesendet' : 'Posteingang',
      message?.subject,
      message?.from,
    ].filter(Boolean).join(' · ')
    const sourcePrefix = `${String(mailboxEmail || '').toLocaleLowerCase()}:${folder}:${message?.messageId || message?.uid}:`
    const existingSourceKeys = new Set(uploadedDocuments.map((document) => document.sourceKey).filter(Boolean))
    const newDocuments = []
    let alreadyArchived = 0
    let tooLarge = 0
    attachments.forEach((attachment) => {
      if (!attachment.available || !attachment.contentBase64 || !Number.isSafeInteger(attachment.size) || attachment.size < 1) return
      if (attachment.size > maxEmailArchiveAttachmentBytes) {
        tooLarge += 1
        return
      }
      const sourceKey = `${sourcePrefix}${attachment.index}`
      if (existingSourceKeys.has(sourceKey)) {
        alreadyArchived += 1
        return
      }
      existingSourceKeys.add(sourceKey)
      newDocuments.push({
        id: crypto.randomUUID(),
        name: String(attachment.name || 'E-Mail-Anhang').slice(0, 180),
        type: String(attachment.contentType || 'application/octet-stream'),
        size: attachment.size,
        dataUrl: `data:${attachment.contentType || 'application/octet-stream'};base64,${attachment.contentBase64}`,
        uploadedAt: message?.date || new Date().toISOString(),
        uploadedBy: currentUser?.name || 'Postfach',
        sourceKey,
        sourceLabel: `E-Mail · ${sourceLabel}`,
      })
    })
    const skipped = attachments.length - alreadyArchived - newDocuments.length
    if (newDocuments.length) {
      const updatedDocuments = [...uploadedDocuments, ...newDocuments]
      if (getArchiveDocumentsBytes(updatedDocuments) > maxArchiveDocumentsBytes) {
        return { message: 'Der Archivspeicher ist voll (maximal 7 MB). Anhänge bitte einzeln herunterladen und manuell verwalten.' }
      }
      setUploadedDocuments(updatedDocuments)
    }
    const notes = []
    if (newDocuments.length) notes.push(`${newDocuments.length} ${newDocuments.length === 1 ? 'Anhang' : 'Anhänge'} im Dokumentenarchiv gespeichert`)
    if (alreadyArchived) notes.push(`${alreadyArchived} bereits archiviert`)
    if (tooLarge) notes.push(`${tooLarge} wegen der 5-MB-Grenze nicht archiviert`)
    if (skipped > tooLarge) notes.push(`${skipped - tooLarge} nicht verfügbar`)
    return { message: notes.length ? `${notes.join(' · ')}.` : 'Für diese E-Mail sind keine neuen, archivierungsfähigen Anhänge vorhanden.' }
  }

  const removeUploadedDocument = (documentId, approved = false) => {
    const document = uploadedDocuments.find((entry) => String(entry.id) === String(documentId))
    if (!document) return
    if (requiresDeleteApproval && !approved) {
      createDeleteRequest('archivdatei', document.id, document.name)
      return
    }
    if (!approved && !window.confirm(`Datei „${document.name}“ aus dem Archiv löschen?`)) return
    setUploadedDocuments((current) => current.filter((entry) => String(entry.id) !== String(documentId)))
  }

  const downloadArchivedFile = (document) => {
    const link = window.document.createElement('a')
    link.href = document.dataUrl
    link.download = document.name
    link.click()
  }

  const removeLabReport = (setForm, reportId) => {
    setForm((current) => ({
      ...current,
      labReports: (current.labReports || []).filter((report) => report.id !== reportId),
    }))
  }

  const handleOrderInput = (event) => {
    const { name, value } = event.target
    setOrderForm((current) => ({ ...current, [name]: value }))
  }

  const createWorkflowEvent = (action, details) => ({
    id: crypto.randomUUID(),
    timestamp: getCurrentTimestamp(),
    userId: String(currentUser.id),
    userName: currentUser.name,
    action,
    details,
  })

  const handleQualityDraft = (orderId, field, value) => {
    setQualityDrafts((current) => ({
      ...current,
      [orderId]: { ...current[orderId], [field]: value },
    }))
  }

  const saveQualityReview = (orderId) => {
    const draft = qualityDrafts[orderId]
    if (!draft) return

    const checkedAt = new Date().toISOString()
    setOrders((current) => current.map((order) => {
      if (order.id !== orderId) return order

      const review = {
        id: checkedAt,
        checkedAt,
        status: draft.qualityStatus ?? order.qualityStatus ?? 'Nicht geprüft',
        notes: draft.qualityNotes ?? order.qualityNotes ?? '',
        reviewer: currentUser.name,
      }

      return {
        ...order,
        ...draft,
        qualityCheckedAt: checkedAt,
        qualityHistory: [...(order.qualityHistory || []), review],
        workflowHistory: [...(order.workflowHistory || []), createWorkflowEvent('Qualitätsprüfung', `${review.status}${review.notes ? ` · ${review.notes}` : ''}`)],
      }
    }))
    setQualityDrafts((current) => {
      const next = { ...current }
      delete next[orderId]
      return next
    })
  }

  const handleInventoryInput = (event) => {
    const { name, value } = event.target
    setInventoryForm((current) => ({ ...current, [name]: value }))
  }

  const saveCustomer = (event) => {
    event.preventDefault()
    const name = customerForm.name.trim()
    if (!name) return

    const matchingOption = customerOptions.find((customer) => customer.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    const id = editingCustomerId ?? matchingOption?.id ?? Date.now()
    const customer = {
      ...customerForm,
      id,
      name,
      address: customerForm.address.trim(),
      contactName: customerForm.contactName.trim(),
      email: customerForm.email.trim(),
      phone: customerForm.phone.trim(),
      shippingAddress: customerForm.shippingAddress.trim(),
      vatId: customerForm.vatId.trim(),
      iban: customerForm.iban.replace(/\s/g, '').toUpperCase(),
      paymentTerms: customerForm.paymentTerms.trim(),
      paymentMethod: customerForm.paymentMethod.trim(),
      notes: customerForm.notes.trim(),
    }
    setCustomers((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === id || entry.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      return existingIndex < 0
        ? [customer, ...current]
        : current.map((entry, index) => index === existingIndex ? { ...entry, ...customer } : entry)
    })
    setViewingCustomer((current) => current && (current.id === id || current.name === name) ? customer : current)
    setCustomerForm(initialCustomerForm)
    setEditingCustomerId(null)
  }

  const deleteCustomer = (customer) => {
    if (currentUser?.role !== 'admin' || !customer?.name) return
    if (!window.confirm(`Kundendatensatz „${customer.name}“ löschen? Rechnungen und Aufträge bleiben erhalten.`)) return
    const editingId = customer.id ?? customer.name
    setCustomers((current) => current.filter((entry) => customer.id == null
      ? entry.name !== customer.name
      : entry.id !== customer.id))
    setViewingCustomer((current) => current?.id === customer.id ? null : current)
    if (editingCustomerId === editingId) {
      setCustomerForm(initialCustomerForm)
      setEditingCustomerId(null)
    }
  }

  const editCustomer = (customer) => {
    setCustomerForm({ ...initialCustomerForm, ...customer, name: customer.name || '', address: customer.address || '' })
    setEditingCustomerId(customer.id ?? customer.name)
  }

  const handleLoginInput = (event) => {
    const { name, value } = event.target
    setLoginForm((current) => ({ ...current, [name]: value }))
  }

  const handleUserInput = (event) => {
    const { name, value } = event.target
    setUserForm((current) => ({ ...current, [name]: value }))
  }

  const handleRegistrationInput = (event) => {
    const { name, value } = event.target
    setRegistrationForm((current) => ({ ...current, [name]: value }))
  }

  const addProduct = (event) => {
    event.preventDefault()
    if (!productForm.name.trim() || !productForm.sku.trim()) {
      setProductFormMessage('Bitte Produktname und SKU eintragen.')
      return
    }
    if (productForm.ean13 && !isValidEan13(productForm.ean13)) {
      setProductFormMessage('Die EAN muss eine gültige 13-stellige EAN-13 sein.')
      return
    }
    if (productForm.ean13 && products.some((product) => product.ean13 === productForm.ean13 || product.bottleLabel?.ean13 === productForm.ean13)) {
      setProductFormMessage('Diese EAN ist bereits einem anderen Produkt zugeordnet.')
      return
    }
    if (productForm.availableBottles !== '' && (!Number.isSafeInteger(Number(productForm.availableBottles)) || Number(productForm.availableBottles) < 0)) {
      setProductFormMessage('Der Bestand muss eine positive ganze Zahl oder 0 sein.')
      return
    }
    if (productForm.shopPreorderEnabled && !isValidExpectedDeliveryDate(productForm.shopExpectedDeliveryDate)) {
      setProductFormMessage('Bitte für Vorbestellungen ein gültiges erwartetes Lieferdatum ab heute eintragen.')
      return
    }

    const newProduct = {
      id: Date.now(),
      name: productForm.name.trim(),
      sku: productForm.sku.trim().toUpperCase(),
      ean13: productForm.ean13,
      category: productForm.category,
      volume: productForm.volume || '500ml',
      productionQuantity: Number(productForm.productionQuantity) || 0,
      productionUnit: productForm.productionUnit,
      availableBottles: productForm.availableBottles === '' ? null : Math.floor(Number(productForm.availableBottles)),
      unitPrice: Number(productForm.unitPrice) || 0,
      status: productForm.status,
      labReports: productForm.labReports || [],
      ...productExtras(productForm),
    }

    setProducts((current) => [newProduct, ...current])
    setOrderForm((current) => ({ ...current, product: current.product || newProduct.name }))
    setProductForm(initialProductForm)
    setProductFormMessage('')
  }

  const saveProduct = (event) => {
    event.preventDefault()
    if (!productForm.name.trim() || !productForm.sku.trim()) {
      setProductFormMessage('Bitte Produktname und SKU eintragen.')
      return
    }
    if (productForm.ean13 && !isValidEan13(productForm.ean13)) {
      setProductFormMessage('Die EAN muss eine gültige 13-stellige EAN-13 sein.')
      return
    }
    if (productForm.ean13 && products.some((product) => String(product.id) !== String(editingProductId)
      && (product.ean13 === productForm.ean13 || product.bottleLabel?.ean13 === productForm.ean13))) {
      setProductFormMessage('Diese EAN ist bereits einem anderen Produkt zugeordnet.')
      return
    }
    if (productForm.availableBottles !== '' && (!Number.isSafeInteger(Number(productForm.availableBottles)) || Number(productForm.availableBottles) < 0)) {
      setProductFormMessage('Der Bestand muss eine positive ganze Zahl oder 0 sein.')
      return
    }
    if (productForm.shopPreorderEnabled && !isValidExpectedDeliveryDate(productForm.shopExpectedDeliveryDate)) {
      setProductFormMessage('Bitte für Vorbestellungen ein gültiges erwartetes Lieferdatum ab heute eintragen.')
      return
    }

    const existingProduct = products.find((product) => String(product.id) === String(editingProductId))

    const updatedProduct = {
      id: editingProductId,
      name: productForm.name.trim(),
      sku: productForm.sku.trim().toUpperCase(),
      ean13: productForm.ean13,
      category: productForm.category,
      volume: productForm.volume || '500ml',
      productionQuantity: Number(productForm.productionQuantity) || 0,
      productionUnit: productForm.productionUnit,
      availableBottles: productForm.availableBottles === '' ? null : Math.floor(Number(productForm.availableBottles)),
      unitPrice: Number(productForm.unitPrice) || 0,
      status: productForm.status,
      labReports: productForm.labReports || [],
      ...productExtras(productForm),
      bottleLabel: existingProduct?.bottleLabel
        ? { ...existingProduct.bottleLabel, ean13: productForm.ean13 }
        : undefined,
    }

    setProducts((current) =>
      current.map((product) => (product.id === editingProductId ? { ...product, ...updatedProduct } : product)),
    )
    setEditingProductId(null)
    setProductForm(initialProductForm)
    setProductFormMessage('')
  }

  const createDeleteRequest = (type, targetId, targetName, targetDetails = null) => {
    const existingRequest = deleteRequests.find((request) =>
      request.status === 'offen' && request.type === type && String(request.targetId) === String(targetId),
    )
    if (existingRequest) {
      setNetworkDataMessage('Für diesen Datensatz liegt bereits eine offene Löschanfrage vor.')
      return
    }

    setTicketForm({
      ...initialTicketForm,
      subject: `Löschanfrage: ${targetName}`,
      category: 'loeschung',
      description: `Bitte den Datensatz „${targetName}“ löschen. Ergänze hier den Grund für die Anfrage.`,
      targetType: type,
      targetId,
      targetName,
      targetDetails,
    })
    setTicketFeedback('')
    setActiveTab('tickets')
  }

  const handleTicketInput = (event) => {
    const { name, value } = event.target
    setTicketForm((current) => ({ ...current, [name]: value }))
  }

  const handleProfileInput = (event) => {
    const { name, value } = event.target
    setProfileForm((current) => ({ ...current, [name]: value }))
  }

  const handleProfileImage = (event) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setProfileFeedback('Bitte eine Bilddatei auswählen.')
      input.value = ''
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setProfileFeedback('Das Bild darf höchstens 8 MB groß sein.')
      input.value = ''
      return
    }

    readFileAsDataUrl(file).then((dataUrl) => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          setProfileFeedback('Das Bild konnte nicht verarbeitet werden.')
          return
        }
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        setProfileForm((current) => ({ ...current, avatarDataUrl: canvas.toDataURL('image/jpeg', 0.82) }))
        setProfileFeedback('Bild bereit. Änderungen noch speichern.')
      }
      image.onerror = () => setProfileFeedback('Die Bilddatei konnte nicht geöffnet werden.')
      image.src = dataUrl
    }).catch((error) => setProfileFeedback(`Bild konnte nicht geladen werden: ${error.message}`))
      .finally(() => { input.value = '' })
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    setProfileSaving(true)
    setProfileFeedback('')
    try {
      const result = await window.zyroAuth.updateProfile(profileForm, authSessionToken)
      setCurrentUser(result.user)
      setUsers(result.users)
      setProfileForm({
        name: result.user.name || '',
        email: result.user.email || '',
        phone: result.user.phone || '',
        address: result.user.address || '',
        avatarDataUrl: result.user.avatarDataUrl || '',
      })
      setProfileFeedback('Profil gespeichert und mit den verbundenen Geräten synchronisiert.')
    } catch (error) {
      setProfileFeedback(`Profil konnte nicht gespeichert werden: ${error.message}`)
    } finally {
      setProfileSaving(false)
    }
  }

  const saveAccount = async (event) => {
    event.preventDefault()
    if (accountForm.newPassword && accountForm.newPassword !== accountForm.confirmPassword) {
      setAccountFeedback('Die neuen Passwörter stimmen nicht überein.')
      return
    }
    setAccountSaving(true)
    setAccountFeedback('')
    try {
      const account = {
        username: accountForm.username,
        currentPassword: accountForm.currentPassword,
        newPassword: accountForm.newPassword,
      }
      const result = await window.zyroAuth.updateAccount(account, authSessionToken)
      setCurrentUser(result.user)
      setUsers(result.users)
      setAccountForm({ username: result.user.username, currentPassword: '', newPassword: '', confirmPassword: '' })
      setAccountFeedback('Zugangsdaten wurden gespeichert.')
    } catch (error) {
      setAccountFeedback(error.message)
    } finally {
      setAccountSaving(false)
    }
  }

  const submitTicket = (event) => {
    event.preventDefault()
    if (!ticketForm.subject.trim() || !ticketForm.description.trim()) {
      setTicketFeedback('Bitte Betreff und Beschreibung ausfüllen.')
      return
    }

    const id = crypto.randomUUID()
    const createdAt = getCurrentTimestamp()
    const description = ticketForm.description.trim()
    const ticket = {
      id,
      ticketNumber: `ZY-${new Date().getFullYear()}-${id.slice(0, 6).toUpperCase()}`,
      type: ticketForm.targetType || 'anfrage',
      targetId: ticketForm.targetId || id,
      targetName: ticketForm.targetName || ticketForm.subject.trim(),
      targetDetails: ticketForm.targetDetails,
      category: ticketForm.category,
      subject: ticketForm.subject.trim(),
      priority: ticketForm.priority,
      reason: description,
      requestedBy: currentUser.name,
      requestedById: currentUser.id,
      assignedToId: '',
      assignedToName: '',
      requestedAt: createdAt,
      status: 'offen',
      messages: [{ id: crypto.randomUUID(), by: currentUser.name, byId: currentUser.id, role: currentUser.role, createdAt, text: description }],
    }
    setDeleteRequests((current) => [...current, ticket])
    setTicketForm(initialTicketForm)
    setTicketFeedback(`Anfrage ${ticket.ticketNumber} wurde erstellt.`)
  }

  const sendTicketMessage = (ticketId) => {
    const text = String(ticketMessageDrafts[ticketId] || '').trim()
    if (!text) return
    const message = { id: crypto.randomUUID(), by: currentUser.name, byId: currentUser.id, role: currentUser.role, createdAt: getCurrentTimestamp(), text }
    setDeleteRequests((current) => current.map((ticket) => {
      if (ticket.id !== ticketId) return ticket
      const canReopen = ticket.status !== 'offen'
        && (String(ticket.requestedById) === String(currentUser.id) || String(ticket.assignedToId || '') === String(currentUser.id))
      return {
        ...ticket,
        ...(canReopen ? { status: 'offen' } : {}),
        messages: [...(ticket.messages || []), message],
      }
    }))
    setTicketMessageDrafts((current) => ({ ...current, [ticketId]: '' }))
  }

  const updateTicketStatus = (ticketId, status) => {
    if (!currentUser || currentUser.role !== 'admin' || networkStatus.mode === 'client') return
    const changedAt = getCurrentTimestamp()
    setDeleteRequests((current) => current.map((ticket) => ticket.id === ticketId && ticket.type === 'anfrage'
      ? {
        ...ticket,
        status,
        reviewedBy: currentUser.name,
        reviewedAt: changedAt,
        statusHistory: [...(ticket.statusHistory || []), { status, by: currentUser.name, byId: currentUser.id, createdAt: changedAt }],
      }
      : ticket))
  }

  const assignTicket = (ticketId, assigneeId) => {
    if (!currentUser || currentUser.role !== 'admin' || networkStatus.mode === 'client') return
    const assignee = users.find((user) => String(user.id) === String(assigneeId))
    setDeleteRequests((current) => current.map((ticket) => ticket.id === ticketId
      ? { ...ticket, assignedToId: assignee?.id || '', assignedToName: assignee?.name || '' }
      : ticket))
  }

  const deleteTicket = (ticket) => {
    if (!currentUser || currentUser.role !== 'admin' || networkStatus.mode === 'client') return
    const ticketNumber = ticket.ticketNumber || String(ticket.id)
    if (!window.confirm(`Ticket ${ticketNumber} wirklich löschen?`)) return
    setDeleteRequests((current) => current.filter((entry) => String(entry.id) !== String(ticket.id)))
  }

  const requiresDeleteApproval = currentUser?.role !== 'admin' || networkStatus.mode === 'client'

  const removeProduct = (productId) => {
    const product = products.find((entry) => entry.id === productId)
    if (requiresDeleteApproval) {
      if (product) createDeleteRequest('produkt', product.id, product.name)
      return
    }
    const nextProducts = products.filter((product) => product.id !== productId)
    setProducts(nextProducts)
    setOrderForm((current) => ({ ...current, product: nextProducts[0]?.name || '' }))
    if (editingProductId === productId) {
      setEditingProductId(null)
      setProductForm(initialProductForm)
    }
  }

  const submitStockAdjustment = (event) => {
    event.preventDefault()
    const product = products.find((entry) => String(entry.id) === String(adjustForm.productId))
    const quantity = Math.floor(Number(adjustForm.quantity))
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1) {
      setAdjustMessage('Bitte Produkt und eine Menge ab 1 angeben.')
      return
    }
    const current = Number.isSafeInteger(product.availableBottles) ? product.availableBottles : 0
    const increases = adjustForm.type === 'Retoure'
    if (!increases && quantity > current) {
      setAdjustMessage(`Es sind nur ${current} Dosen im Bestand.`)
      return
    }
    const nextStock = increases ? current + quantity : current - quantity
    setProducts((list) => list.map((entry) => (String(entry.id) === String(product.id) ? { ...entry, availableBottles: nextStock } : entry)))
    setStockMovements((list) => [...list, {
      id: `adj-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: adjustForm.type,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity,
      note: adjustForm.note.trim().slice(0, 250),
      userName: currentUser?.name || currentUser?.username || '',
    }])
    setAdjustForm({ productId: '', type: 'Bruch', quantity: '', note: '' })
    setAdjustMessage(`${adjustForm.type} gebucht: ${product.name} ${increases ? '+' : '−'}${quantity} (Bestand ${nextStock}).`)
  }

  const salesAnalysis = useMemo(() => {
    const since = Date.now() - 30 * 86400000
    const sold = new Map()
    salesDocuments.filter((entry) => ['rechnung', 'kundenauftrag'].includes(entry.kind) && entry.status !== 'Storniert').forEach((entry) => {
      const time = new Date(entry.documentDate || 0).getTime()
      getSalesDocumentItems(entry).forEach((item) => {
        const key = String(item.productId || item.productSku || item.productName)
        const row = sold.get(key) || { name: item.productName || item.productSku || 'Produkt', total: 0, last30: 0, revenue: 0 }
        const quantity = Number(item.quantity) || 0
        row.total += quantity
        row.revenue += quantity * (Number(item.unitPrice) || 0)
        if (time >= since) row.last30 += quantity
        sold.set(key, row)
      })
    })
    const rows = products.map((product) => {
      const stats = sold.get(String(product.id)) || sold.get(String(product.sku)) || { total: 0, last30: 0, revenue: 0 }
      const perDay = stats.last30 / 30
      const stock = Number.isSafeInteger(product.availableBottles) ? product.availableBottles : null
      return { id: product.id, name: product.name, ...stats, stock, daysLeft: perDay > 0 && stock !== null ? Math.floor(stock / perDay) : null }
    })
    return rows.sort((left, right) => right.last30 - left.last30)
  }, [products, salesDocuments])
  const totalSoldBottles = useMemo(() => salesDocuments
    .filter((document) => document.kind === 'rechnung' && !['Entwurf', 'Storniert'].includes(document.status))
    .reduce((total, document) => total + getSalesDocumentItems(document)
      .reduce((quantity, item) => quantity + (Number(item.quantity) || 0), 0), 0), [salesDocuments])

  useEffect(() => {
    setSalesTargetDraft(String(salesTarget[0]?.targetBottles || ''))
  }, [salesTarget])

  const saveSalesTarget = (event) => {
    event.preventDefault()
    const targetBottles = Number(salesTargetDraft)
    if (!Number.isSafeInteger(targetBottles) || targetBottles < 1 || targetBottles > 1000000000) {
      setSalesTargetMessage('Bitte ein Verkaufsziel als ganze Zahl ab 1 Dose eingeben.')
      return
    }
    setSalesTarget([{ id: 'global', targetBottles }])
    setSalesTargetMessage('Verkaufsziel gespeichert und mit der iOS-App synchronisiert.')
  }

  const saveShopShippingSettings = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const parseEuroCents = (value) => {
      const text = String(value || '').trim().replace(',', '.')
      if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null
      const cents = Math.round(Number(text) * 100)
      return Number.isSafeInteger(cents) ? cents : null
    }
    const parseCartonGrams = (value) => {
      const text = String(value || '').trim().replace(',', '.')
      if (!text) return undefined
      if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return null
      const grams = Math.round(Number(text) * 1000)
      return Number.isSafeInteger(grams) && grams <= 100000 ? grams : null
    }
    const shippingTiers = defaultShopShippingTiers.map((tier) => ({
      maxWeightGrams: tier.maxWeightGrams,
      priceCents: parseEuroCents(form.get(`shippingTier-${tier.maxWeightGrams}`)),
    }))
    const businessDpdShippingTiers = defaultShopShippingTiers.map((tier) => ({
      maxWeightGrams: tier.maxWeightGrams,
      priceCents: parseEuroCents(form.get(`businessDpdShippingTier-${tier.maxWeightGrams}`)),
    }))
    const businessDpdMaxTraysText = String(form.get('businessDpdMaxTrays') || '').trim()
    const businessDpdMaxTrays = /^\d+$/.test(businessDpdMaxTraysText) ? Number(businessDpdMaxTraysText) : null
    const shippingPricePerPalletCents = parseEuroCents(form.get('shippingPricePerPallet'))
    const shippingTraysPerPalletText = String(form.get('shippingTraysPerPallet') || '').trim()
    const shippingTraysPerPallet = /^\d+$/.test(shippingTraysPerPalletText) ? Number(shippingTraysPerPalletText) : null
    const largeCartonTareGrams = parseCartonGrams(form.get('largeCartonWeight'))
    const smallCartonTareGrams = parseCartonGrams(form.get('smallCartonWeight'))
    if (shippingTiers.some((tier) => tier.priceCents === null)
      || businessDpdShippingTiers.some((tier) => tier.priceCents === null)
      || !Number.isSafeInteger(businessDpdMaxTrays) || businessDpdMaxTrays < 1 || businessDpdMaxTrays > 20
      || shippingPricePerPalletCents === null
      || !Number.isSafeInteger(shippingTraysPerPallet) || shippingTraysPerPallet < 1 || shippingTraysPerPallet > 10000
      || largeCartonTareGrams === null || smallCartonTareGrams === null) {
      setShopMessage('Bitte gültige Versandpreise, Palettenfüllmenge und Kartongewichte eingeben.')
      return
    }
    const previous = shopSettings.find((entry) => entry?.id === 'global') || { id: 'global' }
    setShopSettings([{
      ...previous,
      id: 'global',
      shippingTiers,
      businessDpdShippingTiers,
      businessDpdMaxTrays,
      shippingPricePerPalletCents,
      shippingTraysPerPallet,
      ...(largeCartonTareGrams === undefined ? {} : { largeCartonTareGrams }),
      ...(smallCartonTareGrams === undefined ? {} : { smallCartonTareGrams }),
    }])
    setShopMessage('Versandkosten gespeichert. Sie gelten im Webshop nach dem Cloud-Abgleich.')
  }

  const saveShopDiscount = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const code = String(form.get('code') || '').trim().toUpperCase()
    const type = String(form.get('type') || '')
    const rawValue = String(form.get('value') || '').trim().replace(',', '.')
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      setShopMessage('Der Rabattcode muss 3–32 Buchstaben, Zahlen, Bindestriche oder Unterstriche enthalten.')
      return
    }
    if (shopDiscounts.some((entry) => entry.code === code)) {
      setShopMessage('Diesen Rabattcode gibt es bereits.')
      return
    }
    let value
    if (type === 'percent') {
      value = Number(rawValue)
      if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(value) || value < 1 || value > 100) {
        setShopMessage('Prozent-Rabatt muss eine ganze Zahl zwischen 1 und 100 sein.')
        return
      }
    } else if (type === 'fixed') {
      if (!/^\d+(?:\.\d{1,2})?$/.test(rawValue)) {
        setShopMessage('Bitte einen gültigen festen Rabattbetrag eingeben.')
        return
      }
      value = Math.round(Number(rawValue) * 100)
      if (!Number.isSafeInteger(value) || value < 1 || value > 100000000) {
        setShopMessage('Der feste Rabattbetrag ist ungültig.')
        return
      }
    } else {
      setShopMessage('Bitte eine gültige Rabattart auswählen.')
      return
    }
    setShopDiscounts((current) => [...current, { id: crypto.randomUUID(), code, type, value, active: true }])
    setShopMessage(`Rabattcode ${code} angelegt.`)
    event.currentTarget.reset()
  }

  const updateShopDiscount = (id, changes) => {
    setShopDiscounts((current) => current.map((entry) => entry.id === id ? { ...entry, ...changes } : entry))
  }

  const loadBusinessCustomers = async () => {
    if (!window.zyroWebOrders?.listCustomerAccounts) {
      setShopMessage('Kundenkonten können nur von einem Admin in der Desktop-Verwaltung verwaltet werden.')
      return
    }
    setBusinessCustomersLoading(true)
    try {
      const { customers } = await window.zyroWebOrders.listCustomerAccounts(authSessionToken)
      setBusinessCustomers(Array.isArray(customers) ? customers : [])
      setBusinessCustomersLoaded(true)
      setShopMessage(`${Array.isArray(customers) ? customers.length : 0} Kundenkonten geladen.`)
    } catch (error) {
      setShopMessage(error.message || 'Geschäftskunden konnten nicht geladen werden.')
    } finally {
      setBusinessCustomersLoading(false)
    }
  }

  const deleteCustomerAccount = async (customer) => {
    if (customerDeleteEmailInput.trim().toLowerCase() !== customer.email.trim().toLowerCase()) {
      setShopMessage('Bitte gib zur Bestätigung genau die E-Mail-Adresse des Kundenkontos ein.')
      return
    }
    setDeletingCustomerEmail(customer.email)
    try {
      await window.zyroWebOrders.deleteCustomerAccount(customer.email, customerDeleteEmailInput.trim(), authSessionToken)
      setBusinessCustomers((current) => current.filter((entry) => entry.email !== customer.email))
      setCustomerDeleteConfirmation(null)
      setCustomerDeleteEmailInput('')
      setShopMessage(`Kundenkonto ${customer.email} gelöscht. Bestellungen und Rechnungen bleiben erhalten.`)
    } catch (error) {
      setShopMessage(error.message || `Kundenkonto ${customer.email} konnte nicht gelöscht werden.`)
    } finally {
      setDeletingCustomerEmail('')
    }
  }

  const saveBusinessCustomer = async (event, customer) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const status = String(form.get('status') || '')
    const businessPrices = {}
    for (const product of products.filter((entry) => (entry.shopActive === true || entry.shopActive === 'true') && entry.status !== 'Inaktiv')) {
      const productId = shopCatalogProductId(product)
      const rawPrice = String(form.get(`business-price-${productId}`) || '').trim().replace(',', '.')
      if (!rawPrice) continue
      if (!/^\d+(?:\.\d{1,2})?$/.test(rawPrice)) {
        setShopMessage(`Bitte für „${product.name}“ einen gültigen Verkaufspreis mit höchstens zwei Nachkommastellen eingeben.`)
        return
      }
      const priceCents = Math.round(Number(rawPrice) * 100)
      if (!Number.isSafeInteger(priceCents) || priceCents < 1 || priceCents > 100_000_000) {
        setShopMessage(`Der Verkaufspreis für „${product.name}“ muss größer als 0 € sein.`)
        return
      }
      businessPrices[productId] = priceCents
    }
    try {
      await window.zyroWebOrders.updateBusinessCustomer({
        email: customer.email,
        status,
        businessPrices,
      }, authSessionToken)
      setShopMessage(`Geschäftskundenkonto ${customer.email} aktualisiert.`)
      await loadBusinessCustomers()
    } catch (error) {
      setShopMessage(error.message || 'Geschäftskundenkonto konnte nicht aktualisiert werden.')
    }
  }

  const editProduct = (product) => {
    setEditingProductId(product.id)
    setProductFormMessage('')
    setProductForm({
      name: product.name,
      sku: product.sku,
      ean13: product.ean13 || product.bottleLabel?.ean13 || '',
      category: product.category,
      volume: displayProductVolume(product.volume),
      productionQuantity: product.productionQuantity ? String(product.productionQuantity) : '',
      productionUnit: product.productionUnit === 'Flaschen' ? 'Dosen' : (product.productionUnit || 'Dosen'),
      availableBottles: Number.isSafeInteger(product.availableBottles) && product.availableBottles >= 0 ? String(product.availableBottles) : '',
      unitPrice: product.unitPrice ? String(product.unitPrice) : '',
      status: product.status,
      labReports: product.labReports || [],
      ...productExtrasToForm(product),
    })
  }

  const addRecipe = (event) => {
    event.preventDefault()
    if (!recipeForm.name.trim() || !recipeForm.ingredients.trim()) return

    const existingRecipe = recipes.find((recipe) => recipe.id === editingRecipeId)
    const recipeDetailsChanged = existingRecipe && [
      recipeForm.name.trim() !== existingRecipe.name,
      recipeForm.type !== existingRecipe.type,
      (recipeForm.batchSize || '5.000ml') !== existingRecipe.batchSize,
      (recipeForm.description.trim() || 'Neue Rezeptur') !== existingRecipe.description,
      recipeForm.ingredients.trim() !== existingRecipe.ingredients,
    ].some(Boolean)
    const approvalInvalidated = recipeDetailsChanged && isRecipeApproved(existingRecipe)
    const newRecipe = {
      ...existingRecipe,
      id: editingRecipeId ?? Date.now(),
      name: recipeForm.name.trim(),
      type: recipeForm.type,
      batchSize: recipeForm.batchSize || '5.000ml',
      description: recipeForm.description.trim() || 'Neue Rezeptur',
      ingredients: recipeForm.ingredients.trim(),
      labReports: recipeForm.labReports || existingRecipe?.labReports || [],
      status: approvalInvalidated ? 'In Prüfung' : existingRecipe?.status || 'In Prüfung',
      approvedAt: approvalInvalidated ? undefined : existingRecipe?.approvedAt,
      approvedBy: approvalInvalidated ? undefined : existingRecipe?.approvedBy,
      aiGenerated: Boolean(recipeForm.aiGenerated || existingRecipe?.aiGenerated),
    }

    setRecipes((current) => editingRecipeId === null
      ? [newRecipe, ...current]
      : current.map((recipe) => recipe.id === editingRecipeId ? newRecipe : recipe))
    setEditingRecipeId(null)
    setRecipeForm(initialRecipeForm)
    setRecipeAiMessage('')
    setRecipeApprovalMessage(approvalInvalidated ? 'Änderungen gespeichert. Die Rezeptur muss erneut freigegeben werden.' : '')
  }

  const approveRecipe = (recipe) => {
    if (currentUser?.role !== 'admin') return

    const approvedAt = getCurrentTimestamp()
    setRecipes((current) => current.map((entry) => entry.id === recipe.id
      ? { ...entry, status: 'Freigegeben', approvedAt, approvedBy: currentUser.name }
      : entry))
    setRecipeApprovalMessage(`${recipe.name} wurde von ${currentUser.name} freigegeben.`)
  }

  const editRecipe = (recipe) => {
    setEditingRecipeId(recipe.id)
    setRecipeForm({
      name: recipe.name || '',
      type: recipe.type || 'Energy',
      batchSize: recipe.batchSize || '',
      description: recipe.description || '',
      ingredients: recipe.ingredients || '',
      labReports: recipe.labReports || [],
      aiGenerated: Boolean(recipe.aiGenerated),
    })
    setRecipeAiMessage('')
  }

  const developRecipe = async () => {
    if (!recipeForm.name.trim() || !recipeForm.description.trim()) {
      setRecipeAiMessage('Bitte Rezeptname und gewünschtes Geschmacksprofil eingeben.')
      return
    }
    if (!window.zyroAI && !firebaseEnabled) {
      setRecipeAiMessage('Firebase AI Logic ist nicht verfügbar. Firebase-Projekt konfigurieren und AI Logic aktivieren.')
      return
    }

    setRecipeAiLoading(true)
    setRecipeAiMessage('')
    try {
      const prompt = `Entwickle einen ersten Rezepturvorschlag für ein Getränk. Antworte ausschließlich als JSON mit den Feldern name, type, batchSize, description und ingredients. ingredients muss ein Array aus Objekten mit name, amount, unit und category sein. category darf ausschließlich einer dieser Werte sein: ${allowedRecipeIngredientCategories.join(', ')}. Verwende ausschließlich Wasser, Frucht-/Saftkonzentrate, Aromen/Extrakte, Zucker oder Süßungsmittel, Säuerungsmittel und Kohlensäure. Vitamine/Mineralstoffe und Koffein nur verwenden, wenn sie ausdrücklich in den Anforderungen genannt werden. Keine Kräuter, Gewürze, Öle, Farbstoffe, Konservierungsstoffe, Stabilisatoren oder sonstigen nicht genannten Zutaten verwenden. Wenn eine gewünschte Zutat außerhalb dieser Gruppen liegt, nicht durch eine andere Zutat ersetzen. Alle Mengen müssen zur Batchgröße passen; nutze metrische Einheiten.\nProduktname: ${recipeForm.name}\nKategorie: ${recipeForm.type}\nBatchgröße: ${recipeForm.batchSize || '10.000 ml'}\nGewünschtes Profil und Anforderungen: ${recipeForm.description}\nErfinde keine regulatorischen oder gesundheitlichen Freigaben. Kennzeichne den Vorschlag als zu prüfenden Laborentwurf.`
      const responseText = window.zyroAI
        ? await window.zyroAI.generateRecipe(prompt)
        : await generateRecipeDraft(prompt)
      const draft = JSON.parse(responseText)
      if (!draft.name || !Array.isArray(draft.ingredients) || draft.ingredients.length === 0) {
        throw new Error('Die KI-Antwort enthält keine verwertbare Zutatenliste.')
      }
      const requestedCaffeine = /\b(koffein|caffeine)\b/i.test(recipeForm.description)
      const requestedMicronutrients = /\b(vitamin(?:e|en)?|magnesium|kalium|natrium|calcium|zink|eisen|elektrolyt(?:e)?|potassium|sodium|zinc)\b/i.test(recipeForm.description)
      if (draft.ingredients.some((ingredient) =>
        !ingredient || typeof ingredient !== 'object'
        || !ingredient.name || !ingredient.amount || !ingredient.unit
        || !allowedRecipeIngredientCategories.includes(ingredient.category)
        || (ingredient.category === 'Vitamine/Mineralstoffe' && !requestedMicronutrients)
        || (ingredient.category === 'Koffein (nur wenn angefordert)' && !requestedCaffeine))) {
        throw new Error('Die KI hat Zutaten außerhalb der erlaubten Getränke-Zutatenkategorien vorgeschlagen. Bitte Anforderungen anpassen und erneut versuchen.')
      }

      const ingredients = draft.ingredients.map((ingredient) => `${ingredient.name}: ${ingredient.amount} ${ingredient.unit}`.trim()).join('\n')
      setRecipeForm((current) => ({
        ...current,
        name: draft.name || current.name,
        type: draft.type || current.type,
        batchSize: draft.batchSize || current.batchSize || '10.000 ml',
        description: draft.description || current.description,
        ingredients,
        aiGenerated: true,
      }))
      setRecipeAiMessage('KI-Entwurf erstellt. Zutaten und Mengen vor einer Produktionsfreigabe fachlich prüfen.')
    } catch (error) {
      setRecipeAiMessage(`Rezeptur konnte nicht entwickelt werden: ${error.message}`)
    } finally {
      setRecipeAiLoading(false)
    }
  }

  const saveGeminiApiKey = async () => {
    if (!window.zyroAI || !geminiApiKey.trim()) return

    setAiSettingsSaving(true)
    setRecipeAiMessage('')
    try {
      const status = await window.zyroAI.saveKey(geminiApiKey)
      setAiStatus((current) => ({ ...current, ...status }))
      setGeminiApiKey('')
      setAiSettingsOpen(false)
      setRecipeAiMessage('Gemini ist verbunden. Der API-Schlüssel wurde verschlüsselt auf diesem PC gespeichert.')
    } catch (error) {
      setRecipeAiMessage(`Gemini-Verbindung fehlgeschlagen: ${error.message}`)
    } finally {
      setAiSettingsSaving(false)
    }
  }

  const saveOpenAiApiKey = async () => {
    if (!window.zyroAI || !openAiApiKey.trim()) return

    setOpenAiKeySaving(true)
    setLabelMessage('')
    try {
      const status = await window.zyroAI.saveOpenAiKey(openAiApiKey)
      setAiStatus((current) => ({ ...current, ...status }))
      setOpenAiApiKey('')
      setLabelMessage('ChatGPT verbunden. Der API-Schlüssel wurde am Haupt-PC verschlüsselt gespeichert.')
    } catch (error) {
      setLabelMessage(`ChatGPT-Verbindung fehlgeschlagen: ${error.message}`)
    } finally {
      setOpenAiKeySaving(false)
    }
  }

  const addOrder = (event) => {
    event.preventDefault()
    if (!orderForm.customer.trim() || orderForm.bottleCount === '' || orderForm.crateCount === '') return

    const existingOrder = orders.find((order) => order.id === editingOrderId)
    const id = editingOrderId ?? Date.now()
    const productName = orderForm.product || products[0]?.name || 'Zyro Produkt'
    const lotYear = String(new Date().getFullYear()).slice(-2)
    const lastLotSequence = orders.reduce((highest, order) => {
      const match = String(order.lotNumber || '').match(/^CH(\d{2})-(\d+)$/)
      return match?.[1] === lotYear ? Math.max(highest, Number(match[2])) : highest
    }, 0)
    const lotNumber = existingOrder?.lotNumber || `CH${lotYear}-${String(lastLotSequence + 1).padStart(3, '0')}`
    const workflowHistory = [...(existingOrder?.workflowHistory || [])]
    if (!existingOrder) workflowHistory.push(createWorkflowEvent('Auftrag angelegt', `Status: ${orderForm.status}`))
    else if (existingOrder.status !== orderForm.status) workflowHistory.push(createWorkflowEvent('Status geändert', `${existingOrder.status} → ${orderForm.status}`))

    const newOrder = {
      ...existingOrder,
      id,
      customer: orderForm.customer.trim(),
      product: productName,
      internalCode: existingOrder?.internalCode || `ZYR-${id}`,
      bottleCount: Number(orderForm.bottleCount),
      crateCount: Number(orderForm.crateCount),
      bottler: bottlerDetails.name,
      recipeId: orderForm.recipeId || '',
      recipeName: recipes.find((recipe) => String(recipe.id) === orderForm.recipeId)?.name || '',
      recipeBatchSize: recipes.find((recipe) => String(recipe.id) === orderForm.recipeId)?.batchSize || '',
      recipeIngredients: recipes.find((recipe) => String(recipe.id) === orderForm.recipeId)?.ingredients || '',
      productionNotes: orderForm.productionNotes.trim(),
      handoffDate: orderForm.handoffDate,
      qualityStatus: existingOrder?.qualityStatus || 'Nicht geprüft',
      qualityNotes: existingOrder?.qualityNotes || '',
      lotNumber,
      dueDate: orderForm.dueDate || existingOrder?.dueDate || '2026-10-25',
      status: orderForm.status,
      workflowHistory,
    }

    setOrders((current) => editingOrderId === null
      ? [newOrder, ...current]
      : current.map((order) => order.id === editingOrderId ? newOrder : order))
    setEditingOrderId(null)
    setOrderForm({ ...initialOrderForm, product: products[0]?.name || productName })
  }

  const editOrder = (order) => {
    setEditingOrderId(order.id)
    setOrderForm({
      ...initialOrderForm,
      customer: order.customer || '',
      product: order.product || products[0]?.name || '',
      bottleCount: String(order.bottleCount ?? ''),
      crateCount: String(order.crateCount ?? ''),
      recipeId: order.recipeId ? String(order.recipeId) : '',
      productionNotes: order.productionNotes || '',
      handoffDate: order.handoffDate || '',
      dueDate: order.dueDate || '',
      status: order.status || 'In Produktion',
    })
  }

  const scanOrder = (event) => {
    event.preventDefault()
    const scannedCode = scanCode.trim().toUpperCase()
    const order = orders.find((entry) => (entry.internalCode || `ZYR-${entry.id}`).toUpperCase() === scannedCode)

    setScanCode('')
    if (!order) {
      setScannedOrder(null)
      setScanMessage(`Kein Auftrag mit dem Code „${scannedCode}“ gefunden.`)
      return
    }

    setScanMessage('')
    setScannedOrder(order)
  }

  const showPrintPreview = (printWindow, pdfDownload = null) => {
    const style = printWindow.document.createElement('style')
    style.textContent = `
      .zyro-print-preview-controls{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;gap:10px;padding:12px 20px;background:#071623;border-bottom:1px solid #30424d}
      .zyro-print-preview-controls button{min-height:38px;padding:8px 16px;border:1px solid #60747e;border-radius:4px;background:#132b38;color:#f4f7f8;font:600 14px Arial,sans-serif;cursor:pointer}
      .zyro-print-preview-controls button:first-child{border-color:#19816c;background:#19816c}
      .zyro-print-preview-controls button:hover{filter:brightness(1.12)}
      @media print{.zyro-print-preview-controls{display:none!important}}
    `
    printWindow.document.head.append(style)

    const controls = printWindow.document.createElement('nav')
    controls.className = 'zyro-print-preview-controls'
    controls.setAttribute('aria-label', 'Druckvorschau')

    const printButton = printWindow.document.createElement('button')
    printButton.type = 'button'
    printButton.textContent = 'Drucken'
    printButton.addEventListener('click', () => printWindow.print())

    if (pdfDownload && window.zyroData?.exportMonthlyInvoicesPdf) {
      const downloadButton = printWindow.document.createElement('button')
      downloadButton.type = 'button'
      downloadButton.textContent = 'PDF herunterladen'
      downloadButton.addEventListener('click', async () => {
        downloadButton.disabled = true
        try {
          const result = pdfDownload.pageSizeMm
            ? await window.zyroData.exportBottleLabelPdf(pdfDownload.html, pdfDownload.fileName, pdfDownload.pageSizeMm.width, pdfDownload.pageSizeMm.height)
            : await window.zyroData.exportMonthlyInvoicesPdf(pdfDownload.html, pdfDownload.fileName)
          if (!result.canceled) setNetworkDataMessage(`PDF gespeichert: ${result.filePath}`)
        } catch (error) {
          setNetworkDataMessage(`PDF konnte nicht gespeichert werden: ${error.message}`)
        } finally {
          downloadButton.disabled = false
        }
      })
      controls.append(downloadButton)
    }

    if (pdfDownload?.salesDocument?.kind === 'rechnung' && window.zyroData?.exportZugferdInvoice) {
      const zugferdButton = printWindow.document.createElement('button')
      zugferdButton.type = 'button'
      zugferdButton.textContent = 'ZUGFeRD herunterladen'
      zugferdButton.addEventListener('click', async () => {
        zugferdButton.disabled = true
        try {
          const result = await window.zyroData.exportZugferdInvoice(pdfDownload.salesDocument, pdfDownload.sellerDetails)
          if (!result.canceled) setNetworkDataMessage(`ZUGFeRD gespeichert: ${result.filePath}`)
        } catch (error) {
          setNetworkDataMessage(`ZUGFeRD konnte nicht erstellt werden: ${error.message}`)
        } finally {
          zugferdButton.disabled = false
        }
      })
      controls.append(zugferdButton)
    }

    if (pdfDownload?.salesDocument?.recipientEmail && salesDocumentTypes[pdfDownload.salesDocument.kind] && window.zyroWebOrders?.sendInvoice) {
      const documentLabel = salesDocumentTypes[pdfDownload.salesDocument.kind].label
      const emailButton = printWindow.document.createElement('button')
      emailButton.type = 'button'
      emailButton.dataset.zyroEmailButton = '1'
      emailButton.textContent = `${documentLabel} an ${pdfDownload.salesDocument.recipientEmail} senden`
      emailButton.addEventListener('click', async () => {
        emailButton.disabled = true
        try {
          await window.zyroWebOrders.sendInvoice({ salesDocument: pdfDownload.salesDocument, html: pdfDownload.html }, authSessionToken)
          setSalesDocuments((current) => current.map((document) => document.id === pdfDownload.salesDocument.id
            ? { ...document, status: 'Versendet', emailedAt: getCurrentTimestamp() }
            : document))
          setSalesFeedback(`${documentLabel} ${pdfDownload.salesDocument.number} wurde per E-Mail gesendet.`)
          emailButton.textContent = `${documentLabel} gesendet`
        } catch (error) {
          setSalesFeedback(`${documentLabel} konnte nicht gesendet werden: ${error.message}`)
          emailButton.disabled = false
        }
      })
      controls.append(emailButton)
      if (pdfDownload.salesDocument.kind === 'rechnung' && pdfDownload.salesDocument.status !== 'Entwurf') {
        const portalButton = printWindow.document.createElement('button')
        portalButton.type = 'button'
        portalButton.dataset.zyroPortalButton = '1'
        portalButton.textContent = pdfDownload.salesDocument.portalPublishedAt ? 'Im Kundenportal erneut bereitstellen' : 'Im Kundenportal bereitstellen'
        portalButton.addEventListener('click', async () => {
          portalButton.disabled = true
          try {
            await window.zyroWebOrders.sendInvoice({ salesDocument: pdfDownload.salesDocument, html: pdfDownload.html, publishOnly: true }, authSessionToken)
            setSalesDocuments((current) => current.map((document) => document.id === pdfDownload.salesDocument.id
              ? { ...document, portalPublishedAt: getCurrentTimestamp() }
              : document))
            setSalesFeedback(`Rechnung ${pdfDownload.salesDocument.number} ist jetzt im Kundenportal abrufbar.`)
            portalButton.textContent = 'Im Kundenportal bereitgestellt'
          } catch (error) {
            setSalesFeedback(`Rechnung konnte nicht bereitgestellt werden: ${error.message}`)
            portalButton.disabled = false
          }
        })
        controls.append(portalButton)
      }
    }

    const closeButton = printWindow.document.createElement('button')
    closeButton.type = 'button'
    closeButton.textContent = 'Schließen'
    closeButton.addEventListener('click', () => printWindow.close())

    controls.append(printButton, closeButton)
    printWindow.document.body.prepend(controls)
    printWindow.focus()
  }

  const downloadLabReportPdf = async (report) => {
    if (report.type === 'application/pdf') {
      const downloadLink = document.createElement('a')
      downloadLink.href = report.dataUrl
      downloadLink.download = report.name.toLowerCase().endsWith('.pdf') ? report.name : `${report.name}.pdf`
      downloadLink.click()
      return
    }

    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(report.name)}</title><style>html,body{margin:0;width:100%;height:100%;display:grid;place-items:center}img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img src="${escapeHtml(report.dataUrl)}" alt="${escapeHtml(report.name)}"></body></html>`
    try {
      const fileName = `${report.name.replace(/\.[^.]+$/, '')}.pdf`
      const result = await window.zyroData.exportMonthlyInvoicesPdf(html, fileName)
      if (!result.canceled) setNetworkDataMessage(`PDF gespeichert: ${result.filePath}`)
    } catch (error) {
      setNetworkDataMessage(`PDF konnte nicht gespeichert werden: ${error.message}`)
    }
  }

  const printOrder = (order) => {
    const internalCode = order.internalCode || `ZYR-${order.id}`
    const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(barcodeSvg, internalCode, { format: 'CODE128', displayValue: true, height: 52, margin: 0, fontSize: 14 })
    const recipe = order.recipeIngredients
      ? { name: order.recipeName, batchSize: order.recipeBatchSize, ingredients: order.recipeIngredients }
      : recipes.find((entry) => entry.name === order.product && isRecipeApproved(entry))
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const ingredientRows = (recipe?.ingredients || '').split('\n').filter(Boolean)
      .map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join('')
    const printDate = formatTimestamp(getCurrentTimestamp()).split(',')[0]
    printWindow.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Produktionsauftrag ${escapeHtml(order.lotNumber)}</title><style>
      body{font:15px/1.5 Arial,sans-serif;color:#18222a;margin:36px auto;max-width:820px;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:3px solid #19816c;padding-bottom:18px;margin-bottom:28px}h1{font-size:26px;margin:0}h2{font-size:17px;margin:26px 0 8px}p{margin:6px 0}.meta{color:#52616b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px}.field{border-bottom:1px solid #d7dfe2;padding:8px 0}.field strong{display:block;font-size:12px;text-transform:uppercase;color:#52616b}.barcode{margin:8px 0 20px}.barcode svg{max-width:100%;height:auto}.notes{white-space:pre-wrap;border:1px solid #d7dfe2;padding:12px;min-height:48px}ul{padding-left:22px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:64px}.signatures div{border-top:1px solid #52616b;padding-top:8px;font-size:12px;color:#52616b}@media print{body{margin:0 auto;padding:0}}</style></head><body>
      <header><div><p class="meta">${escapeHtml(companyDetails.name)} · ${escapeHtml(companyDetails.street)} · ${escapeHtml(companyDetails.city)}</p><h1>Produktionsauftrag</h1><p class="meta">Interne Auftrags-ID ${escapeHtml(internalCode)}</p></div><div class="meta">Erstellt am ${printDate}</div></header>
      <div class="barcode">${barcodeSvg.outerHTML}</div>
      <h2>Auftrag</h2><div class="grid">
      <div class="field"><strong>Lohnabfüller</strong>${escapeHtml(bottlerDetails.name)}<br>${escapeHtml(bottlerDetails.street)}<br>${escapeHtml(bottlerDetails.city)}</div><div class="field"><strong>Auftraggeber</strong>${escapeHtml(companyDetails.name)}<br>${escapeHtml(companyDetails.street)}<br>${escapeHtml(companyDetails.city)}</div>
      <div class="field"><strong>Besteller / Kunde</strong>${escapeHtml(order.customer)}</div>
      <div class="field"><strong>Produkt</strong>${escapeHtml(order.product)}</div><div class="field"><strong>Charge</strong>${escapeHtml(order.lotNumber)}</div>
      <div class="field"><strong>Interne Auftrags-ID</strong>${escapeHtml(internalCode)}</div><div class="field"><strong>Auftragsstatus</strong>${escapeHtml(order.status)}</div>
      <div class="field"><strong>Dosen</strong>${escapeHtml(order.bottleCount)}</div><div class="field"><strong>Trays</strong>${escapeHtml(order.crateCount)}</div>
      <div class="field"><strong>Übergabe</strong>${escapeHtml(order.handoffDate || 'Nicht festgelegt')}</div><div class="field"><strong>Gewünschte Lieferung</strong>${escapeHtml(order.dueDate || 'Nicht festgelegt')}</div></div>
      <h2>Rezeptur ${recipe?.name ? `· ${escapeHtml(recipe.name)}` : ''}</h2><p class="meta">Batchgröße: ${escapeHtml(recipe?.batchSize || 'Nicht angegeben')}</p><ul>${ingredientRows || '<li>Keine Rezeptur hinterlegt</li>'}</ul>
      <h2>Produktionshinweise</h2><div class="notes">${escapeHtml(order.productionNotes || 'Keine zusätzlichen Hinweise')}</div>
      <div class="signatures"><div>Freigabe Lohnabfüller · Datum / Unterschrift</div><div>Freigabe Auftraggeber · Datum / Unterschrift</div></div></body></html>`)
    printWindow.document.close()
    showPrintPreview(printWindow)
  }

  const addSalesDocument = async (event) => {
    event.preventDefault()
    const existingDocument = salesDocuments.find((entry) => entry.id === editingSalesDocumentId)
    const previousItems = getSalesDocumentItems(existingDocument)
    const items = salesDocumentForm.items.map((line) => {
      const product = products.find((entry) => String(entry.id) === String(line.productId))
        || previousItems.find((entry) => String(entry.productId) === String(line.productId))
      if (!product) return null

      const productName = product.name || product.productName || ''
      const productSku = product.sku || product.productSku || ''
      const productCategory = product.category || product.productCategory || ''
      const productVolume = product.volume || product.productVolume || ''

      return {
        productId: product.id ?? product.productId,
        productName,
        productSku,
        productCategory,
        productVolume,
        description: [productName, productSku, productCategory, productVolume].filter(Boolean).join(' · '),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      }
    })
    if (!salesDocumentForm.recipient.trim() || items.length === 0 || items.some((item) => !item || item.quantity <= 0 || item.unitPrice < 0)) return

    const existingCustomer = customerOptions.find((customer) =>
      (salesDocumentForm.customerId && String(customer.id) === salesDocumentForm.customerId)
      || customer.name.toLocaleLowerCase() === salesDocumentForm.recipient.trim().toLocaleLowerCase(),
    )
    const customer = {
      id: existingCustomer?.id ?? crypto.randomUUID(),
      name: salesDocumentForm.recipient.trim(),
      address: salesDocumentForm.recipientAddress.trim(),
    }
    setCustomers((current) => {
      const customerIndex = current.findIndex((entry) => entry.id === customer.id || entry.name.toLocaleLowerCase() === customer.name.toLocaleLowerCase())
      return customerIndex < 0
        ? [customer, ...current]
        : current.map((entry, index) => index === customerIndex ? customer : entry)
    })

    const id = editingSalesDocumentId ?? crypto.randomUUID()
    const prefix = salesDocumentTypes[salesDocumentForm.kind].prefix
    const lastNumber = salesDocuments
      .filter((salesDocument) => salesDocument.kind === salesDocumentForm.kind && salesDocument.id !== editingSalesDocumentId)
      .reduce((highest, salesDocument) => Math.max(highest, Number(salesDocument.number.split('-').at(-1)) || 0), 0)
    const documentDate = salesDocumentForm.documentDate || getCurrentTimestamp().slice(0, 10)
    const year = documentDate.slice(0, 4)
    const number = existingDocument?.kind === salesDocumentForm.kind
      ? existingDocument.number
      : `${prefix}-${year}-${String(lastNumber + 1).padStart(4, '0')}`

    const firstItem = items[0]
    const updatedDocument = {
      ...existingDocument,
      id,
      kind: salesDocumentForm.kind,
      number,
      relatedOrderId: salesDocumentForm.relatedOrderId || '',
      customerId: customer.id,
      lotNumber: salesDocumentForm.kind === 'kundenauftrag' ? salesDocumentForm.lotNumber : '',
      recipient: salesDocumentForm.recipient.trim(),
      recipientEmail: salesDocumentForm.recipientEmail.trim(),
      recipientAddress: salesDocumentForm.recipientAddress.trim(),
      items,
      productId: firstItem.productId,
      productName: firstItem.productName,
      productSku: firstItem.productSku,
      productCategory: firstItem.productCategory,
      productVolume: firstItem.productVolume,
      description: items.map((item) => `${item.description} × ${item.quantity}`).join('\n'),
      quantity: firstItem.quantity,
      unitPrice: firstItem.unitPrice,
      paymentReference: salesDocumentForm.kind === 'rechnung'
        ? existingDocument?.kind === 'rechnung' ? existingDocument.paymentReference || number : number
        : '',
      paymentMethod: salesDocumentForm.paymentMethod === 'Sonstiges' ? salesDocumentForm.customPaymentMethod.trim() || 'Sonstiges' : salesDocumentForm.paymentMethod,
      shippingMethod: salesDocumentForm.shippingMethod === 'Sonstiges' ? salesDocumentForm.customShippingMethod.trim() || 'Sonstiges' : salesDocumentForm.shippingMethod,
      responsibleName: currentUser.name,
      vatRate: Number(salesDocumentForm.vatRate),
      documentDate,
      dueDate: salesDocumentForm.dueDate,
      documentLayout: existingDocument?.documentLayout || invoiceCompanyDetails.documentLayout || 'zyro',
      companyDetailsSnapshot: existingDocument?.companyDetailsSnapshot || { ...invoiceCompanyDetails },
      notes: salesDocumentForm.notes.trim(),
      status: salesDocumentForm.status || salesDocumentStatuses[salesDocumentForm.kind][0],
    }

    const nextSalesDocuments = editingSalesDocumentId === null
      ? [updatedDocument, ...salesDocuments]
      : salesDocuments.map((entry) => entry.id === editingSalesDocumentId ? updatedDocument : entry)
    setSalesDocuments(nextSalesDocuments)
    const relatedOrder = orders.find((order) => String(order.id) === String(updatedDocument.relatedOrderId))
    const previousRelatedOrder = orders.find((order) => String(order.id) === String(existingDocument?.relatedOrderId))
    if (relatedOrder && (!existingDocument || String(existingDocument.relatedOrderId) !== String(updatedDocument.relatedOrderId) || existingDocument.status !== updatedDocument.status)) {
      setOrders((current) => current.map((order) => String(order.id) === String(relatedOrder.id)
        ? { ...order, workflowHistory: [...(order.workflowHistory || []), createWorkflowEvent(existingDocument ? 'Beleg aktualisiert' : 'Beleg erstellt', `${updatedDocument.number} · ${updatedDocument.status}`)] }
        : order))
    }
    if (previousRelatedOrder && String(previousRelatedOrder.id) !== String(updatedDocument.relatedOrderId)) {
      setOrders((current) => current.map((order) => String(order.id) === String(previousRelatedOrder.id)
        ? { ...order, workflowHistory: [...(order.workflowHistory || []), createWorkflowEvent('Belegzuordnung entfernt', updatedDocument.number)] }
        : order))
    }
    setEditingSalesDocumentId(null)
    setSalesDocumentForm({ ...initialSalesDocumentForm, documentDate: getCurrentTimestamp().slice(0, 10) })
    await closeSalesDocumentDraftPreview()
  }

  const closeSalesDocumentDraftPreview = async () => {
    const previewId = salesDocumentPreviewIdRef.current
    if (previewId === null || !window.zyroData?.closeHtmlPreview) return
    salesDocumentPreviewIdRef.current = null
    try {
      await window.zyroData.closeHtmlPreview(previewId)
    } catch (error) {
      setSalesFeedback(`Beleg gespeichert, aber die Vorschau konnte nicht geschlossen werden: ${error.message}`)
    }
  }

  const previewSalesDocumentDraft = async () => {
    const type = salesDocumentTypes[salesDocumentForm.kind]
    if (!type) {
      setSalesFeedback('Bitte wähle eine gültige Belegart aus.')
      return
    }
    const items = salesDocumentForm.items.map((line) => {
      const product = products.find((entry) => String(entry.id) === String(line.productId))
      if (!product) return null
      const productName = product.name || product.productName || ''
      const productSku = product.sku || product.productSku || ''
      const productCategory = product.category || product.productCategory || ''
      const productVolume = product.volume || product.productVolume || ''
      return {
        productId: product.id ?? product.productId,
        productName,
        productSku,
        productCategory,
        productVolume,
        description: [productName, productSku, productCategory, productVolume].filter(Boolean).join(' · '),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
      }
    })
    if (!salesDocumentForm.recipient.trim() || items.length === 0 || items.some((item) => !item || item.quantity <= 0 || item.unitPrice < 0)) {
      setSalesFeedback('Bitte Empfänger, mindestens ein Produkt sowie gültige Mengen und Preise eintragen, bevor du die Vorschau öffnest.')
      return
    }
    if (salesDocumentPreviewIdRef.current !== null && window.zyroData?.closeHtmlPreview) {
      await window.zyroData.closeHtmlPreview(salesDocumentPreviewIdRef.current)
      salesDocumentPreviewIdRef.current = null
    }
    const documentDate = salesDocumentForm.documentDate || getCurrentTimestamp().slice(0, 10)
    const existingDocument = salesDocuments.find((entry) => entry.id === editingSalesDocumentId)
    const previewDocument = {
      ...existingDocument,
      id: existingDocument?.id || 'sales-document-preview',
      kind: salesDocumentForm.kind,
      number: existingDocument?.number || `VORSCHAU-${type.prefix}-${documentDate.slice(0, 4)}-0001`,
      recipient: salesDocumentForm.recipient.trim(),
      recipientEmail: salesDocumentForm.recipientEmail.trim(),
      recipientAddress: salesDocumentForm.recipientAddress.trim(),
      items,
      paymentReference: salesDocumentForm.kind === 'rechnung' ? existingDocument?.paymentReference || 'VORSCHAU' : '',
      paymentMethod: salesDocumentForm.paymentMethod === 'Sonstiges' ? salesDocumentForm.customPaymentMethod.trim() || 'Sonstiges' : salesDocumentForm.paymentMethod,
      shippingMethod: salesDocumentForm.shippingMethod === 'Sonstiges' ? salesDocumentForm.customShippingMethod.trim() || 'Sonstiges' : salesDocumentForm.shippingMethod,
      responsibleName: currentUser?.name || 'ZYRO Team',
      vatRate: Number(salesDocumentForm.vatRate),
      documentDate,
      dueDate: salesDocumentForm.dueDate,
      documentLayout: invoiceCompanyDetails.documentLayout || 'zyro',
      companyDetailsSnapshot: { ...invoiceCompanyDetails },
      notes: salesDocumentForm.notes.trim(),
      status: salesDocumentForm.status,
    }
    setSalesFeedback('')
    try {
      await printSalesDocument(previewDocument, false, false, {
        companyDetails: invoiceCompanyDetails,
        trackAsSalesDraft: true,
      })
    } catch (error) {
      setSalesFeedback(`Vorschau konnte nicht geöffnet werden: ${error.message}`)
    }
  }

  const editSalesDocument = (salesDocument) => {
    if (salesDocument.kind === 'rechnung' && salesDocument.status !== 'Entwurf') {
      setSalesFeedback('Ausgestellte Rechnungen sind unveränderbar. Bitte einen Storno- oder Korrekturbeleg anlegen.')
      return
    }
    setEditingSalesDocumentId(salesDocument.id)
    setSalesDocumentForm({
      kind: salesDocument.kind,
      customerId: String(salesDocument.customerId ?? customerOptions.find((customer) => customer.name === salesDocument.recipient)?.id ?? ''),
      relatedOrderId: String(salesDocument.relatedOrderId ?? ''),
      lotNumber: salesDocument.lotNumber || '',
      recipient: salesDocument.recipient || '',
      recipientEmail: salesDocument.recipientEmail || '',
      recipientAddress: salesDocument.recipientAddress || '',
      items: getSalesDocumentItems(salesDocument).map((item) => ({
        productId: String(item.productId ?? ''),
        quantity: String(item.quantity ?? 1),
        unitPrice: String(item.unitPrice ?? ''),
      })),
      vatRate: String(salesDocument.vatRate ?? 19),
      documentDate: salesDocument.documentDate || initialSalesDocumentForm.documentDate,
      dueDate: salesDocument.dueDate || '',
      paymentMethod: paymentMethods.includes(salesDocument.paymentMethod) ? salesDocument.paymentMethod : salesDocument.paymentMethod ? 'Sonstiges' : initialSalesDocumentForm.paymentMethod,
      customPaymentMethod: paymentMethods.includes(salesDocument.paymentMethod) ? '' : salesDocument.paymentMethod || '',
      shippingMethod: shippingMethods.includes(salesDocument.shippingMethod) ? salesDocument.shippingMethod : salesDocument.shippingMethod ? 'Sonstiges' : initialSalesDocumentForm.shippingMethod,
      customShippingMethod: shippingMethods.includes(salesDocument.shippingMethod) ? '' : salesDocument.shippingMethod || '',
      notes: salesDocument.notes || '',
      status: salesDocument.status || salesDocumentStatuses[salesDocument.kind][0],
    })
  }

  const updateSalesDocumentStatus = async (salesDocumentId, status) => {
    const salesDocument = salesDocuments.find((entry) => String(entry.id) === String(salesDocumentId))
    if (!salesDocument || salesDocument.status === status) return

    if (salesDocument.kind === 'rechnung' && salesDocument.status === 'Entwurf' && status === 'Versendet' && window.zyroWebOrders?.sendInvoice) {
      const published = await printSalesDocument({ ...salesDocument, status }, false, true)
      if (!published) return
    }

    const updates = {
      status,
      ...(status === 'Bezahlt' && !salesDocument.paidAt
        ? { paidAt: getPaymentDate().toISOString().slice(0, 10) }
        : {}),
    }
    setSalesDocuments((current) => current.map((entry) => entry.id === salesDocumentId ? { ...entry, ...updates } : entry))
    if (salesDocument.relatedOrderId) {
      setOrders((current) => current.map((order) => String(order.id) === String(salesDocument.relatedOrderId)
        ? { ...order, workflowHistory: [...(order.workflowHistory || []), createWorkflowEvent('Belegstatus geändert', `${salesDocument.number}: ${salesDocument.status} → ${status}`)] }
        : order))
    }
  }

  const getSalesDocumentStatusOptions = (kind, status, documentId) => {
    if (kind === 'kundenauftrag') {
      return status === 'Verpackt'
        ? [...salesDocumentStatuses.kundenauftrag, 'Verpackt']
        : salesDocumentStatuses.kundenauftrag
    }
    if (kind !== 'rechnung') return salesDocumentStatuses[kind]
    const isExistingInvoice = salesDocuments.some((document) => document.id === documentId && document.kind === 'rechnung')
    if (!isExistingInvoice) return ['Entwurf']
    return {
      Entwurf: ['Entwurf', 'Versendet', 'Storniert'],
      Versendet: ['Versendet', 'Bezahlt', 'Überfällig', 'Storniert'],
      Überfällig: ['Überfällig', 'Bezahlt', 'Storniert'],
      Bezahlt: ['Bezahlt', 'Storniert'],
      Storniert: ['Storniert'],
    }[status] || [status]
  }

  const convertSalesDocument = (sourceDocument, targetKind) => {
    const existingFollowup = salesDocuments.find((entry) => entry.sourceDocumentId === sourceDocument.id && entry.kind === targetKind)
    if (existingFollowup) {
      setSalesFeedback(`Folgebeleg ${existingFollowup.number} existiert bereits.`)
      return
    }

    const documentDate = new Date().toISOString().slice(0, 10)
    const year = documentDate.slice(0, 4)
    const lastNumber = salesDocuments
      .filter((entry) => entry.kind === targetKind)
      .reduce((highest, entry) => Math.max(highest, Number(entry.number.split('-').at(-1)) || 0), 0)
    const id = Date.now()
    const followup = {
      ...sourceDocument,
      id,
      kind: targetKind,
      number: `${salesDocumentTypes[targetKind].prefix}-${year}-${String(lastNumber + 1).padStart(4, '0')}`,
      paymentReference: targetKind === 'rechnung' ? `${salesDocumentTypes[targetKind].prefix}-${year}-${String(lastNumber + 1).padStart(4, '0')}` : '',
      sourceDocumentId: sourceDocument.id,
      convertedToId: null,
      documentDate,
      dueDate: '',
      status: salesDocumentStatuses[targetKind][0],
      documentLayout: sourceDocument.documentLayout || invoiceCompanyDetails.documentLayout || 'zyro',
      companyDetailsSnapshot: sourceDocument.companyDetailsSnapshot || { ...invoiceCompanyDetails },
    }

    setSalesDocuments((current) => [followup, ...current.map((entry) => entry.id === sourceDocument.id
      ? { ...entry, convertedToId: id, status: entry.kind === 'angebot' ? 'Angenommen' : entry.status }
      : entry)])
    if (followup.relatedOrderId) {
      setOrders((current) => current.map((order) => String(order.id) === String(followup.relatedOrderId)
        ? { ...order, workflowHistory: [...(order.workflowHistory || []), createWorkflowEvent('Folgebeleg erstellt', `${followup.number} · ${salesDocumentTypes[targetKind].label}`)] }
        : order))
    }
    setSalesFeedback(`${salesDocumentTypes[targetKind].label} ${followup.number} wurde erstellt.`)
  }

  const exportBusinessData = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      company: invoiceCompanyDetails,
      customers,
      products,
      recipes,
      orders,
      salesDocuments,
      stockMovements,
      inventory,
    }
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `zyro-datensicherung-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const exportCustomerList = () => {
    const csvCell = (value) => {
      const text = String(value ?? '')
      const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safeText.replace(/"/g, '""')}"`
    }
    const rows = [
      ['Kunde', 'Anschrift', 'Rechnungen', 'Umsatz netto EUR', 'Umsatz brutto EUR'],
      ...revenueAnalytics.customers.map((customer) => [customer.name, customer.address, customer.invoiceCount, customer.net.toFixed(2), customer.gross.toFixed(2)]),
    ]
    const file = new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
    const downloadUrl = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `zyro-kunden-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const startMainHost = async () => {
    if (!window.zyroData) return

    try {
      const status = await window.zyroData.startHost()
      setNetworkStatus(status)
      setNetworkDataMessage('Haupt-PC ist gestartet. Verbinde die anderen PCs mit einer der angezeigten IP-Adressen und dem Zugangscode.')
    } catch (error) {
      setNetworkDataMessage(`Haupt-PC konnte nicht gestartet werden: ${error.message}`)
    }
  }

  const stopMainHost = async () => {
    if (!window.zyroData || !window.confirm('Netzwerkzugriff für alle verbundenen PCs beenden?')) return

    try {
      const status = await window.zyroData.stopHost()
      setNetworkStatus(status)
      setNetworkDataMessage('Der Haupt-PC wurde gestoppt. Die Daten bleiben lokal gespeichert.')
    } catch (error) {
      setNetworkDataMessage(`Haupt-PC konnte nicht gestoppt werden: ${error.message}`)
    }
  }

  const connectToHost = async (event) => {
    event.preventDefault()
    if (!window.zyroData) return

    try {
      const status = await window.zyroData.connectHost(hostAddressInput, accessCodeInput)
      setNetworkStatus(status)
      setAccessCodeInput('')
      setNetworkSettingsOpen(false)
      networkSyncReadyRef.current = false
      setNetworkInitialized(false)
      window.location.reload()
    } catch (error) {
      setNetworkDataMessage(`Verbindung fehlgeschlagen: ${error.message}`)
    }
  }

  const refreshCloudStatus = useCallback(async () => {
    try {
      setCloudStatus(await window.zyroCloud.status())
    } catch {
      setCloudStatus(null)
    }
  }, [])

  useEffect(() => {
    if (!window.zyroCloud) return undefined
    let active = true
    const poll = () => window.zyroCloud.status().then((status) => { if (active) setCloudStatus(status) }).catch(() => {})
    poll()
    const interval = window.setInterval(poll, 5000)
    return () => { active = false; window.clearInterval(interval) }
  }, [])

  const enableCloudSync = async (event) => {
    event?.preventDefault()
    if (!window.zyroCloud) return
    setCloudMessage('Verbinde mit der Cloud …')
    try {
      const result = await window.zyroCloud.enable(cloudTokenInput.trim(), authSessionToken)
      setCloudTokenInput('')
      if (result.downloaded) {
        setCloudMessage('Cloud-Daten wurden geladen. App wird neu gestartet …')
        window.location.reload()
        return
      }
      setCloudMessage('Cloud-Sync ist aktiv. Die lokalen Daten werden hochgeladen.')
      refreshCloudStatus()
    } catch (error) {
      setCloudMessage(`Cloud-Sync fehlgeschlagen: ${error.message}`)
    }
  }

  const disableCloudSync = async () => {
    if (!window.confirm('Cloud-Sync auf diesem PC beenden? Die Daten bleiben lokal erhalten.')) return
    try {
      await window.zyroCloud.disable(authSessionToken)
      setCloudMessage('Cloud-Sync wurde beendet.')
      refreshCloudStatus()
    } catch (error) {
      setCloudMessage(error.message)
    }
  }

  const syncCloudNow = async () => {
    try {
      const status = await window.zyroCloud.syncNow(authSessionToken)
      setCloudStatus((current) => ({ ...current, ...status }))
      setCloudMessage(status.lastError ? '' : 'Synchronisiert.')
    } catch (error) {
      setCloudMessage(error.message)
    }
  }

  const syncWebCloudNow = async () => {
    if (!window.zyroData?.syncNow || cloudSyncing) return
    setCloudSyncing(true)
    setNetworkDataMessage('Cloud wird aktualisiert …')
    try {
      const result = await window.zyroData.syncNow()
      setNetworkDataMessage(result.success
        ? 'Cloud wurde aktualisiert.'
        : `Cloud-Sync ausstehend: ${result.message}`)
    } catch (error) {
      setNetworkDataMessage(`Cloud-Sync fehlgeschlagen: ${error.message}`)
    } finally {
      setCloudSyncing(false)
    }
  }

  const disconnectFromHost = async () => {
    if (!window.zyroData || !window.confirm('Verbindung zum Haupt-PC trennen und diesen PC wieder lokal verwenden?')) return
    const status = await window.zyroData.disconnectHost()
    setNetworkStatus(status)
    networkSyncReadyRef.current = true
    setNetworkInitialized(true)
    setNetworkSettingsOpen(false)
    setNetworkDataMessage('Dieser PC verwendet jetzt seinen lokalen Datenspeicher.')
  }

  const importBusinessData = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const backup = JSON.parse(await file.text())
      const requiredCollections = ['customers', 'products', 'recipes', 'orders', 'salesDocuments', 'inventory']
      if (requiredCollections.some((key) => !Array.isArray(backup[key]))) {
        throw new Error('Die Datei enthält keine vollständige Zyro-Datensicherung.')
      }
      let restoredCompanyDetails = null
      if (backup.company && typeof backup.company === 'object' && !Array.isArray(backup.company)) {
        const legacyAddress = String(backup.company.city || '')
        const legacyPostalCode = legacyAddress.match(/^(\d{5})\s+(.+)$/)
        restoredCompanyDetails = {
          ...initialInvoiceCompanyDetails,
          ...backup.company,
          id: 'global',
          postalCode: backup.company.postalCode || legacyPostalCode?.[1] || initialInvoiceCompanyDetails.postalCode,
          city: legacyPostalCode && !backup.company.postalCode ? legacyPostalCode[2] : legacyAddress || initialInvoiceCompanyDetails.city,
        }
        if (!restoredCompanyDetails.name || !restoredCompanyDetails.street || !restoredCompanyDetails.postalCode || !restoredCompanyDetails.city
          || (restoredCompanyDetails.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(restoredCompanyDetails.email))) {
          throw new Error('Die Firmendaten in der Sicherung sind ungültig.')
        }
      }
      if (!window.confirm('Die lokalen Kunden, Produkte, Rezepturen, Aufträge, Belege, Firmendaten, Lagerbewegungen und Lagerdaten durch diese Sicherung ersetzen?')) return

      setCustomers(backup.customers)
      setProducts(backup.products)
      setRecipes(backup.recipes)
      setOrders(backup.orders)
      setSalesDocuments(backup.salesDocuments)
      if (restoredCompanyDetails) {
        setInvoiceCompanyDetails(restoredCompanyDetails)
        setInvoiceCompanyForm(restoredCompanyDetails)
      }
      setStockMovements(Array.isArray(backup.stockMovements) ? backup.stockMovements : [])
      setInventory(backup.inventory)
      setSalesFeedback('Datensicherung wurde importiert.')
    } catch (error) {
      setSalesFeedback(`Import fehlgeschlagen: ${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  const printPickingList = (salesDocument) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
    const lines = new Map()
    getSalesDocumentItems(salesDocument).forEach((item) => {
      const product = products.find((entry) => String(entry.id) === String(item.productId))
      const key = String(item.productId ?? item.productName ?? lines.size)
      const existing = lines.get(key)
      lines.set(key, {
        name: product?.name || item.productName || 'Produkt',
        sku: product?.sku || item.productSku || '',
        ean: String(product?.ean13 || '').replace(/\D/g, ''),
        lot: [product?.lotNumber, product?.bestBefore ? `MHD ${new Date(product.bestBefore).toLocaleDateString('de-DE')}` : ''].filter(Boolean).join(' · '),
        quantity: (existing?.quantity || 0) + Number(item.quantity || 0),
      })
    })
    const barcodeMarkup = (ean) => {
      if (!isValidEan13(ean)) return ''
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(svg, ean, { format: 'EAN13', displayValue: false, height: 36, margin: 0 })
      return svg.outerHTML
    }
    const rows = [...lines.values()].map((line) => `<tr><td class="box"></td><td>${escapeHtml(line.name)}<br><small>${escapeHtml(line.sku)}${line.lot ? ` · ${escapeHtml(line.lot)}` : ''}</small></td><td class="qty">${escapeHtml(line.quantity)}</td><td>${escapeHtml(line.ean) || '–'}<div class="bc">${barcodeMarkup(line.ean)}</div></td></tr>`).join('')
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kommissionierliste ${escapeHtml(salesDocument.number)}</title><style>
      body{font:13px Arial,sans-serif;color:#111;margin:18mm}h1{margin:0 0 4px;font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #bbb;padding:8px;text-align:left;vertical-align:middle}.qty{font-size:18px;font-weight:700;text-align:center}.box{width:22px}.box:before{content:"";display:block;width:16px;height:16px;border:2px solid #111}.bc svg{height:36px;max-width:170px}small{color:#555}
      </style></head><body><h1>Kommissionierliste</h1><div><strong>Auftrag:</strong> ${escapeHtml(salesDocument.number)} · <strong>Empfänger:</strong> ${escapeHtml(salesDocument.recipient)}</div><div><strong>Datum:</strong> ${escapeHtml(salesDocument.documentDate || '')}</div>
      <table><thead><tr><th></th><th>Artikel</th><th>Menge</th><th>EAN-13</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    window.setTimeout(() => printWindow.print(), 350)
  }

  const printSalesDocument = async (salesDocument, sendEmail = false, publishToPortal = false, previewOptions = {}) => {
    if (publishToPortal && !salesDocument.recipientEmail) {
      setSalesFeedback(`Rechnung ${salesDocument.number} kann nicht im Kundenkonto bereitgestellt werden: Es ist keine Kunden-E-Mail hinterlegt.`)
      return false
    }
    if (publishToPortal && !window.zyroWebOrders?.sendInvoice) {
      setSalesFeedback('Das Kundenkonto kann nur über die Desktop-App am Haupt-PC synchronisiert werden.')
      return false
    }

    const companyDetailsForDocument = previewOptions.companyDetails || salesDocument.companyDetailsSnapshot || invoiceCompanyDetails
    const companyForDocument = {
      ...companyDetailsForDocument,
      email: normalizeInvoiceCompanyEmailForDisplay(companyDetailsForDocument.email),
    }
    const documentLayout = salesDocument.documentLayout || companyForDocument.documentLayout || 'zyro'
    const documentLayoutClass = `layout-${documentLayout}`
    const documentLayoutStyles = documentLayout === 'modern'
      ? 'header{background:#152c3a;color:#fff;padding:22px;border:0;border-bottom:5px solid #3aa58a;border-radius:8px}.brand,.brand small,.company-address,.meta,.doc-number,.document-title h1{color:#fff}.recipient{border-left-color:#2585a0}.items thead{border-bottom-color:#2585a0}.items th{color:#195b70}.totals .gross{border-color:#2585a0}.notes{background:#eef6f7}.footer{border-color:#2585a0}'
      : documentLayout === 'classic'
        ? 'header{border-bottom:4px double #263b52}.brand{color:#263b52}.document-title h1{font-family:Georgia,serif;color:#263b52}.recipient{border-left-color:#263b52}.items thead{border-bottom-color:#263b52}.items th{color:#263b52}.totals .gross{border-color:#263b52}.terms{font-family:Georgia,serif}.notes{background:#f5f2eb}.footer{border-color:#263b52}'
        : ''
    const type = salesDocumentTypes[salesDocument.kind]
    const items = getSalesDocumentItems(salesDocument)
    const vatRate = Number(salesDocument.vatRate) || 0
    const websiteNetTotal = Number(salesDocument.websiteInvoiceTotals?.netTotal)
    const netTotal = Number.isFinite(websiteNetTotal)
      ? websiteNetTotal
      : items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
    const websiteTaxTotal = Number(salesDocument.websiteInvoiceTotals?.taxTotal)
    const taxTotal = Number.isFinite(websiteTaxTotal) ? websiteTaxTotal : netTotal * vatRate / 100
    const websiteGrossTotal = Number(salesDocument.websiteInvoiceTotals?.grossTotal)
    const grossTotal = Number.isFinite(websiteGrossTotal) ? websiteGrossTotal : netTotal + taxTotal
    const paymentReference = salesDocument.paymentReference || salesDocument.number
    const findProduct = (item) => products.find((entry) => String(entry.id) === String(item.productId)) || products.find((entry) => item.productSku && entry.sku === item.productSku)
    const depositTotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(findProduct(item)?.depositPerUnit) || 0), 0)
    const weightTotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(findProduct(item)?.weightKg) || 0), 0)
    const caseCount = items.reduce((sum, item) => {
      const perCase = Number(findProduct(item)?.bottlesPerCase) || 0
      return perCase > 0 ? sum + (Number(item.quantity) || 0) / perCase : sum
    }, 0)
    const payableTotal = grossTotal + depositTotal
    const paymentMethod = salesDocument.paymentMethod || 'Vorkasse'
    let paymentQr = ''
    if (salesDocument.kind === 'rechnung' && companyForDocument.iban && ['Vorkasse', 'Rechnung', 'Überweisung'].includes(paymentMethod)) {
      const { default: QRCode } = await import('qrcode')
      const epcPayload = [
        'BCD',
        '001',
        '1',
        'SCT',
        '',
        companyForDocument.name,
        companyForDocument.iban,
        payableTotal > 0 ? `EUR${payableTotal.toFixed(2)}` : '',
        '',
        paymentReference,
        '',
      ].join('\n')
      paymentQr = await QRCode.toString(epcPayload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 220 })
    }
    const formatCurrency = (value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)
    const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('de-DE') : 'Nicht angegeben'
    const dateLabel = salesDocument.kind === 'angebot' ? 'Gültig bis' : salesDocument.kind === 'rechnung' ? 'Fällig am' : 'Liefertermin'
    const itemRows = items.map((item, index) => {
      const quantity = Number(item.quantity) || 0
      const unitPrice = Number(item.unitPrice) || 0
      const lineNet = quantity * unitPrice
      return `<tr><td>${index + 1}</td><td>${escapeHtml(item.productSku || '')}</td><td>${escapeHtml(item.description || item.productName)}</td><td class="numeric">${formatCurrency(unitPrice)}</td><td class="numeric">${formatCurrency(lineNet)}</td><td class="numeric">${vatRate}%</td><td class="numeric">${formatCurrency(lineNet * (1 + vatRate / 100))}</td></tr>`
    }).join('')
    const companyLegalDetails = [
      companyForDocument.managingDirectors && `Geschäftsführer: ${escapeHtml(companyForDocument.managingDirectors)}`,
      companyForDocument.legalForm && `Rechtsform: ${escapeHtml(companyForDocument.legalForm)}`,
      companyForDocument.registeredOffice && `Sitz: ${escapeHtml(companyForDocument.registeredOffice)}`,
      companyForDocument.commercialRegister && `Handelsregister: ${escapeHtml(companyForDocument.commercialRegister)}`,
      companyForDocument.registrationCourt && `Registergericht: ${escapeHtml(companyForDocument.registrationCourt)}`,
    ].filter(Boolean).join('<br>')

    const invoiceHtml = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${type.label} ${escapeHtml(salesDocument.number)}</title><style>
      *{box-sizing:border-box}body{font:13px/1.45 Arial,sans-serif;color:#202628;margin:0 auto;max-width:900px;padding:28px 34px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:30px;border-bottom:3px solid #b66b3d;padding:0 0 18px;margin-bottom:24px}.brand{font-size:20px;font-weight:700;letter-spacing:2px;color:#9c562f}.brand small{display:block;color:#343a3b;font-size:10px;letter-spacing:3px}.company-address,.meta{margin:5px 0;color:#4b5354}.document-title{text-align:right;min-width:230px}h1{font-size:25px;margin:0 0 8px}.doc-number{font-weight:700;font-size:16px;color:#252b2b}.address-row{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin:24px 0}.recipient{padding:12px 14px;border-left:2px solid #b66b3d;min-height:110px}.recipient .sender{font-size:11px;text-decoration:underline;color:#555;margin:0 0 8px}.address{white-space:pre-line;margin:4px 0}.meta-box{border:1px solid #c9cece;padding:12px 14px;display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.meta-box div{display:flex;flex-direction:column}.meta-box span{font-size:11px;color:#697172}.meta-box strong{font-size:13px}.ship-line{margin:18px 0 28px;color:#424949}.items{width:100%;border-collapse:collapse;table-layout:fixed}.items th,.items td{text-align:left;padding:8px 6px;border-bottom:1px solid #d4d9d9;vertical-align:top;overflow-wrap:anywhere}.items thead{border-bottom:2px solid #343a3b}.items th{font-size:10px;color:#4f5858}.items th:nth-child(1){width:5%}.items th:nth-child(2){width:9%}.items th:nth-child(3){width:36%}.items th:nth-child(4){width:12%}.items th:nth-child(5){width:13%}.items th:nth-child(6){width:8%}.items th:nth-child(7){width:17%}.items .numeric{text-align:right;white-space:nowrap}.totals{margin:18px 0 0 auto;width:min(100%,320px)}.totals div{display:flex;justify-content:space-between;padding:4px 0}.totals .gross{font-weight:700;font-size:15px;border-top:1px solid #343a3b;margin-top:6px;padding-top:9px}.terms{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-top:25px;padding-top:14px;border-top:1px solid #d4d9d9}.terms div{display:flex;gap:8px}.terms strong{min-width:110px}.payment{display:flex;align-items:center;gap:18px;margin-top:18px;padding:12px;border:1px solid #d4d9d9;break-inside:avoid}.payment svg{width:120px;height:120px}.payment-copy{display:grid;gap:4px}.payment-copy span{overflow-wrap:anywhere}.notes{white-space:pre-line;margin-top:20px;padding:12px;background:#f2f3f2}.footer{border-top:1px solid #8b8b9e;margin-top:36px;padding-top:10px;color:#53595a;font-size:10px;display:flex;justify-content:space-between;gap:18px}.footer div{flex:1}.footer strong{display:block;color:#303536}@media print{body{margin:0 auto;padding:16mm 14mm}header,.address-row,.items tr,.terms,.footer{break-inside:avoid}}@media(max-width:600px){body{padding:18px}.address-row{grid-template-columns:1fr}.document-title{text-align:left}.footer{display:block}.footer div{margin-bottom:8px}}
      </style><style>${documentLayoutStyles}</style></head><body class="${documentLayoutClass}">
      <header><div><div class="brand">ZYRO<small>${escapeHtml(companyForDocument.name.toUpperCase())}</small></div><p class="company-address">${escapeHtml(companyForDocument.name)}<br>${escapeHtml(companyForDocument.street)}<br>${escapeHtml(companyForDocument.postalCode)} ${escapeHtml(companyForDocument.city)}<br>${escapeHtml(companyForDocument.country)}</p></div><div class="document-title"><h1>${type.label}</h1><p class="meta doc-number">${escapeHtml(salesDocument.number)}</p><p class="meta">Belegdatum: ${formatDate(salesDocument.documentDate)}</p><p class="meta">${dateLabel}: ${formatDate(salesDocument.dueDate)}</p></div></header>
      <section class="address-row"><div class="recipient"><p class="sender">${escapeHtml(companyForDocument.name)} · ${escapeHtml(companyForDocument.street)} · ${escapeHtml(companyForDocument.postalCode)} ${escapeHtml(companyForDocument.city)}</p><strong>${escapeHtml(salesDocument.recipient)}</strong><p class="address">${escapeHtml(salesDocument.recipientAddress)}</p></div><div class="meta-box"><div><span>Belegnummer</span><strong>${escapeHtml(salesDocument.number)}</strong></div><div><span>Belegdatum</span><strong>${formatDate(salesDocument.documentDate)}</strong></div><div><span>Zahlungsart</span><strong>${escapeHtml(paymentMethod)}</strong></div><div><span>Versandart</span><strong>${escapeHtml(salesDocument.shippingMethod || 'Nicht angegeben')}</strong></div><div><span>Bearbeiter</span><strong>${escapeHtml(salesDocument.responsibleName || 'Nicht angegeben')}</strong></div>${salesDocument.kind === 'kundenauftrag' && salesDocument.lotNumber ? `<div><span>Los-/Lotnummer</span><strong>${escapeHtml(salesDocument.lotNumber)}</strong></div>` : ''}</div></section>
      <p class="ship-line"><strong>Lieferanschrift:</strong> ${escapeHtml(salesDocument.recipient)} · ${escapeHtml(salesDocument.recipientAddress).replace(/\n/g, ', ')}</p>
      <table class="items"><thead><tr><th>Pos.</th><th>Art. Nr.</th><th>Bezeichnung</th><th class="numeric">E-Preis</th><th class="numeric">Gesamt netto</th><th class="numeric">MwSt.</th><th class="numeric">Gesamt brutto</th></tr></thead><tbody>${itemRows}</tbody></table>
      <div class="totals"><div><span>Gesamtpreis netto</span><span>${formatCurrency(netTotal)}</span></div><div><span>MwSt. ${vatRate}%</span><span>${formatCurrency(taxTotal)}</span></div><div class="gross"><span>Gesamtpreis brutto</span><span>${formatCurrency(grossTotal)}</span></div>${depositTotal > 0 ? `<div><span>Pfand (nicht steuerbar)</span><span>${formatCurrency(depositTotal)}</span></div><div class="gross"><span>Zahlbetrag inkl. Pfand</span><span>${formatCurrency(payableTotal)}</span></div>` : ''}${weightTotal > 0 ? `<div><span>Gesamtgewicht</span><span>${weightTotal.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg${caseCount > 0 ? ` · ca. ${Math.ceil(caseCount)} Trays` : ''}</span></div>` : ''}</div>
      ${paymentQr ? `<section class="payment"><div>${paymentQr}</div><div class="payment-copy"><strong>Überweisung</strong><span>IBAN: ${escapeHtml(companyForDocument.iban)}</span><span>Betrag: ${formatCurrency(grossTotal)}</span><span>Verwendungszweck: ${escapeHtml(paymentReference)}</span></div></section>` : ''}
      <section class="terms"><div><strong>Zahlungsart</strong><span>${escapeHtml(paymentMethod)}</span></div><div><strong>Zahlungsziel</strong><span>${salesDocument.kind === 'rechnung' ? formatDate(salesDocument.dueDate) : 'Gemäß Vereinbarung'}</span></div><div><strong>Versandart</strong><span>${escapeHtml(salesDocument.shippingMethod || 'Nicht angegeben')}</span></div><div><strong>Bearbeiter</strong><span>${escapeHtml(salesDocument.responsibleName || 'Nicht angegeben')}</span></div></section>
      ${salesDocument.notes ? `<p class="notes">${escapeHtml(salesDocument.notes)}</p>` : ''}<footer class="footer"><div><strong>${escapeHtml(companyForDocument.name)}</strong>${escapeHtml(companyForDocument.street)}<br>${escapeHtml(companyForDocument.postalCode)} ${escapeHtml(companyForDocument.city)}<br>${escapeHtml(companyForDocument.country)}${companyForDocument.email ? `<br>${escapeHtml(companyForDocument.email)}` : ''}${companyForDocument.phone ? `<br>${escapeHtml(companyForDocument.phone)}` : ''}${companyForDocument.website ? `<br>${escapeHtml(companyForDocument.website)}` : ''}</div><div><strong>Steuerangaben</strong>${companyForDocument.taxNumber ? `Steuernummer: ${escapeHtml(companyForDocument.taxNumber)}<br>` : ''}${companyForDocument.vatId ? `USt-IdNr.: ${escapeHtml(companyForDocument.vatId)}` : ''}</div><div><strong>Bankverbindung</strong>IBAN: ${escapeHtml(companyForDocument.iban)}</div>${companyLegalDetails ? `<div><strong>Geschäftsführung / Register</strong>${companyLegalDetails}</div>` : ''}</footer></body></html>`
    if (publishToPortal) {
      try {
        await window.zyroWebOrders.sendInvoice({ salesDocument, html: invoiceHtml, publishOnly: true }, authSessionToken)
        setSalesDocuments((current) => current.map((document) => document.id === salesDocument.id
          ? { ...document, portalPublishedAt: getCurrentTimestamp() }
          : document))
        setSalesFeedback(`Rechnung ${salesDocument.number} wurde ausgestellt und ist jetzt im Kundenkonto abrufbar.`)
        return true
      } catch (error) {
        setSalesFeedback(`Rechnung ${salesDocument.number} konnte nicht im Kundenkonto bereitgestellt werden: ${error.message}`)
        return false
      }
    }

    if (sendEmail) {
      if (!window.zyroWebOrders?.sendInvoice) {
        throw new Error('Der Cloud-Mailversand ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      }
      const result = await window.zyroWebOrders.sendInvoice({
        salesDocument,
        html: invoiceHtml,
      }, authSessionToken)
      if (result?.sent === false) throw new Error(result.error || 'Der Mailserver hat den Versand nicht bestätigt.')
      setSalesDocuments((current) => current.map((document) => document.id === salesDocument.id
        ? { ...document, status: 'Versendet', emailedAt: getCurrentTimestamp() }
        : document))
      setSalesFeedback(`${type.label} ${salesDocument.number} wurde an ${salesDocument.recipientEmail} versendet.`)
      await closeSalesDocumentDraftPreview()
      return true
    }

    if (window.zyroData?.openHtmlPreview) {
      const preview = await window.zyroData.openHtmlPreview(invoiceHtml, `${type.label} ${salesDocument.number || ''}`.trim())
      if (previewOptions.trackAsSalesDraft) salesDocumentPreviewIdRef.current = preview.previewId
      return true
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) throw new Error('Die Vorschau wurde vom Browser blockiert.')
    printWindow.document.write(invoiceHtml)
    printWindow.document.close()
    showPrintPreview(printWindow, {
      html: invoiceHtml,
      fileName: `${salesDocument.number || type.label}.pdf`,
      salesDocument,
      sellerDetails: companyForDocument,
    })
    if (sendEmail) printWindow.document.querySelector('[data-zyro-email-button]')?.click()
    return true
  }

  const previewSalesDocumentTemplate = (kind) => {
    if (!salesDocumentTypes[kind]) {
      setInvoiceCompanyMessage('Bitte wähle eine gültige Belegart für die Vorschau aus.')
      return
    }
    const documentDate = getCurrentTimestamp().slice(0, 10)
    const dueDate = getDateAfterDays(14)
    const previewDocument = {
      id: 'template-preview',
      kind,
      number: `VORSCHAU-${salesDocumentTypes[kind]?.prefix || 'BELEG'}-0001`,
      recipient: 'Musterkunde GmbH',
      recipientAddress: 'Musterstraße 12\n12345 Musterstadt',
      items: [{ productName: 'ZYRO Mustergetränk', productSku: 'ZYRO-001', description: 'Mustergetränk · 500 ml Dose', quantity: 24, unitPrice: 1.99 }],
      vatRate: 19,
      documentDate,
      dueDate,
      paymentMethod: 'Überweisung',
      shippingMethod: 'DPD Paket',
      responsibleName: currentUser?.name || 'ZYRO Team',
      notes: 'Dies ist eine unverbindliche Dokumentvorschau. Es wurde kein Beleg gespeichert oder versendet.',
      documentLayout: invoiceCompanyForm.documentLayout || 'zyro',
      status: 'Entwurf',
    }
    setInvoiceCompanyMessage('')
    return printSalesDocument(previewDocument, false, false, { companyDetails: invoiceCompanyForm })
      .catch((error) => {
        setInvoiceCompanyMessage(`Vorschau konnte nicht geöffnet werden: ${error.message}`)
      })
  }

  const emailSalesDocument = async (salesDocument) => {
    const label = salesDocumentTypes[salesDocument.kind]?.label || 'Beleg'
    if (sendingSalesDocumentId) return
    if (!salesDocument.recipientEmail) {
      setSalesFeedback(`Für ${label} ${salesDocument.number} ist keine Kunden-E-Mail hinterlegt. Bitte über „Bearbeiten“ ergänzen.`)
      return
    }
    if (!window.zyroWebOrders?.sendInvoice) {
      setSalesFeedback('E-Mail-Versand ist nur in der Desktop-App am Haupt-PC verfügbar.')
      return
    }
    if (!window.confirm(`${label} ${salesDocument.number} per E-Mail an ${salesDocument.recipientEmail} senden?`)) return
    setSendingSalesDocumentId(String(salesDocument.id))
    setSalesFeedback('')
    try {
      await printSalesDocument(salesDocument, true)
    } catch (error) {
      setSalesFeedback(`${label} ${salesDocument.number} konnte nicht an ${salesDocument.recipientEmail} gesendet werden: ${error.message}`)
    } finally {
      setSendingSalesDocumentId('')
    }
  }

  const getInventoryStatus = (stock, ideal) => {
    if (stock >= ideal) return 'Gut'
    if (stock >= ideal * 0.7) return 'Warnung'
    return 'Nachbestellen'
  }

  const addInventoryItem = (event) => {
    event.preventDefault()
    if (!inventoryForm.item.trim()) return

    const normalizedItem = {
      item: inventoryForm.item.trim(),
      stock: Number(inventoryForm.stock) || 0,
      ideal: Number(inventoryForm.ideal) || 0,
      status: getInventoryStatus(Number(inventoryForm.stock) || 0, Number(inventoryForm.ideal) || 0),
    }

    if (editingInventoryItem) {
      setInventory((current) =>
        current.map((entry) =>
          entry.item === editingInventoryItem ? { ...entry, ...normalizedItem } : entry,
        ),
      )
      setEditingInventoryItem(null)
    } else {
      setInventory((current) => [normalizedItem, ...current])
    }

    setInventoryForm(initialInventoryForm)
  }

  const editInventoryItem = (item) => {
    setEditingInventoryItem(item.item)
    setInventoryForm({
      item: item.item,
      stock: String(item.stock),
      ideal: String(item.ideal),
      status: item.status,
    })
  }

  const removeInventoryItem = (itemName) => {
    const item = inventory.find((entry) => entry.item === itemName)
    if (requiresDeleteApproval) {
      if (item) createDeleteRequest('lager', item.item, item.item)
      return
    }
    setInventory((current) => current.filter((item) => item.item !== itemName))
    if (editingInventoryItem === itemName) {
      setEditingInventoryItem(null)
      setInventoryForm(initialInventoryForm)
    }
    setExpandedInventoryItem((current) => (current === itemName ? null : current))
  }

  const toggleInventoryMenu = (itemName) => {
    setExpandedInventoryItem((current) => (current === itemName ? null : itemName))
  }

  const restockItem = (itemName) => {
    setInventory((current) =>
      current.map((item) => {
        if (item.item !== itemName) return item
        const nextStock = Math.min(item.stock + 15, 100)
        return { ...item, stock: nextStock, status: getInventoryStatus(nextStock, item.ideal) }
      }),
    )
  }

  const findMdeProduct = (barcode) => {
    const normalizedBarcode = String(barcode || '').trim().toLocaleLowerCase()
    if (!normalizedBarcode) return { product: null, error: 'Bitte einen Barcode scannen.' }
    const matches = products.filter((product) => [
      product.sku,
      product.ean13,
      product.bottleLabel?.ean13,
    ].some((value) => String(value || '').trim().toLocaleLowerCase() === normalizedBarcode))
    if (matches.length > 1) return { product: null, error: 'Der Barcode ist mehreren Produkten zugeordnet.' }
    return matches.length
      ? { product: matches[0], error: '' }
      : { product: null, error: `Kein Produkt mit Barcode „${barcode}“ gefunden. Bitte SKU oder EAN hinterlegen.` }
  }

  const receiveMdeStock = async (event) => {
    event.preventDefault()
    const { product, error } = findMdeProduct(mdeReceipt.barcode)
    const quantity = Number(mdeReceipt.quantity)
    if (error) {
      setMdeMessage(error)
      return
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) {
      setMdeMessage('Die Eingangsmenge muss eine ganze Zahl zwischen 1 und 1.000.000 sein.')
      return
    }
    if (!window.zyroMde?.receiveStock) {
      setMdeMessage('Cloud-Warenzugang ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.receiveStock({
        productId: product.id,
        quantity,
        note: mdeReceipt.note.trim(),
        lot: mdePreparedCharge?.lotNumber || mdeReceipt.lot.trim(),
        bestBefore: mdeReceipt.bestBefore,
      }, authSessionToken)
      setProducts(result.products)
      setStockMovements(result.stockMovements)
      setMdeReceipt(initialMdeReceipt)
      setMdeMessage(`${quantity.toLocaleString('de-DE')} × ${product.name} wurde eingelagert.`)
      mdeScanInputRef.current?.focus({ preventScroll: true })
    } catch (receiveError) {
      setMdeMessage(`Wareneingang nicht gebucht: ${receiveError.message}`)
    } finally {
      setMdeBusy(false)
    }
  }

  const scanMdeOrder = (event) => {
    event.preventDefault()
    const code = mdeOrderScan.trim().toLocaleLowerCase()
    const match = mdeOpenOrders.find((document) =>
      [document.number, document.id].some((value) => String(value || '').toLocaleLowerCase() === code),
    )
    if (!match) {
      setMdeMessage('Kein offener Kundenauftrag mit dieser Auftragsnummer gefunden.')
      return
    }
    setMdeOrderId(String(match.id))
    setMdeScannedQuantities({})
    setMdeOrderScan('')
    setMdeMessage(`Auftrag ${match.number} geladen. Vor dem Scannen muss er angenommen werden.`)
  }

  const acceptMdeOrderOnDevice = async () => {
    if (!mdeSelectedOrder || !window.zyroMde?.acceptOrder) {
      setMdeMessage('Cloud-Auftragsannahme ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.acceptOrder(mdeSelectedOrder.id, authSessionToken)
      setSalesDocuments(result.salesDocuments)
      setMdeScannedQuantities({})
      setMdeMessage(`Auftrag ${mdeSelectedOrder.number} wurde angenommen. Jetzt die Artikel scannen.`)
    } catch (acceptError) {
      setMdeMessage(`Auftrag konnte nicht angenommen werden: ${acceptError.message}`)
    } finally {
      setMdeBusy(false)
      mdeScanInputRef.current?.focus({ preventScroll: true })
    }
  }

  const scanMdeProduct = async (event) => {
    event.preventDefault()
    if (!mdeSelectedOrder || mdeSelectedOrder.status !== 'Kommissionierung'
      || String(mdeSelectedOrder.pickingUserId) !== String(currentUser?.id)) {
      setMdeMessage('Nimm den Auftrag zuerst an. Nur der zuständige Mitarbeiter kann Artikel scannen.')
      return
    }
    const barcode = mdeProductScan.trim()
    if (!barcode) {
      setMdeMessage('Bitte einen Produktbarcode scannen.')
      return
    }
    if (!window.zyroMde?.scanProduct) {
      setMdeMessage('Cloud-Barcodeprüfung ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.scanProduct(mdeSelectedOrder.id, barcode, authSessionToken)
      setSalesDocuments(result.salesDocuments)
      setMdeProductScan('')
      setMdeMessage(`${result.productName} gescannt: ${result.scannedQuantity} von ${result.requiredQuantity}.`)
    } catch (scanError) {
      setMdeMessage(`Artikel konnte nicht gescannt werden: ${scanError.message}`)
    } finally {
      setMdeBusy(false)
      mdeScanInputRef.current?.focus({ preventScroll: true })
    }
  }

  const completeMdePacking = async () => {
    if (!mdeSelectedOrder) return
    const nativePrintAvailable = Boolean(window.zyroScanner?.printLabel)
    const labelWindow = nativePrintAvailable ? null : window.open('', '_blank', 'width=820,height=640')
    if (!nativePrintAvailable && !labelWindow) {
      setMdeMessage('Der Etikettendruck wurde vom Browser blockiert. Bitte Pop-ups für diese App erlauben und erneut versuchen.')
      return
    }
    const incompleteLine = mdeOrderLines.find((line) => line.scanned !== line.required)
    if (incompleteLine) {
      labelWindow?.close()
      setMdeMessage(`Auftrag unvollständig: ${incompleteLine.name} (${incompleteLine.scanned} von ${incompleteLine.required}).`)
      return
    }
    const missingStock = mdeOrderLines.find((line) =>
      !Number.isSafeInteger(line.available) || line.available < line.required,
    )
    if (missingStock) {
      labelWindow?.close()
      setMdeMessage(`Bestand für ${missingStock.name} fehlt oder reicht nicht. Bitte zuerst Wareneingang erfassen.`)
      return
    }
    if (!window.zyroMde?.packOrder) {
      labelWindow?.close()
      setMdeMessage('Cloud-Kommissionierung ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.packOrder({
        orderId: mdeSelectedOrder.id,
      }, authSessionToken)
      setProducts(result.products)
      setSalesDocuments(result.salesDocuments)
      setStockMovements(result.stockMovements)
      printMdeShippingLabel(labelWindow, mdeSelectedOrder)
      setMdeScannedQuantities({})
      setMdeOrderId('')
      const invoiceText = result.invoiceNumber
        ? result.invoiceEmailSent
          ? ` Rechnung ${result.invoiceNumber} erstellt, im Kundenkonto bereitgestellt und per E-Mail gesendet.`
          : ` Rechnung ${result.invoiceNumber} erstellt, aber nicht zugestellt: ${result.invoiceError || 'Unbekannter Fehler'}`
        : result.invoiceError ? ` Rechnung konnte nicht erstellt werden: ${result.invoiceError}` : ''
      setMdeMessage(result.emailSent
        ? `Auftrag ${mdeSelectedOrder.number} verpackt. Kunden-E-Mail wurde gesendet.${invoiceText}`
        : `Auftrag ${mdeSelectedOrder.number} verpackt, aber die Kunden-E-Mail konnte nicht gesendet werden: ${result.emailError || 'Unbekannter Mailfehler'}.${invoiceText}`)
    } catch (packingError) {
      labelWindow?.close()
      setMdeMessage(`Verpackungsabschluss fehlgeschlagen: ${packingError.message}`)
    } finally {
      setMdeBusy(false)
    }
  }

  const printMdeShippingLabel = (labelWindow, salesDocument, shipment = salesDocument) => {
      const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character])
      const address = salesDocument.shippingAddress || salesDocument.recipientAddress || ''
      const tracking = shipment.trackingNumber ? `<p><strong>Sendungsnummer:</strong> ${escapeHtml(shipment.trackingNumber)}</p>` : ''
      const carrier = shipment.carrier === 'Spedition'
        ? shipment.carrierName || 'Spedition'
        : shipment.carrier || 'Versand'
      const orderCode = String(salesDocument.number || salesDocument.id)
      const barcodeElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      if (/^[\x20-\x7e]{1,80}$/.test(orderCode)) {
        try {
          JsBarcode(barcodeElement, orderCode, { format: 'CODE128', displayValue: false, height: 42, margin: 0 })
        } catch {
          barcodeElement.innerHTML = ''
        }
      }
      const barcodeMarkup = barcodeElement.outerHTML
      const labelHtml = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Versandetikett ${escapeHtml(salesDocument.number)}</title><style>
        @page{size:100mm 150mm;margin:5mm}*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#111;margin:0}.label{width:90mm;min-height:140mm;border:1px solid #222;padding:7mm;display:flex;flex-direction:column;gap:8px}.brand{font-size:22px;font-weight:800;letter-spacing:2px}.notice{font-size:9px;color:#555;border-bottom:1px solid #bbb;padding-bottom:6px}.recipient{font-size:19px;font-weight:700;white-space:pre-line;line-height:1.4}.meta{margin-top:auto;border-top:1px solid #bbb;padding-top:8px}.code{font-size:24px;font-weight:700;letter-spacing:1px}.barcode{width:100%;height:42px}.foot{font-size:9px;color:#555}
        </style></head><body><main class="label"><div class="brand">ZYRO</div><div class="notice">INTERNES VERSANDETIKETT · KEIN FRANKIERLABEL</div><div><strong>Empfänger</strong><p class="recipient">${escapeHtml(salesDocument.recipient)}<br>${escapeHtml(address)}</p></div><div class="meta"><p><strong>Auftrag:</strong> ${escapeHtml(salesDocument.number)}</p><p><strong>Versand:</strong> ${escapeHtml(carrier)}</p>${tracking}<div class="code">${escapeHtml(orderCode)}</div><div class="barcode">${barcodeMarkup}</div><div class="foot">Etikett zur internen Zuordnung und Adressierung.</div></div></main></body></html>`
      if (window.zyroScanner?.printLabel) {
        try {
          window.zyroScanner.printLabel(labelHtml)
        } catch (printError) {
          setMdeMessage(`Etikett konnte nicht gedruckt werden: ${printError.message}`)
        }
        labelWindow?.close()
        return
      }
      if (!labelWindow) return
      labelWindow.document.open()
      labelWindow.document.write(labelHtml)
      labelWindow.document.close()
      window.setTimeout(() => labelWindow.print(), 350)
    }

  const printMdeDeliveryNote = async (salesDocument) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setMdeMessage('Der Lieferschein konnte nicht geöffnet werden. Bitte Pop-ups für diese App erlauben.')
      return
    }
    try {
      const { default: QRCode } = await import('qrcode')
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character])
      const orderCode = String(salesDocument.number || salesDocument.id)
      const qrMarkup = await QRCode.toString(orderCode, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 150 })
      const items = getSalesDocumentItems(salesDocument)
      const rows = items.map((item, index) => `
        <tr><td>${index + 1}</td><td>${escapeHtml(item.productSku || '')}</td>
        <td>${escapeHtml(item.description || item.productName || 'Artikel')}</td>
        <td class="quantity">${Number(item.quantity) || 0}</td></tr>`).join('')
      const company = invoiceCompanyDetails
      const recipientAddress = salesDocument.shippingAddress || salesDocument.recipientAddress || ''
      const note = salesDocument.deliveryNote || salesDocument.notes || ''
      const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Lieferschein ${escapeHtml(orderCode)}</title><style>
        *{box-sizing:border-box}body{font:13px/1.5 Arial,sans-serif;color:#202628;margin:0 auto;max-width:210mm;padding:18mm}
        header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #b66b3d;padding-bottom:14px}
        h1{font-size:27px;margin:0 0 7px}.brand{font-size:20px;font-weight:800;letter-spacing:2px;color:#9c562f}
        .seller,.meta,.muted{color:#59615f;font-size:11px}.recipient{margin:24px 0;padding:14px;border-left:3px solid #b66b3d;background:#f7f7f3;white-space:pre-line}
        .recipient strong{display:block;margin-bottom:7px}.order-meta{display:flex;gap:26px;margin:16px 0}
        table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #d5d9d4}
        th{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#59615f;border-bottom:2px solid #343a3b}
        .quantity{text-align:right;font-size:16px;font-weight:700;width:100px}.qr{display:flex;align-items:center;gap:12px;margin-top:28px;padding-top:14px;border-top:1px solid #d5d9d4}
        .qr svg{width:92px;height:92px}.qr-code{font-weight:700}.note{margin-top:24px;padding:12px;background:#f7f7f3;white-space:pre-line}
        footer{margin-top:36px;border-top:1px solid #aaa;padding-top:8px;color:#59615f;font-size:10px}
        @media print{body{padding:10mm;max-width:none}tr,header,.recipient,.qr{break-inside:avoid}}
        </style></head><body>
        <header><div><div class="brand">ZYRO</div><p class="seller">${escapeHtml(company.name)}<br>${escapeHtml(company.street)}<br>${escapeHtml(company.postalCode)} ${escapeHtml(company.city)}<br>${escapeHtml(company.email || '')}</p></div>
        <div><h1>Lieferschein</h1><div><strong>Auftragsnummer:</strong> ${escapeHtml(orderCode)}</div><div><strong>Datum:</strong> ${escapeHtml(salesDocument.documentDate || new Date().toISOString().slice(0, 10))}</div></div></header>
        <section class="recipient"><strong>Lieferadresse</strong>${escapeHtml(salesDocument.recipient)}${salesDocument.recipientPhone ? `<br>${escapeHtml(salesDocument.recipientPhone)}` : ''}<br>${escapeHtml(recipientAddress)}</section>
        <div class="order-meta"><span><strong>Versandart:</strong> ${escapeHtml(salesDocument.shippingMethod || 'Nicht angegeben')}</span><span><strong>Bearbeiter:</strong> ${escapeHtml(salesDocument.responsibleName || 'ZYRO')}</span></div>
        <table><thead><tr><th>Pos.</th><th>Artikelnummer</th><th>Artikel</th><th class="quantity">Menge</th></tr></thead><tbody>${rows}</tbody></table>
        ${note ? `<div class="note"><strong>Hinweis</strong><br>${escapeHtml(note)}</div>` : ''}
        <div class="qr">${qrMarkup}<div><div class="qr-code">${escapeHtml(orderCode)}</div><div class="muted">QR-Code zur schnellen Auftragszuordnung in der Desktop-App</div></div></div>
        <footer>${escapeHtml(company.name)} · ${escapeHtml(company.street)} · ${escapeHtml(company.postalCode)} ${escapeHtml(company.city)}</footer>
        </body></html>`
      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      window.setTimeout(() => printWindow.print(), 350)
    } catch (error) {
      printWindow.close()
      setMdeMessage(`Lieferschein konnte nicht erstellt werden: ${error.message}`)
    }
  }

  const getShipmentDraft = (salesDocument) => mdeShipmentDrafts[salesDocument.id] || {
      carrier: salesDocument.carrier === 'Spedition' ? 'Spedition' : 'DPD',
      carrierName: salesDocument.carrierName || '',
      trackingNumber: salesDocument.trackingNumber || '',
      trackingUrl: salesDocument.trackingUrl || '',
    }

  const updateMdeShipmentDraft = (salesDocument, field, value) => {
      setMdeShipmentDrafts((current) => ({
        ...current,
        [salesDocument.id]: { ...getShipmentDraft(salesDocument), [field]: value },
      }))
    }

  const saveMdeShipment = async (salesDocument) => {
      if (!window.zyroMde?.updateShipment) {
        setMdeMessage('Cloud-Versandverwaltung ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
        return
      }
      setMdeBusy(true)
      setMdeMessage('')
      try {
        const result = await window.zyroMde.updateShipment({
          orderId: salesDocument.id,
          ...getShipmentDraft(salesDocument),
        }, authSessionToken)
        setSalesDocuments(result.salesDocuments)
        setMdeMessage(result.emailSent
          ? `Auftrag ${salesDocument.number} wurde versendet. Die Kundin/der Kunde hat den Tracking-Link per E-Mail erhalten.`
          : `Auftrag ${salesDocument.number} wurde versendet. Die Versand-E-Mail konnte nicht gesendet werden: ${result.emailError || 'Unbekannter Mailfehler'}`)
      } catch (shipmentError) {
        setMdeMessage(`Versanddaten konnten nicht gespeichert werden: ${shipmentError.message}`)
      } finally {
        setMdeBusy(false)
      }
    }

  const getShipmentTrackingUrl = (salesDocument) => {
      if (salesDocument.trackingUrl) return salesDocument.trackingUrl
      if (salesDocument.carrier === 'DPD' && salesDocument.trackingNumber) {
        return `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(salesDocument.trackingNumber)}`
      }
      return ''
    }

  const shipmentActions = {
    getTrackingUrl: getShipmentTrackingUrl,
    saveShipment: saveMdeShipment,
    updateDraft: updateMdeShipmentDraft,
  }

  const retryShipmentNotification = async (salesDocument) => {
    if (!window.zyroMde?.notifyShipment) {
      setMdeMessage('Cloud-Mailversand ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.notifyShipment(salesDocument.id, authSessionToken)
      if (Array.isArray(result.salesDocuments)) setSalesDocuments(result.salesDocuments)
      setMdeMessage(result.emailSent
        ? `Versand-E-Mail für Auftrag ${salesDocument.number} wurde gesendet.`
        : `Versand-E-Mail konnte nicht gesendet werden: ${result.emailError || 'Unbekannter Mailfehler'}`)
    } catch (mailError) {
      setMdeMessage(`Versand-E-Mail konnte nicht gesendet werden: ${mailError.message}`)
    } finally {
      setMdeBusy(false)
    }
  }

  const confirmShipmentDelivery = async (salesDocument) => {
    if (!window.zyroMde?.confirmDelivery) {
      setMdeMessage('Die Cloud-Zustellbestätigung ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    if (!window.confirm(`Wurde die Sendung ${salesDocument.number} tatsächlich zugestellt? Danach erhält der Kunde die Bewertungs-E-Mail.`)) return
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.confirmDelivery(salesDocument.id, authSessionToken)
      if (Array.isArray(result.salesDocuments)) setSalesDocuments(result.salesDocuments)
      setMdeMessage(result.reviewEmailSent
        ? `Zustellung bestätigt. Bewertungs-E-Mail für Auftrag ${salesDocument.number} wurde gesendet.`
        : `Zustellung bestätigt, aber die Bewertungs-E-Mail konnte nicht gesendet werden: ${result.reviewEmailError || 'Bitte SMTP-Einstellungen prüfen.'}`)
    } catch (error) {
      setMdeMessage(`Zustellung konnte nicht bestätigt werden: ${error.message}`)
    } finally {
      setMdeBusy(false)
    }
  }

  const retryReviewRequest = async (salesDocument) => {
    if (!window.zyroMde?.requestReview) {
      setMdeMessage('Der Bewertungs-Mailversand ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.requestReview(salesDocument.id, authSessionToken)
      if (Array.isArray(result.salesDocuments)) setSalesDocuments(result.salesDocuments)
      setMdeMessage(result.reviewEmailSent
        ? `Bewertungs-E-Mail für Auftrag ${salesDocument.number} wurde erneut gesendet.`
        : `Bewertungs-E-Mail konnte nicht gesendet werden: ${result.reviewEmailError || 'Unbekannter Mailfehler'}`)
    } catch (error) {
      setMdeMessage(`Bewertungs-E-Mail konnte nicht gesendet werden: ${error.message}`)
    } finally {
      setMdeBusy(false)
    }
  }

  const retryPackedNotification = async (salesDocument) => {
    if (!window.zyroMde?.notifyPacked) {
      setMdeMessage('Cloud-Mailversand ist nicht verfügbar. Bitte Verbindung und Anmeldung prüfen.')
      return
    }
    setMdeBusy(true)
    setMdeMessage('')
    try {
      const result = await window.zyroMde.notifyPacked(salesDocument.id, authSessionToken)
      if (Array.isArray(result.salesDocuments)) setSalesDocuments(result.salesDocuments)
      setMdeMessage(`Kunden-E-Mail für Auftrag ${salesDocument.number} wurde gesendet.`)
    } catch (mailError) {
      setMdeMessage(`E-Mail konnte nicht gesendet werden: ${mailError.message}`)
    } finally {
      setMdeBusy(false)
    }
  }

  const removeRecipe = (recipeId) => {
    const recipe = recipes.find((entry) => entry.id === recipeId)
    if (requiresDeleteApproval) {
      if (recipe) createDeleteRequest('rezeptur', recipe.id, recipe.name)
      return
    }
    setRecipes((current) => current.filter((recipe) => recipe.id !== recipeId))
    if (editingRecipeId === recipeId) {
      setEditingRecipeId(null)
      setRecipeForm(initialRecipeForm)
    }
  }

  const removeOrder = (orderId) => {
    const order = orders.find((entry) => entry.id === orderId)
    if (requiresDeleteApproval) {
      if (order) createDeleteRequest('auftrag', order.id, `${order.lotNumber} · ${order.product}`)
      return
    }
    setOrders((current) => current.filter((order) => order.id !== orderId))
    if (editingOrderId === orderId) {
      setEditingOrderId(null)
      setOrderForm(initialOrderForm)
    }
  }

  const removeSalesDocument = (documentId) => {
    const salesDocument = salesDocuments.find((entry) => String(entry.id) === String(documentId))
    if (!salesDocument) return
    if (salesDocument.kind === 'rechnung' && salesDocument.status !== 'Entwurf' && currentUser?.role !== 'admin') {
      setSalesFeedback(`Rechnung ${salesDocument.number} wurde bereits ausgestellt. Nur ein Admin darf sie löschen.`)
      return
    }
    if (requiresDeleteApproval) {
      createDeleteRequest('verkaufsbeleg', salesDocument.id, `${salesDocument.number} · ${salesDocumentTypes[salesDocument.kind]?.label || 'Beleg'}`)
      return
    }
    setSalesDocuments((current) => current.filter((entry) => String(entry.id) !== String(documentId)))
    if (editingSalesDocumentId === documentId) {
      setEditingSalesDocumentId(null)
      setSalesDocumentForm(initialSalesDocumentForm)
    }
  }

  const handleFinanceReceiptFiles = (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    const currentEntry = financeEntries.find((entry) => entry.id === editingFinanceEntryId)
    const availableSlots = 5 - (currentEntry?.receiptAttachments?.length || 0)
    if (files.length > availableSlots) {
      setFinanceMessage(`Pro Buchung sind höchstens fünf Belege zulässig. Noch freie Plätze: ${availableSlots}.`)
      return
    }
    const invalidFile = files.find((file) => !['application/pdf', 'image/jpeg', 'image/png'].includes(financeReceiptType(file))
      || file.size < 1 || file.size > 10 * 1024 * 1024)
    if (invalidFile) {
      setFinanceMessage('Erlaubt sind PDF-, JPG- und PNG-Dateien mit maximal 10 MB je Datei.')
      return
    }
    setFinanceReceiptFiles(files)
    setFinanceEntryForm((current) => ({ ...current, receiptAvailable: files.length > 0 || current.receiptAvailable }))
    setFinanceMessage('')
  }

  const prepareInvoiceFinanceEntry = (invoice) => {
    if (financeEntries.some((entry) => String(entry.sourceDocumentId || '') === String(invoice.id))) {
      setFinanceMessage(`Rechnung ${invoice.number} wurde bereits in die Finanzbuchhaltung übernommen.`)
      setActiveTab('finanzen')
      return
    }
    try {
      const entry = createSalesInvoiceFinanceEntry(invoice, {
        id: crypto.randomUUID(),
        paidAt: invoice.paidAt || '',
      })
      setEditingFinanceEntryId('')
      setFinanceReceiptFiles([])
      setFinanceEntryForm({
        ...createFinanceEntryForm(),
        ...entry,
        grossAmount: (entry.grossCents / 100).toFixed(2),
      })
      setFinanceMessage(invoice.paidAt
        ? 'Rechnungsdaten übernommen. Bitte Buchung und Zahlungsdatum prüfen und Beleg ergänzen.'
        : 'Rechnungsdaten übernommen. Bitte das tatsächliche Zahlungsdatum ergänzen und Buchung prüfen.')
      setActiveTab('finanzen')
    } catch (error) {
      setFinanceMessage(`Rechnung konnte nicht vorbereitet werden: ${error.message}`)
      setActiveTab('finanzen')
    }
  }

  const saveSupplier = (event) => {
    event.preventDefault()
    const name = supplierForm.name.trim()
    if (!name) {
      setPurchaseMessage('Bitte einen Lieferantennamen eingeben.')
      return
    }
    const supplier = {
      ...supplierForm,
      id: editingSupplierId || crypto.randomUUID(),
      name,
      street: supplierForm.street.trim(),
      postalCode: supplierForm.postalCode.trim(),
      city: supplierForm.city.trim(),
      country: supplierForm.country.trim(),
      email: supplierForm.email.trim(),
      phone: supplierForm.phone.trim(),
      taxId: supplierForm.taxId.trim(),
    }
    setSuppliers((current) => editingSupplierId
      ? current.map((entry) => entry.id === editingSupplierId ? supplier : entry)
      : [supplier, ...current])
    setPurchaseOrderForm((current) => ({ ...current, supplierId: current.supplierId || supplier.id }))
    setEditingSupplierId('')
    setSupplierForm({ name: '', street: '', postalCode: '', city: '', country: 'Deutschland', email: '', phone: '', taxId: '' })
    setPurchaseMessage(editingSupplierId ? 'Lieferant aktualisiert.' : 'Lieferant gespeichert.')
  }

  const createPurchaseOrder = (event) => {
    event.preventDefault()
    const supplier = suppliers.find((entry) => entry.id === purchaseOrderForm.supplierId)
    if (!supplier) {
      setPurchaseMessage('Bitte einen gespeicherten Lieferanten auswählen.')
      return
    }
    const lines = purchaseOrderForm.lines.map((line) => {
      const product = products.find((entry) => String(entry.id) === String(line.productId))
      const quantity = Number(line.quantity)
      const unitCostCents = Math.round(Number(line.unitCost) * 100)
      if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000
        || !Number.isSafeInteger(unitCostCents) || unitCostCents < 1 || unitCostCents > 100_000_000_000) {
        return null
      }
      return {
        id: crypto.randomUUID(),
        productId: String(product.id),
        productName: String(product.name || product.productName || 'Produkt').slice(0, 160),
        sku: String(product.sku || '').slice(0, 80),
        quantity,
        unitCostCents,
        receivedQuantity: 0,
      }
    })
    if (!lines.length || lines.some((line) => !line)) {
      setPurchaseMessage('Bitte für jede Einkaufsposition ein Produkt, eine Menge und einen gültigen Nettopreis eingeben.')
      return
    }
    const year = new Date().getFullYear()
    const lastNumber = purchaseOrders
      .filter((entry) => entry.number?.startsWith(`EK-${year}-`))
      .reduce((highest, entry) => Math.max(highest, Number(entry.number.split('-').at(-1)) || 0), 0)
    const order = {
      id: crypto.randomUUID(),
      number: `EK-${year}-${String(lastNumber + 1).padStart(4, '0')}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: purchaseOrderForm.expectedDate,
      status: 'ordered',
      vatRate: Number(purchaseOrderForm.vatRate),
      invoiceNumber: purchaseOrderForm.invoiceNumber.trim(),
      invoiceDate: purchaseOrderForm.invoiceDate,
      dueDate: purchaseOrderForm.dueDate,
      paidAt: purchaseOrderForm.paidAt,
      note: purchaseOrderForm.note.trim(),
      lines,
      receipts: [],
    }
    setPurchaseOrders((current) => [order, ...current])
    setPurchaseOrderForm({
      supplierId: supplier.id,
      expectedDate: '',
      vatRate: '19',
      invoiceNumber: '',
      invoiceDate: '',
      dueDate: '',
      paidAt: '',
      note: '',
      lines: [{ productId: '', quantity: '1', unitCost: '' }],
    })
    setPurchaseMessage(`Einkaufsauftrag ${order.number} angelegt.`)
  }

  const updatePurchaseInvoice = (orderId, field, value) => {
    if (financeEntries.some((entry) => String(entry.sourcePurchaseOrderId || '') === String(orderId))) {
      setPurchaseMessage('Die Eingangsrechnung wurde bereits gebucht und kann hier nicht mehr geändert werden.')
      return
    }
    setPurchaseOrders((current) => current.map((order) => order.id === orderId ? { ...order, [field]: value } : order))
  }

  const receivePurchaseOrder = async (order) => {
    const draft = purchaseReceiptDrafts[order.id] || {}
    const items = order.lines.map((line) => {
      const quantity = Number(draft[line.id]?.quantity || 0)
      return quantity > 0 ? {
        lineId: line.id,
        quantity,
        lot: String(draft[line.id]?.lot || '').trim(),
        bestBefore: String(draft[line.id]?.bestBefore || ''),
      } : null
    }).filter(Boolean)
    if (!items.length) {
      setPurchaseMessage('Bitte mindestens eine positive Wareneingangsmenge eintragen.')
      return
    }
    if (!window.zyroMde?.receivePurchaseOrder) {
      setPurchaseMessage('Der sichere Cloud-Wareneingang ist nicht verfügbar. Bitte Verbindung prüfen.')
      return
    }
    setPurchaseBusyId(order.id)
    setPurchaseMessage('')
    try {
      const result = await window.zyroMde.receivePurchaseOrder({
        orderId: order.id,
        receiptId: crypto.randomUUID(),
        note: `Einkaufsauftrag ${order.number}`,
        items,
      }, authSessionToken)
      sharedSyncSkipRef.current.add('zyro-purchase-orders')
      sharedSyncSkipRef.current.add('zyro-products')
      sharedSyncSkipRef.current.add('zyro-stock-movements')
      setPurchaseOrders((current) => current.map((entry) => entry.id === order.id ? result.order : entry))
      if (result.alreadyProcessed) {
        setPurchaseMessage(`Wareneingang ${order.number} war bereits gebucht; Bestand wurde nicht doppelt erhöht.`)
      } else {
        setPurchaseMessage(`Wareneingang für ${order.number} gebucht. Status: ${result.order.status === 'received' ? 'vollständig geliefert' : 'Teillieferung'}.`)
      }
      setProducts(result.products)
      setStockMovements(result.stockMovements)
      setPurchaseReceiptDrafts((current) => ({ ...current, [order.id]: {} }))
    } catch (error) {
      setPurchaseMessage(`Wareneingang konnte nicht gebucht werden: ${error.message}`)
    } finally {
      setPurchaseBusyId('')
    }
  }

  const preparePurchaseFinanceEntry = (order) => {
    if (financeEntries.some((entry) => String(entry.sourcePurchaseOrderId || '') === String(order.id))) {
      setPurchaseMessage(`Eingangsrechnung von ${order.supplierName} wurde bereits übernommen.`)
      setActiveTab('finanzen')
      return
    }
    try {
      const entry = createPurchaseFinanceEntry(order, { id: crypto.randomUUID(), paidAt: order.paidAt || '' })
      setEditingFinanceEntryId('')
      setFinanceReceiptFiles([])
      setFinanceEntryForm({
        ...createFinanceEntryForm(),
        ...entry,
        grossAmount: (entry.grossCents / 100).toFixed(2),
      })
      setFinanceMessage('Eingangsrechnung übernommen. Bitte Zahlungsstatus, Kontierung und Beleg prüfen und vor dem Speichern Belegdatei ergänzen.')
      setActiveTab('finanzen')
    } catch (error) {
      setPurchaseMessage(`Eingangsrechnung konnte nicht vorbereitet werden: ${error.message}`)
    }
  }

  const saveFinanceEntry = async (event) => {
    event.preventDefault()
    if (!canManageFinance(currentUser)) {
      setFinanceMessage('Für Finanzbuchungen brauchst du eine Admin- oder Finanzen-Berechtigung.')
      return
    }
    const grossAmount = Number(financeEntryForm.grossAmount)
    const categoryOptions = financeCategories[financeEntryForm.type]
    if (!financeEntryForm.date || !financeEntryForm.description.trim()
      || !Number.isFinite(grossAmount) || grossAmount <= 0
      || !categoryOptions?.includes(financeEntryForm.category)) {
      setFinanceMessage('Bitte Datum, Beschreibung, Kategorie und einen gültigen Betrag eingeben.')
      return
    }
    if (financeEntryForm.sourceDocumentId && !financeEntryForm.paidAt) {
      setFinanceMessage('Bitte das tatsächliche Zahlungsdatum der verknüpften Rechnung eintragen.')
      return
    }
    const sourcePurchaseEntry = financeEntries.find((entry) => entry.id === editingFinanceEntryId)
    if (financeEntryForm.sourcePurchaseOrderId
      && !sourcePurchaseEntry?.receiptAttachments?.length && financeReceiptFiles.length === 0) {
      setFinanceMessage('Bitte den Eingangsrechnungsbeleg hochladen, bevor die Einkaufsrechnung gebucht wird.')
      return
    }
    if (financeEntryForm.accountNumber && !/^\d{4,6}$/.test(financeEntryForm.accountNumber)) {
      setFinanceMessage('Das Sachkonto muss 4 bis 6 Ziffern haben.')
      return
    }
    const grossCents = Math.round(grossAmount * 100)
    if (!Number.isSafeInteger(grossCents) || grossCents < 1 || grossCents > 100_000_000_000) {
      setFinanceMessage('Der Betrag liegt außerhalb des zulässigen Bereichs.')
      return
    }
    const existingEntry = financeEntries.find((item) => item.id === editingFinanceEntryId)
    if ((existingEntry?.receiptAttachments?.length || 0) + financeReceiptFiles.length > 5) {
      setFinanceMessage('Pro Buchung sind höchstens fünf Belege zulässig.')
      return
    }
    if (financeReceiptFiles.length > 0 && !window.zyroFinanceReceipts) {
      setFinanceMessage('Der Cloud-Belegspeicher ist nicht verfügbar. Bitte aktualisiere die App.')
      return
    }
    const entry = {
      id: editingFinanceEntryId || crypto.randomUUID(),
      type: financeEntryForm.type,
      category: financeEntryForm.category,
      date: financeEntryForm.date,
      paidAt: financeEntryForm.paidAt,
      description: financeEntryForm.description.trim(),
      counterparty: financeEntryForm.counterparty.trim(),
      documentNumber: financeEntryForm.documentNumber.trim(),
      accountNumber: financeEntryForm.accountNumber.trim(),
      sourceDocumentId: financeEntryForm.sourceDocumentId,
      sourcePurchaseOrderId: financeEntryForm.sourcePurchaseOrderId,
      grossCents,
      vatRate: Number(financeEntryForm.vatRate),
      receiptAvailable: financeEntryForm.receiptAvailable || financeReceiptFiles.length > 0,
      receiptAttachments: existingEntry?.receiptAttachments || [],
    }
    if (entry.sourcePurchaseOrderId && entry.receiptAttachments.length === 0) {
      setFinanceEntrySaving(true)
      const uploadedReceipts = []
      try {
        for (const file of financeReceiptFiles) {
          const bytes = new Uint8Array(await file.arrayBuffer())
          const result = await window.zyroFinanceReceipts.upload(
            entry.id,
            file.name,
            financeReceiptType(file),
            bytes,
            authSessionToken,
          )
          uploadedReceipts.push(result.receipt)
        }
        if (uploadedReceipts.length === 0) throw new Error('Der Eingangsrechnungsbeleg wurde nicht hochgeladen.')
        const entryWithReceipt = {
          ...entry,
          receiptAvailable: true,
          receiptAttachments: uploadedReceipts,
        }
        setFinanceEntries((current) => editingFinanceEntryId
          ? current.map((item) => item.id === editingFinanceEntryId ? entryWithReceipt : item)
          : [entryWithReceipt, ...current])
        setEditingFinanceEntryId('')
        setFinanceEntryForm(createFinanceEntryForm())
        setFinanceReceiptFiles([])
        setFinanceMessage(`Buchung gespeichert und ${uploadedReceipts.length} Beleg(e) in der Cloud abgelegt.`)
      } catch (error) {
        const cleanupErrors = []
        for (const receipt of uploadedReceipts) {
          try {
            await window.zyroFinanceReceipts.delete(entry.id, receipt.id, authSessionToken)
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError.message)
          }
        }
        setFinanceMessage(cleanupErrors.length > 0
          ? `Eingangsrechnung wurde nicht gespeichert. Beleg-Aufräumen fehlgeschlagen: ${cleanupErrors.join('; ')}`
          : `Eingangsrechnung wurde nicht gespeichert: ${error.message}`)
      } finally {
        setFinanceEntrySaving(false)
      }
      return
    }
    setFinanceEntries((current) => editingFinanceEntryId
      ? current.map((item) => item.id === editingFinanceEntryId ? entry : item)
      : [entry, ...current])
    setFinanceMessage(editingFinanceEntryId ? 'Finanzbuchung aktualisiert.' : 'Finanzbuchung erfasst.')
    setFinanceEntrySaving(true)
    const uploadedReceipts = []
    let uploadFailure = null
    for (const file of financeReceiptFiles) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const result = await window.zyroFinanceReceipts.upload(
          entry.id,
          file.name,
          financeReceiptType(file),
          bytes,
          authSessionToken,
        )
        uploadedReceipts.push(result.receipt)
      } catch (error) {
        uploadFailure = error
        break
      }
    }
    if (uploadedReceipts.length > 0) {
      const updatedEntry = {
        ...entry,
        receiptAvailable: true,
        receiptAttachments: [...entry.receiptAttachments, ...uploadedReceipts],
      }
      setFinanceEntries((current) => current.map((item) => item.id === entry.id ? updatedEntry : item))
    }
    setFinanceEntrySaving(false)
    if (uploadFailure) {
      setEditingFinanceEntryId(entry.id)
      setFinanceReceiptFiles(financeReceiptFiles.slice(uploadedReceipts.length))
      setFinanceMessage(`Buchung gespeichert, aber Beleg-Upload fehlgeschlagen: ${uploadFailure.message}`)
      return
    }
    setEditingFinanceEntryId('')
    setFinanceEntryForm(createFinanceEntryForm())
    setFinanceReceiptFiles([])
    setFinanceMessage(uploadedReceipts.length > 0
      ? `Buchung gespeichert und ${uploadedReceipts.length} Beleg(e) in der Cloud abgelegt.`
      : editingFinanceEntryId ? 'Finanzbuchung aktualisiert.' : 'Finanzbuchung erfasst.')
  }

  const editFinanceEntry = (entry) => {
    setEditingFinanceEntryId(entry.id)
    setFinanceReceiptFiles([])
    setFinanceEntryForm({
      type: entry.type,
      category: entry.category,
      date: entry.date,
      paidAt: entry.paidAt || '',
      description: entry.description,
      counterparty: entry.counterparty,
      documentNumber: entry.documentNumber,
      accountNumber: entry.accountNumber || '',
      sourceDocumentId: entry.sourceDocumentId || '',
      sourcePurchaseOrderId: entry.sourcePurchaseOrderId || '',
      grossAmount: (entry.grossCents / 100).toFixed(2),
      vatRate: String(entry.vatRate),
      receiptAvailable: entry.receiptAvailable,
    })
    setFinanceMessage('')
  }

  const downloadFinanceReceipt = async (entry, attachment) => {
    try {
      const result = await window.zyroFinanceReceipts.get(entry.id, attachment.id, authSessionToken)
      const blob = new Blob([result.data], { type: result.receipt.contentType })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.receipt.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      setFinanceMessage(`Beleg konnte nicht geladen werden: ${error.message}`)
    }
  }

  const deleteFinanceEntry = async (entry) => {
    if (currentUser?.role !== 'admin') {
      setFinanceMessage('Nur ein Admin darf Finanzbuchungen löschen.')
      return
    }
    if (!window.confirm(`Finanzbuchung „${entry.description}“ wirklich löschen?`)) return
    const deletedReceiptIds = []
    for (const attachment of entry.receiptAttachments || []) {
      try {
        await window.zyroFinanceReceipts.delete(entry.id, attachment.id, authSessionToken)
        deletedReceiptIds.push(attachment.id)
      } catch (error) {
        if (deletedReceiptIds.length > 0) {
          setFinanceEntries((current) => current.map((item) => item.id === entry.id
            ? { ...item, receiptAttachments: item.receiptAttachments.filter((file) => !deletedReceiptIds.includes(file.id)) }
            : item))
        }
        setFinanceMessage(`Beleg konnte nicht vollständig aus der Cloud gelöscht werden: ${error.message}`)
        return
      }
    }
    setFinanceEntries((current) => current.filter((item) => item.id !== entry.id))
    if (editingFinanceEntryId === entry.id) {
      setEditingFinanceEntryId('')
      setFinanceEntryForm(createFinanceEntryForm())
    }
    setFinanceMessage('Finanzbuchung gelöscht.')
  }

  const exportFinanceCsv = () => {
    const csvCell = (value) => {
      const text = String(value ?? '')
      const safeText = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
      return `"${safeText.replaceAll('"', '""')}"`
    }
    const euro = (cents) => (cents / 100).toFixed(2).replace('.', ',')
    const rows = [
      ['Finanzübersicht', financeMonth],
      ['Hinweis', 'Vereinfachte Vorschau; keine amtliche UStVA oder zertifizierte BWA'],
      [],
      ['Kennzahl', 'Betrag EUR'],
      ['Einnahmen netto (Zahlungsdatum)', euro(financeReport.incomeNetCents)],
      ['Ausgaben netto (Zahlungsdatum)', euro(financeReport.expenseNetCents)],
      ['Betriebsergebnis vereinfacht', euro(financeReport.operatingResultCents)],
      ['Umsatzsteuer auf Zahlungseingänge', euro(financeReport.outputVatCents)],
      ['Vorsteuer laut Belegen', euro(financeReport.inputVatCents)],
      ['UStVA-Vorschau (Zahllast / Erstattung)', euro(financeReport.vatDueCents)],
      [],
      ['Bereich', 'Kategorie', 'Netto EUR', 'Brutto EUR'],
      ...financeReport.categories.map((item) => [
        item.type === 'income' ? 'Einnahme' : 'Ausgabe',
        item.category,
        euro(item.netCents),
        euro(item.grossCents),
      ]),
      [],
      ['Art', 'Belegdatum', 'Zahlungsdatum', 'Kategorie', 'Beschreibung', 'Partner', 'Belegnummer', 'Brutto EUR', 'Steuersatz %', 'Beleg vorhanden'],
      ...financeEntries
        .filter((entry) => entry.date?.startsWith(`${financeMonth}-`) || entry.paidAt?.startsWith(`${financeMonth}-`))
        .map((entry) => [
          entry.type === 'income' ? 'Einnahme' : 'Ausgabe',
          entry.date,
          entry.paidAt,
          entry.category,
          entry.description,
          entry.counterparty,
          entry.documentNumber,
          euro(entry.grossCents),
          entry.vatRate,
          entry.receiptAvailable ? 'Ja' : 'Nein',
        ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `Finanzuebersicht-${financeMonth}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setFinanceMessage('CSV-Export wurde erstellt.')
  }

  const exportDatevPreparation = () => {
    try {
      const csv = buildDatevPreparationCsv(financeEntries, financeMonth)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `DATEV-Vorbereitung-${financeMonth}.csv`
      link.click()
      URL.revokeObjectURL(url)
      setFinanceMessage('DATEV-Übergabe-CSV erstellt. Vor einem Import bitte Konten, Steuerbehandlung und DATEV-Zuordnung mit dem Steuerbüro abstimmen.')
    } catch (error) {
      setFinanceMessage(error.message)
    }
  }

  const printFinanceReport = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setFinanceMessage('Druckansicht wurde vom Browser blockiert. Bitte Pop-ups für diese App erlauben.')
      return
    }
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
    const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`
    const categoryRows = financeReport.categories.map((item) => (
      `<tr><td>${item.type === 'income' ? 'Einnahme' : 'Ausgabe'}</td><td>${escapeHtml(item.category)}</td><td>${euro(item.netCents)}</td><td>${euro(item.grossCents)}</td></tr>`
    )).join('')
    printWindow.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Finanzübersicht ${escapeHtml(financeMonth)}</title><style>body{font:14px Arial,sans-serif;margin:32px;color:#17202a}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ccd2d8;padding:8px;text-align:left}th{background:#f1f4f6}.note{padding:12px;background:#fff4d6}</style></head><body><h1>Finanzübersicht ${escapeHtml(financeMonth)}</h1><p class="note">Vereinfachte Vorschau auf Ist-Basis. Keine amtliche UStVA und keine zertifizierte BWA. Umsatzsteuererklärung bitte im Mein-ELSTER-Portal prüfen und einreichen.</p><h2>Monatsübersicht</h2><table><tbody><tr><th>Einnahmen netto</th><td>${euro(financeReport.incomeNetCents)}</td></tr><tr><th>Ausgaben netto</th><td>${euro(financeReport.expenseNetCents)}</td></tr><tr><th>Betriebsergebnis vereinfacht</th><td>${euro(financeReport.operatingResultCents)}</td></tr><tr><th>Umsatzsteuer auf Zahlungseingänge</th><td>${euro(financeReport.outputVatCents)}</td></tr><tr><th>Vorsteuer laut Belegen</th><td>${euro(financeReport.inputVatCents)}</td></tr><tr><th>UStVA-Vorschau (Zahllast / Erstattung)</th><td>${euro(financeReport.vatDueCents)}</td></tr></tbody></table><h2>Aufteilung nach Kategorie</h2><table><thead><tr><th>Art</th><th>Kategorie</th><th>Netto</th><th>Brutto</th></tr></thead><tbody>${categoryRows || '<tr><td colspan="4">Keine Buchungen im ausgewählten Zeitraum.</td></tr>'}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
    printWindow.document.close()
    setFinanceMessage('Druckansicht geöffnet.')
  }

  const printElsterPreview = () => {
    if (currentUser?.role !== 'admin') {
      setFinanceMessage('Die ELSTER-Vorschau ist nur für Admins verfügbar.')
      return
    }
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setFinanceMessage('Druckansicht wurde vom Browser blockiert. Bitte Pop-ups für diese App erlauben.')
      return
    }
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character])
    const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`
    const period = `${elsterPreview.startMonth} bis ${elsterPreview.endMonth}`
    const salesRows = elsterPreview.vatSales.map((item) => (
      `<tr><td>${item.vatRate} %</td><td>${euro(item.netCents)}</td><td>${euro(item.vatCents)}</td></tr>`
    )).join('')
    printWindow.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>UStVA-Übermittlungsvorschau ${escapeHtml(period)}</title><style>body{font:14px Arial,sans-serif;margin:32px;color:#17202a}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ccd2d8;padding:8px;text-align:left}th{background:#f1f4f6}.note{padding:12px;background:#fff4d6}</style></head><body><h1>UStVA-Übermittlungsvorschau</h1><p>Zeitraum: ${escapeHtml(period)}</p><p>Unternehmen: ${escapeHtml(elsterSetup.businessName || 'Nicht eingetragen')}<br>Steuernummer: ${escapeHtml(elsterSetup.taxNumber || 'Nicht eingetragen')}<br>Finanzamt: ${escapeHtml(elsterSetup.taxOffice || 'Nicht eingetragen')}<br>Bundesland: ${escapeHtml(elsterSetup.federalState || 'Nicht eingetragen')}</p><div class="note">Unverbindliche Vorschau aus den erfassten Finanzbuchungen. Dies ist kein amtlicher ELSTER-Datensatz und es wird nichts übermittelt. Werte und Belege bitte prüfen und anschließend manuell in Mein ELSTER eintragen.</div><h2>Umsätze und Umsatzsteuer</h2><table><thead><tr><th>Steuersatz</th><th>Bemessungsgrundlage netto</th><th>Umsatzsteuer</th></tr></thead><tbody>${salesRows}</tbody></table><h2>Voraussichtliche Zusammenfassung</h2><table><tbody><tr><th>Umsatzsteuer</th><td>${euro(elsterPreview.outputVatCents)}</td></tr><tr><th>Abziehbare Vorsteuer laut Belegen</th><td>${euro(elsterPreview.inputVatCents)}</td></tr><tr><th>Voraussichtliche Zahllast / Erstattung</th><td>${euro(elsterPreview.vatDueCents)}</td></tr></tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
    printWindow.document.close()
    setFinanceMessage('ELSTER-Vorschau zur Kontrolle und zum Drucken geöffnet. Es wurde nichts übermittelt.')
  }

  const saveElsterSetup = async (event) => {
    event.preventDefault()
    if (!window.zyroData || currentUser?.role !== 'admin') {
      setElsterSetupMessage('ELSTER-Einstellungen dürfen nur von einem Admin gespeichert werden.')
      return
    }
    setElsterSetupSaving(true)
    setElsterSetupMessage('')
    try {
      const savedSetup = { ...initialElsterSetup, ...elsterSetup }
      const result = await window.zyroData.set('zyro-elster-setup', [elsterSetupEntry(savedSetup)], authSessionToken)
      if (result?.success === false) throw new Error(result.message || 'Speichern fehlgeschlagen.')
      setElsterSetup(savedSetup)
      setElsterSetupMessage(networkStatus.mode === 'client'
        ? 'ELSTER-Vorbereitungsdaten auf dem Haupt-PC gespeichert. Der Haupt-PC synchronisiert sie mit der Cloud.'
        : networkStatus.cloudEnabled
          ? 'ELSTER-Vorbereitungsdaten gespeichert und werden mit der Cloud synchronisiert.'
          : 'ELSTER-Vorbereitungsdaten lokal gespeichert. Aktiviere den Cloud-Sync unter Netzwerk einrichten.')
    } catch (error) {
      setElsterSetupMessage(`Speichern fehlgeschlagen: ${error.message}`)
    } finally {
      setElsterSetupSaving(false)
    }
  }

  const moderateProductReview = async (review, decision) => {
    if (!window.zyroMde?.moderateProductReview || currentUser?.role !== 'admin') {
      setReviewModerationMessage('Bewertungen dürfen nur von einem Admin freigegeben werden.')
      return
    }
    setReviewModerationBusyId(review.id)
    setReviewModerationMessage('')
    try {
      await window.zyroMde.moderateProductReview(review.id, decision, authSessionToken)
      setProductReviews((current) => current.filter((entry) => entry.id !== review.id))
      setReviewModerationMessage(decision === 'approve' ? 'Bewertung freigegeben und im Shop veröffentlicht.' : 'Bewertung abgelehnt.')
    } catch (error) {
      setReviewModerationMessage(`Bewertung konnte nicht geprüft werden: ${error.message}`)
    } finally {
      setReviewModerationBusyId('')
    }
  }

  const saveInvoiceCompanyDetails = async (event) => {
    event.preventDefault()
    if (!window.zyroData || currentUser?.role !== 'admin') {
      setInvoiceCompanyMessage('Firmendaten dürfen nur von einem Admin gespeichert werden.')
      return
    }
    const details = Object.fromEntries([
      ['id', 'global'],
      ...allInvoiceCompanyFields.map(({ name }) => [name, String(invoiceCompanyForm[name] || '').trim()]),
    ])
    if (invoiceCompanyFields.some(({ name, required }) => required && !details[name])) {
      setInvoiceCompanyMessage('Bitte Firmenname und vollständige Firmenanschrift eintragen.')
      return
    }
    if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
      setInvoiceCompanyMessage('Bitte eine gültige Firmen-E-Mail-Adresse eintragen.')
      return
    }
    const iban = details.iban.replace(/\s/g, '').toUpperCase()
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
      setInvoiceCompanyMessage('Bitte eine gültige IBAN eintragen.')
      return
    }
    details.iban = iban
    setInvoiceCompanySaving(true)
    setInvoiceCompanyMessage('')
    try {
      const result = await window.zyroData.set('zyro-company-details', [details], authSessionToken)
      if (result?.success === false) throw new Error(result.message || 'Speichern fehlgeschlagen.')
      setInvoiceCompanyDetails(details)
      setInvoiceCompanyForm(details)
      setInvoiceCompanyMessage(networkStatus.mode === 'client'
        ? 'Firmendaten gespeichert. Der Haupt-PC synchronisiert sie mit der Cloud.'
        : networkStatus.cloudEnabled
          ? 'Firmendaten gespeichert und mit der Cloud synchronisiert. Neue Rechnungen verwenden die Angaben automatisch.'
          : 'Firmendaten lokal gespeichert. Aktiviere den Cloud-Sync, damit Webshop-Rechnungen dieselben Angaben verwenden.')
    } catch (error) {
      setInvoiceCompanyMessage(`Speichern fehlgeschlagen: ${error.message}`)
    } finally {
      setInvoiceCompanySaving(false)
    }
  }

  const saveBottlerDetails = async (event) => {
    event.preventDefault()
    if (!window.zyroData || currentUser?.role !== 'admin') {
      setBottlerMessage('Lohnabfüller-Daten dürfen nur von einem Admin gespeichert werden.')
      return
    }
    const details = {
      id: 'global',
      name: bottlerForm.name.trim(),
      street: bottlerForm.street.trim(),
      city: bottlerForm.city.trim(),
    }
    if (!details.name || !details.street || !details.city) {
      setBottlerMessage('Bitte Name, Straße und PLZ/Ort des Lohnabfüllers eintragen.')
      return
    }
    if (details.name.length > 120 || details.street.length > 180 || details.city.length > 100) {
      setBottlerMessage('Bitte die Eingaben auf die erlaubte Feldlänge kürzen.')
      return
    }
    setBottlerSaving(true)
    setBottlerMessage('')
    try {
      const entries = [details]
      const result = await window.zyroData.set('zyro-bottler-details', entries, authSessionToken)
      if (!result?.success) throw new Error(result?.message || 'Speichern fehlgeschlagen.')
      sharedSyncSkipRef.current.add('zyro-bottler-details')
      setBottlerDetails(details)
      setBottlerForm(details)
      setBottlerMessage(networkStatus.mode === 'client'
        ? 'Lohnabfüller gespeichert. Der Haupt-PC synchronisiert die Angaben mit der Cloud.'
        : networkStatus.cloudEnabled
          ? 'Lohnabfüller gespeichert und wird mit der Cloud synchronisiert.'
          : 'Lohnabfüller lokal gespeichert. Aktiviere den Cloud-Sync, damit alle Geräte dieselben Angaben verwenden.')
    } catch (error) {
      setBottlerMessage(`Speichern fehlgeschlagen: ${error.message}`)
    } finally {
      setBottlerSaving(false)
    }
  }

  const openReportEditor = (report = null) => {
    setEditingReportId(report?.id || '')
    setReportDraft(report ? { ...createReportDraft(currentUser?.name), ...report } : createReportDraft(currentUser?.name))
    setReportFeedback('')
  }

  const saveReport = (event) => {
    event.preventDefault()
    const title = reportDraft?.title.trim()
    if (!title) {
      setReportFeedback('Bitte gib dem Bericht einen Titel.')
      return
    }
    if (!reportDraft.content.trim()) {
      setReportFeedback('Bitte füge den Berichtstext hinzu.')
      return
    }
    const timestamp = new Date().toISOString()
    const report = {
      ...reportDraft,
      title,
      summary: reportDraft.summary.trim(),
      product: reportDraft.product.trim(),
      batchNumber: reportDraft.batchNumber.trim(),
      author: reportDraft.author.trim() || currentUser?.name || 'Unbekannt',
      updatedAt: timestamp,
      createdAt: editingReportId
        ? reports.find((entry) => String(entry.id) === String(editingReportId))?.createdAt || timestamp
        : timestamp,
      id: editingReportId || crypto.randomUUID(),
    }
    setReports((current) => editingReportId
      ? current.map((entry) => String(entry.id) === String(editingReportId) ? report : entry)
      : [report, ...current])
    setReportFeedback('')
    setReportDraft(null)
    setEditingReportId('')
  }

  const openMachinebauEditor = (type = 'projekt', record = null) => {
    setEditingMachinebauId(record?.id || '')
    setMachinebauDraft(record
      ? { ...createMachinebauDraft(record.type), ...record }
      : createMachinebauDraft(type))
    setMachinebauMessage('')
  }

  const saveMachinebauRecord = (event) => {
    event.preventDefault()
    try {
      const record = createMachinebauRecord(machinebauDraft, machinebauRecords, currentUser?.name, editingMachinebauId)
      setMachinebauRecords((current) => editingMachinebauId
        ? current.map((entry) => String(entry.id) === String(editingMachinebauId) ? record : entry)
        : [record, ...current])
      setMachinebauTypeFilter(record.type)
      setMachinebauDraft(null)
      setEditingMachinebauId('')
      setMachinebauMessage('')
    } catch (error) {
      setMachinebauMessage(error.message)
    }
  }

  const unlockHrSvStorage = async (event) => {
    event.preventDefault()
    setHrSvBusy(true)
    setHrSvMessage('')
    try {
      if (currentUser?.role !== 'admin') throw new Error('Nur Admins dürfen geschützte Mitarbeiterdaten entsperren.')
      if (hrSensitiveRecords.length === 0) {
        if (hrSvUnlockDraft.length < 12 || hrSvUnlockDraft.length > 256) {
          throw new Error('Lege ein Schutzpasswort mit 12 bis 256 Zeichen fest.')
        }
        if (hrSvUnlockDraft !== hrSvConfirmDraft) throw new Error('Die Schutzpasswörter stimmen nicht überein.')
        setHrEmployees([])
        setHrSvNumbers({})
        setHrSvPassphrase(hrSvUnlockDraft)
        setHrSvUnlockDraft('')
        setHrSvConfirmDraft('')
        setHrSvMessage('Schutzspeicher vorbereitet. Neue Mitarbeiter und SV-Nummern werden verschlüsselt gespeichert.')
      } else {
        if (hrSensitiveRecords.length !== 1) throw new Error('Der verschlüsselte HR-Speicher hat ein ungültiges Format.')
        const decrypted = await decryptHrSensitiveData(hrSensitiveRecords[0], hrSvUnlockDraft)
        setHrEmployees(decrypted.employees)
        setHrSvNumbers(decrypted.svNumbers)
        setHrSvPassphrase(hrSvUnlockDraft)
        setHrSvUnlockDraft('')
        setHrSvMessage('Geschützter HR-Speicher entsperrt.')
      }
      setHrEmployeeDraft(null)
      setEditingHrEmployeeId('')
    } catch (error) {
      setHrSvMessage(error.message)
    } finally {
      setHrSvBusy(false)
    }
  }

  const saveHrEmployee = async (event) => {
    event.preventDefault()
    setHrSvBusy(true)
    setHrSvMessage('')
    try {
      if (currentUser?.role !== 'admin') throw new Error('Nur Admins dürfen geschützte Mitarbeiterdaten verwalten.')
      if (!hrSvPassphrase) throw new Error('Entsperre zuerst den HR-Schutzspeicher.')
      const employee = createHrEmployee(hrEmployeeDraft, hrEmployees, editingHrEmployeeId)
      const employees = editingHrEmployeeId
        ? hrEmployees.map((entry) => String(entry.id) === String(editingHrEmployeeId) ? employee : entry)
        : [employee, ...hrEmployees]
      const svNumbers = { ...hrSvNumbers }
      const svNumber = String(hrEmployeeDraft.socialSecurityNumber || '').trim()
      if (svNumber) svNumbers[employee.id] = normalizeSocialSecurityNumber(svNumber)
      else delete svNumbers[employee.id]
      const records = [await encryptHrSensitiveData({ employees, svNumbers }, hrSvPassphrase)]
      const result = await window.zyroData?.set('zyro-hr-sensitive', records, authSessionToken)
      if (!result?.success) throw new Error(result?.message || 'Mitarbeiterdaten konnten nicht verschlüsselt gespeichert werden.')
      sharedSyncSkipRef.current.add('zyro-hr-sensitive')
      setHrSensitiveRecords(records)
      setHrEmployees(employees)
      setHrSvNumbers(svNumbers)
      setHrEmployeeDraft(null)
      setEditingHrEmployeeId('')
      setHrSvMessage(svNumber ? 'Mitarbeiterdaten und SV-Nummer verschlüsselt gespeichert.' : 'Mitarbeiterdaten verschlüsselt gespeichert.')
    } catch (error) {
      setHrSvMessage(error.message)
    } finally {
      setHrSvBusy(false)
    }
  }

  const openHrEmployeeEditor = (employee = null) => {
    setEditingHrEmployeeId(employee?.id || '')
    setHrEmployeeDraft(employee
      ? { ...employee, socialSecurityNumber: hrSvNumbers[employee.id] || '' }
      : { name: '', reference: '', department: '', position: '', startDate: '', status: 'Aktiv', socialSecurityNumber: '' })
    setHrSvMessage('')
  }

  const removeHrEmployee = async (employee) => {
    if (currentUser?.role !== 'admin' || !hrSvPassphrase) {
      setHrSvMessage('Entsperre den HR-Schutzspeicher als Admin, um Mitarbeiter zu entfernen.')
      return
    }
    if (!window.confirm(`Mitarbeiter „${employee.name}“ und die zugehörigen verschlüsselten Personaldaten entfernen?`)) return
    setHrSvBusy(true)
    setHrSvMessage('')
    try {
      const employees = hrEmployees.filter((entry) => String(entry.id) !== String(employee.id))
      const svNumbers = { ...hrSvNumbers }
      delete svNumbers[employee.id]
      const records = [await encryptHrSensitiveData({ employees, svNumbers }, hrSvPassphrase)]
      const result = await window.zyroData?.set('zyro-hr-sensitive', records, authSessionToken)
      if (!result?.success) throw new Error(result?.message || 'Mitarbeiterdaten konnten nicht gelöscht werden.')
      sharedSyncSkipRef.current.add('zyro-hr-sensitive')
      setHrSensitiveRecords(records)
      setHrEmployees(employees)
      setHrSvNumbers(svNumbers)
      if (String(editingHrEmployeeId) === String(employee.id)) {
        setHrEmployeeDraft(null)
        setEditingHrEmployeeId('')
      }
      setHrSvMessage('Mitarbeiterdaten und zugehörige SV-Nummer wurden entfernt.')
    } catch (error) {
      setHrSvMessage(error.message)
    } finally {
      setHrSvBusy(false)
    }
  }

  const removeMachinebauRecord = (record, approved = false) => {
    if (requiresDeleteApproval && !approved) {
      createDeleteRequest('maschinenbau', record.id, record.title)
      return true
    }
    if (!approved && !window.confirm(`„${record.title}“ wirklich löschen?`)) return false
    setMachinebauRecords((current) => current
      .filter((entry) => String(entry.id) !== String(record.id))
      .map((entry) => ({
        ...entry,
        ...(record.type === 'projekt' && String(entry.projectId) === String(record.id) ? { projectId: '' } : {}),
        ...(record.type === 'anlage' && String(entry.assetId) === String(record.id) ? { assetId: '' } : {}),
      })))
    return true
  }

  const draftMachinebauAiReport = async () => {
    if (!machinebauDraft) return
    setMachinebauAiLoading(true)
    setMachinebauMessage('')
    try {
      const linkedProject = machinebauRecords.find((record) => record.type === 'projekt' && String(record.id) === String(machinebauDraft.projectId))
      const linkedAsset = machinebauRecords.find((record) => record.type === 'anlage' && String(record.id) === String(machinebauDraft.assetId))
      const report = await generateMachinebauReport(machinebauDraft, {
        project: linkedProject?.title || '',
        asset: linkedAsset?.title || '',
      })
      setMachinebauDraft((current) => current ? {
        ...current,
        type: 'bericht',
        title: report.title,
        summary: report.summary,
        details: report.content,
        status: 'Entwurf',
      } : current)
      setEditingMachinebauId('')
    } catch (error) {
      setMachinebauMessage(`KI-Bericht konnte nicht erstellt werden: ${error.message}`)
    } finally {
      setMachinebauAiLoading(false)
    }
  }

  const removeReport = (report, approved = false) => {
    if (requiresDeleteApproval && !approved) {
      createDeleteRequest('bericht', report.id, report.title || 'Bericht')
      return
    }
    if (!approved && !window.confirm(`Bericht „${report.title || 'Unbenannter Bericht'}“ löschen?`)) return
    setReports((current) => current.filter((entry) => String(entry.id) !== String(report.id)))
  }

  const formatReportContent = (prefix, suffix = '') => {
    const textarea = reportContentRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = reportDraft.content.slice(start, end)
    const replacement = `${prefix}${selectedText || (suffix ? 'Text' : '')}${suffix}`
    const content = `${reportDraft.content.slice(0, start)}${replacement}${reportDraft.content.slice(end)}`
    setReportDraft((current) => ({ ...current, content }))
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selectedText || (suffix ? 'Text' : '')).length)
    })
  }

  const removeArchivedLabReport = (scope, parentId, report) => {
    const targetId = `${scope}:${parentId}:${report.id}`
    if (requiresDeleteApproval) {
      createDeleteRequest('laborbericht', targetId, report.name, { scope, parentId, reportId: report.id })
      return
    }
    const updateReports = (records) => records.map((record) => String(record.id) === String(parentId)
      ? { ...record, labReports: (record.labReports || []).filter((entry) => String(entry.id) !== String(report.id)) }
      : record)
    if (scope === 'produkt') setProducts(updateReports(products))
    if (scope === 'rezeptur') setRecipes(updateReports(recipes))
  }

  const removeUser = async (userId) => {
    if (requiresDeleteApproval) {
      const user = users.find((entry) => String(entry.id) === String(userId))
      if (user) createDeleteRequest('benutzer', user.id, user.name)
      return
    }
    try {
      setUsers(await window.zyroAuth.removeUser(userId, authSessionToken))
    } catch (error) {
      setActivationMessage(error.message)
    }
  }

  const resolveDeleteRequest = async (request, approved) => {
    if (currentUser?.role !== 'admin' || request.status !== 'offen') return
    if (networkStatus.mode === 'client') {
      setNetworkDataMessage('Löschanfragen können nur am Haupt-PC freigegeben werden.')
      return
    }
    try {
      if (approved) {
        if (request.type === 'produkt') removeProduct(request.targetId)
        if (request.type === 'rezeptur') removeRecipe(request.targetId)
        if (request.type === 'auftrag') removeOrder(request.targetId)
        if (request.type === 'lager') removeInventoryItem(request.targetId)
        if (request.type === 'verkaufsbeleg') removeSalesDocument(request.targetId)
        if (request.type === 'bericht') {
          const report = reports.find((entry) => String(entry.id) === String(request.targetId))
          if (report) removeReport(report, true)
        }
        if (request.type === 'maschinenbau') {
          const record = machinebauRecords.find((entry) => String(entry.id) === String(request.targetId))
          if (record) removeMachinebauRecord(record, true)
        }
        if (request.type === 'laborbericht') {
          const { scope, parentId, reportId } = request.targetDetails || {}
          removeArchivedLabReport(scope, parentId, { id: reportId, name: request.targetName })
        }
        if (request.type === 'archivdatei') removeUploadedDocument(request.targetId, true)
        if (request.type === 'benutzer') {
          setUsers(await window.zyroAuth.removeUser(request.targetId, authSessionToken))
        }
      }
      setDeleteRequests((current) => current.map((entry) => entry.id === request.id
        ? { ...entry, status: approved ? request.type === 'anfrage' ? 'erledigt' : 'freigegeben' : 'abgelehnt', reviewedBy: currentUser.name, reviewedAt: new Date().toISOString() }
        : entry))
      setNetworkDataMessage(approved ? request.type === 'anfrage' ? 'Anfrage als erledigt markiert.' : 'Löschanfrage freigegeben und umgesetzt.' : 'Anfrage abgelehnt.')
    } catch (error) {
      setNetworkDataMessage(`Löschanfrage konnte nicht verarbeitet werden: ${error.message}`)
    }
  }

  const loadAutomaticBackups = async () => {
    setBackupMessage('')
    try {
      const result = await window.zyroBackup.list(authSessionToken)
      setAutomaticBackups(result.backups)
      setBackupEncryptionAvailable(result.encryptionAvailable)
    } catch (error) {
      setBackupMessage(error.message)
    }
  }

  const restoreAutomaticBackup = async (fileName) => {
    try {
      const result = await window.zyroBackup.restore(fileName, authSessionToken)
      if (result.canceled) return
      setBackupMessage(`„${fileName}“ wurde wiederhergestellt. Bitte erneut anmelden.`)
      await window.zyroAuth.logout(authSessionToken)
      setAuthSessionToken('')
      setCurrentUser(null)
    } catch (error) {
      setBackupMessage(`Wiederherstellung fehlgeschlagen: ${error.message}`)
    }
  }

  const setupWebsiteAdminToken = async (rotate = false) => {
    if (rotate && !window.confirm('Ein neues Token macht das bisherige sofort ungültig. Danach musst du das Firebase Secret aktualisieren und Functions erneut deployen. Fortfahren?')) return
    setWebsiteAdminMessage('')
    try {
      const result = await window.zyroWebOrders.generateAdminToken(authSessionToken, rotate)
      setWebsiteAdminTokenConfigured(true)
      setWebsiteAdminMessage(result.created
        ? 'Neues Token sicher gespeichert und kopiert. Setze es als Firebase Secret und deploye danach Functions und Hosting.'
        : result.rotated
          ? 'Neues Token gespeichert und kopiert. Setze es als Firebase Secret und deploye danach Functions und Hosting.'
          : 'Gespeichertes Token erneut kopiert. Falls die Website es als ungültig ablehnt: Token neu erzeugen, als Firebase Secret setzen und Functions deployen.')
    } catch (error) {
      setWebsiteAdminMessage(error.message)
    }
  }

  const handleDesktopUpdate = async () => {
    if (!window.zyroUpdater || desktopUpdateBusy) return
    setDesktopUpdateBusy(true)
    try {
      if (desktopUpdateState?.platform === 'darwin') {
        await window.zyroUpdater.openMacDownloads()
      } else if (desktopUpdateState?.status === 'available') {
        await window.zyroUpdater.download()
      } else if (desktopUpdateState?.status === 'downloaded') {
        await window.zyroUpdater.install()
      } else {
        await window.zyroUpdater.check()
      }
    } catch (error) {
      setDesktopUpdateState((current) => ({
        ...current,
        supported: true,
        status: 'error',
        error: error.message,
      }))
    } finally {
      setDesktopUpdateBusy(false)
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setAuthError('')
    try {
      const result = await window.zyroAuth.login(loginForm)
      setNotificationItems(readUserNotifications(result.user.id))
      setCurrentUser(result.user)
      setActiveTab(result.user.role === 'admin' ? 'dashboard' : result.user.permissions?.[0] || 'dashboard')
      setProfileForm({ name: result.user.name || '', email: result.user.email || '', phone: result.user.phone || '', address: result.user.address || '', avatarDataUrl: result.user.avatarDataUrl || '' })
      setAccountForm({ username: result.user.username || '', currentPassword: '', newPassword: '', confirmPassword: '' })
      setAuthSessionToken(result.sessionToken)
      setLoginForm(initialLoginForm)
    } catch (error) {
      setAuthError(error.message)
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setAuthError('')
    try {
      const result = await window.zyroAuth.register(registrationForm)
      setUsers(result.users)
      setNotificationItems(readUserNotifications(result.user.id))
      setCurrentUser(result.user)
      setActiveTab(result.user.role === 'admin' ? 'dashboard' : result.user.permissions?.[0] || 'dashboard')
      setProfileForm({ name: result.user.name || '', email: result.user.email || '', phone: result.user.phone || '', address: result.user.address || '', avatarDataUrl: result.user.avatarDataUrl || '' })
      setAccountForm({ username: result.user.username || '', currentPassword: '', newPassword: '', confirmPassword: '' })
      setAuthSessionToken(result.sessionToken)
      setRegistrationForm(initialRegistrationForm)
      setAuthStatus({ needsSetup: false, bootstrapKey: '' })
      setAuthMode('login')
    } catch (error) {
      setAuthError(error.message)
    }
  }

  const handleIssueActivationKey = async (event) => {
    event.preventDefault()
    setActivationMessage('')
    setIssuedActivationKey('')
    try {
      const permissions = userForm.role === 'admin' ? [] : activationPermissions
      const result = await window.zyroAuth.issueKey(userForm.role, permissions, authSessionToken)
      setIssuedActivationKey(result.activationKey)
      setActivationMessage(`Schlüssel für ${userForm.role === 'admin' ? 'Admin' : 'Mitarbeiter'} erstellt.`)
      setUserForm(initialUserForm)
      setActivationPermissions([...baseTabs])
    } catch (error) {
      setActivationMessage(error.message)
    }
  }

  const saveUserPermissions = async (userId) => {
    const user = users.find((entry) => String(entry.id) === String(userId))
    const draft = userPermissionDrafts[userId] || { role: user?.role, permissions: user?.permissions || [...baseTabs] }
    if (!user) return
    setPermissionMessage('')
    try {
      const updatedUsers = await window.zyroAuth.updateUserPermissions(
        userId,
        draft.role,
        draft.role === 'admin' ? [] : draft.permissions,
        authSessionToken,
      )
      setUsers(updatedUsers)
      setUserPermissionDrafts((current) => {
        const next = { ...current }
        delete next[userId]
        return next
      })
      setPermissionMessage(`Berechtigungen für ${user.name} gespeichert.`)
    } catch (error) {
      setPermissionMessage(error.message)
    }
  }

  const handleLogout = () => {
    finishCallRef.current(true)
    window.zyroCalls?.disconnect()
    window.zyroAuth.logout(authSessionToken)
    setHrSvPassphrase('')
    setHrSvUnlockDraft('')
    setHrSvConfirmDraft('')
    setHrSvNumbers({})
    setHrEmployees([])
    setHrEmployeeDraft(null)
    setEditingHrEmployeeId('')
    setCurrentUser(null)
    setAuthSessionToken('')
    setActiveTab('dashboard')
  }

  if (!networkInitialized) {
    return (
      <div className="auth-shell">
        <section className="auth-card" role="status">
          <div className="auth-header">
            <div className="brand-mark">Z</div>
            <div><p className="brand-kicker">ZYRO NETZWERK</p><h1>Verbindung zum Haupt-PC</h1></div>
          </div>
          <p>{networkDataMessage || 'Aktuelle gemeinsame Daten werden geladen …'}</p>
          <button type="button" className="primary-button full-width-button" onClick={() => window.location.reload()}>Erneut versuchen</button>
          <button type="button" className="secondary-button full-width-button" onClick={disconnectFromHost}>Diesen PC lokal verwenden</button>
        </section>
      </div>
    )
  }

  if (!currentUser) {
    if (window.zyroAuth && !authStatus) {
      return (
        <div className="auth-shell">
          <section className="auth-card" role="status">
            <div className="auth-header"><div className="brand-mark">Z</div><div><p className="brand-kicker">ZYRO</p><h1>Benutzerkonten werden geladen</h1></div></div>
            {authError && <p className="auth-error">{authError}</p>}
          </section>
        </div>
      )
    }

    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-mark">Z</div>
            <div>
              <p className="brand-kicker">ZYRO</p>
              <h1>{authMode === 'register' ? (authStatus?.needsSetup ? 'Admin einrichten' : 'Konto aktivieren') : 'Login'}</h1>
            </div>
          </div>

          {authMode === 'register' ? (
            <form className="auth-form" onSubmit={handleRegister}>
              {authStatus?.needsSetup && (
                <div className="demo-box">
                  <strong>Einmaliger Admin-Aktivierungsschlüssel</strong>
                  <code>{authStatus.bootstrapKey}</code>
                </div>
              )}
              <label>Name<input required type="text" name="name" value={registrationForm.name} onChange={handleRegistrationInput} autoComplete="name" /></label>
              <label>Benutzername<input required type="text" name="username" value={registrationForm.username} onChange={handleRegistrationInput} autoComplete="username" /></label>
              <label>Passwort (mindestens 8 Zeichen)<input required minLength={8} type="password" name="password" value={registrationForm.password} onChange={handleRegistrationInput} autoComplete="new-password" /></label>
              <label>Aktivierungsschlüssel<input required type="text" name="activationKey" value={registrationForm.activationKey} onChange={handleRegistrationInput} autoComplete="off" /></label>
              {authError && <p className="auth-error">{authError}</p>}
              <button type="submit" className="primary-button full-width-button">{authStatus?.needsSetup ? 'Admin-Konto erstellen' : 'Konto erstellen'}</button>
              {!authStatus?.needsSetup && <button type="button" className="secondary-button full-width-button" onClick={() => { setAuthMode('login'); setAuthError('') }}>Zur Anmeldung</button>}
              {authStatus?.needsSetup && window.zyroCloud && (
                <div className="demo-box">
                  <strong>Schon ein ZYRO-Konto in der Cloud?</strong>
                  <input type="password" value={cloudTokenInput} onChange={(event) => setCloudTokenInput(event.target.value)} placeholder="Admin-Token" autoComplete="off" />
                  <button type="button" className="secondary-button full-width-button" disabled={cloudTokenInput.trim().length < 32} onClick={enableCloudSync}>Mit Cloud verbinden</button>
                  {cloudMessage && <small>{cloudMessage}</small>}
                </div>
              )}
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleLogin}>
              <label>Benutzername<input type="text" name="username" value={loginForm.username} onChange={handleLoginInput} autoComplete="username" /></label>
              <label>Passwort<input type="password" name="password" value={loginForm.password} onChange={handleLoginInput} autoComplete="current-password" /></label>
              {authError && <p className="auth-error">{authError}</p>}
              <button type="submit" className="primary-button full-width-button">Einloggen</button>
              {authStatus && <button type="button" className="secondary-button full-width-button" onClick={() => { setAuthMode('register'); setAuthError('') }}>Mit Aktivierungsschlüssel registrieren</button>}
            </form>
          )}
          {authMode === 'login' && networkStatus.mode === 'local' && window.zyroCloud && (
            <details className="network-client-form">
              <summary>Mit Cloud verbinden</summary>
              <p className="network-help">Cloud-Daten laden oder aktualisieren. Dafür wird das Admin-Token benötigt. Die vorhandenen lokalen Daten werden vorher gesichert.</p>
              <label>
                Cloud-Admin-Token
                <input type="password" value={cloudTokenInput} onChange={(event) => setCloudTokenInput(event.target.value)} autoComplete="off" />
              </label>
              {cloudMessage && <p className={cloudMessage.startsWith('Cloud-Sync fehlgeschlagen:') ? 'auth-error' : 'network-help'} role="status">{cloudMessage}</p>}
              <button type="button" className="secondary-button full-width-button" disabled={cloudTokenInput.trim().length < 32} onClick={() => enableCloudSync()}>Cloud-Daten laden</button>
            </details>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={scannerStandalone ? 'zyro-app-shell scanner-standalone' : 'zyro-app-shell'}>
      {callInfo && (
        <section className="call-notification" role={callInfo.status === 'incoming' ? 'alert' : 'status'} aria-live="assertive">
          <div>
            <strong>{callInfo.status === 'incoming' ? `Eingehender Anruf · ${callInfo.remoteUser.name}` : callInfo.remoteUser.name}</strong>
            <span>{callInfo.status === 'incoming' ? 'Möchte mit dir sprechen' : callInfo.status === 'connected' ? 'Gespräch verbunden' : callInfo.status === 'ringing' ? 'Klingelt …' : 'Verbindung wird aufgebaut …'}</span>
          </div>
          <div className="mini-actions">
            {callInfo.status === 'incoming' ? (
              <>
                <button type="button" className="primary-button small" onClick={acceptInternalCall}>Annehmen</button>
                <button type="button" className="danger-button small" onClick={rejectInternalCall}>Ablehnen</button>
              </>
            ) : (
              <>
                <button type="button" className="secondary-button small" onClick={toggleCallMute}>{callMuted ? 'Mikrofon an' : 'Stumm'}</button>
                <button type="button" className="danger-button small" onClick={() => finishCallRef.current(true)}>Auflegen</button>
              </>
            )}
          </div>
        </section>
      )}
      {nutritionEditorOpen && (
        <div className="modal-backdrop" onClick={() => setNutritionEditorOpen(false)}>
          <section className="nutrition-editor-modal" role="dialog" aria-modal="true" aria-labelledby="nutrition-editor-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Produkt · Online-Shop</p>
                <h2 id="nutrition-editor-title">Nährwerte pro 100 ml</h2>
              </div>
              <button type="button" className="secondary-button small" onClick={() => setNutritionEditorOpen(false)}>Schließen</button>
            </div>
            <p>Trage die Nährwerte einzeln ein. Leere Felder werden nicht angezeigt.</p>
            <form className="nutrition-editor-form" onSubmit={(event) => { event.preventDefault(); setNutritionEditorOpen(false) }}>
              {nutritionFields.map((field) => (
                <label key={field.name}>
                  {field.label} ({field.unit})
                  <input
                    type="number"
                    min="0"
                    step={field.step}
                    inputMode="decimal"
                    value={productForm.shopNutritionValues?.[field.name] ?? ''}
                    onChange={(event) => setProductForm((current) => ({
                      ...current,
                      shopNutritionValues: { ...current.shopNutritionValues, [field.name]: event.target.value },
                    }))}
                  />
                </label>
              ))}
              <div className="nutrition-editor-actions">
                <button type="button" className="secondary-button small" onClick={() => setProductForm((current) => ({ ...current, shopNutrition: '', shopNutritionValues: {} }))}>Alle Werte leeren</button>
                <button type="submit" className="primary-button small">Übernehmen</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {viewingLabReport && (
        <div className="modal-backdrop" onClick={() => setViewingLabReport(null)}>
          <section className="lab-report-modal" role="dialog" aria-modal="true" aria-labelledby="lab-report-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                {viewingLabReport.archiveUpload && <p className="eyebrow">Dokumentenarchiv · Vorschau</p>}
                <h2 id="lab-report-title">{viewingLabReport.name}</h2>
              </div>
              <button type="button" className="secondary-button small" onClick={() => setViewingLabReport(null)}>Schließen</button>
            </div>
            {viewingLabReport.type === 'application/pdf'
              ? <iframe className="lab-report-frame" title={viewingLabReport.name} src={viewingLabReport.dataUrl} />
              : <img className="lab-report-image" src={viewingLabReport.dataUrl} alt={viewingLabReport.name} />}
          </section>
        </div>
      )}
      {reportDraft && (
        <div className="modal-backdrop report-editor-backdrop" onClick={() => { setReportDraft(null); setEditingReportId('') }}>
          <section className="report-editor-modal" role="dialog" aria-modal="true" aria-labelledby="report-editor-title" onClick={(event) => event.stopPropagation()}>
            <header className="report-editor-header">
              <div>
                <p className="eyebrow">Dokumentenarchiv · Zyro Berichte</p>
                <h2 id="report-editor-title">{editingReportId ? 'Bericht bearbeiten' : 'Neuen Bericht schreiben'}</h2>
                <span>Dein Bericht wird automatisch mit deinen anderen Geräten synchronisiert.</span>
              </div>
              <button type="button" className="secondary-button small" aria-label="Editor schließen" onClick={() => { setReportDraft(null); setEditingReportId('') }}>Schließen</button>
            </header>
            <form className="report-editor-form" onSubmit={saveReport}>
              <div className="report-editor-fields">
                <label className="report-title-field">
                  Titel
                  <input required maxLength={140} value={reportDraft.title} onChange={(event) => setReportDraft((current) => ({ ...current, title: event.target.value }))} placeholder="z. B. Produktionsbericht Mai" />
                </label>
                <label>
                  Berichtstyp
                  <select value={reportDraft.type} onChange={(event) => setReportDraft((current) => ({ ...current, type: event.target.value }))}>
                    <option>Qualitätsbericht</option>
                    <option>Produktionsbericht</option>
                    <option>Chargenbericht</option>
                    <option>Monatsbericht</option>
                    <option>Sonstiger Bericht</option>
                  </select>
                </label>
                <label>
                  Datum
                  <input type="date" value={reportDraft.date} onChange={(event) => setReportDraft((current) => ({ ...current, date: event.target.value }))} />
                </label>
                <label>
                  Produkt (optional)
                  <input maxLength={120} value={reportDraft.product} onChange={(event) => setReportDraft((current) => ({ ...current, product: event.target.value }))} placeholder="Produktname" />
                </label>
                <label>
                  Charge (optional)
                  <input maxLength={80} value={reportDraft.batchNumber} onChange={(event) => setReportDraft((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Chargennummer" />
                </label>
                <label>
                  Verfasser
                  <input maxLength={100} value={reportDraft.author} onChange={(event) => setReportDraft((current) => ({ ...current, author: event.target.value }))} />
                </label>
                <label>
                  Status
                  <select value={reportDraft.status} onChange={(event) => setReportDraft((current) => ({ ...current, status: event.target.value }))}>
                    <option>Entwurf</option>
                    <option>In Prüfung</option>
                    <option>Freigegeben</option>
                  </select>
                </label>
                <label className="report-summary-field">
                  Zusammenfassung
                  <textarea maxLength={500} rows={2} value={reportDraft.summary} onChange={(event) => setReportDraft((current) => ({ ...current, summary: event.target.value }))} placeholder="Worum geht es in diesem Bericht?" />
                </label>
              </div>
              <div className="report-editor-workspace">
                <section className="report-writing-panel">
                  <div className="report-workspace-heading">
                    <div><span className="eyebrow">Schreibbereich</span><h3>Inhalt</h3></div>
                    <span>{reportDraft.content.length.toLocaleString()} / 30.000</span>
                  </div>
                  <div className="report-toolbar" aria-label="Textformatierung">
                    <button type="button" onClick={() => formatReportContent('## ')}>Überschrift</button>
                    <button type="button" onClick={() => formatReportContent('**', '**')}><strong>Fett</strong></button>
                    <button type="button" onClick={() => formatReportContent('- ')}>• Liste</button>
                  </div>
                  <textarea
                    ref={reportContentRef}
                    className="report-content-input"
                    required
                    maxLength={30000}
                    value={reportDraft.content}
                    onChange={(event) => setReportDraft((current) => ({ ...current, content: event.target.value }))}
                    placeholder={'Schreibe deinen Bericht hier …\n\nNutze „Überschrift“ für Abschnitte, „Fett“ für Hervorhebungen und „Liste“ für Aufzählungen.'}
                  />
                  <span className="report-format-hint">Tipp: Markdown wird unterstützt — **fetter Text**, ## Überschrift und - Listenpunkt.</span>
                </section>
                <section className="report-preview-panel" aria-label="Berichtsvorschau">
                  <div className="report-workspace-heading"><div><span className="eyebrow">Live-Vorschau</span><h3>So sieht dein Bericht aus</h3></div></div>
                  <article className="report-paper">
                    <span className="report-paper-kicker">{reportDraft.type} <span>·</span> {reportDraft.date || 'Ohne Datum'}</span>
                    <h2>{reportDraft.title || 'Titel deines Berichts'}</h2>
                    {(reportDraft.product || reportDraft.batchNumber || reportDraft.author) && (
                      <div className="report-paper-meta">
                        {reportDraft.product && <span>{reportDraft.product}</span>}
                        {reportDraft.batchNumber && <span>Charge {reportDraft.batchNumber}</span>}
                        {reportDraft.author && <span>Von {reportDraft.author}</span>}
                      </div>
                    )}
                    {reportDraft.summary && <p className="report-paper-summary">{reportDraft.summary}</p>}
                    <div className="report-paper-content">{renderReportContent(reportDraft.content || 'Dein Berichtstext erscheint hier, während du schreibst.')}</div>
                    <footer>{reportDraft.status} <span>·</span> Zyro Management</footer>
                  </article>
                </section>
              </div>
              {reportFeedback && <p className="report-feedback" role="alert">{reportFeedback}</p>}
              <footer className="report-editor-actions">
                <button type="button" className="secondary-button" onClick={() => { setReportDraft(null); setEditingReportId('') }}>Abbrechen</button>
                <button type="submit" className="primary-button">{editingReportId ? 'Änderungen speichern' : 'Bericht speichern'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {viewingReport && (
        <div className="modal-backdrop" onClick={() => setViewingReport(null)}>
          <section className="report-view-modal" role="dialog" aria-modal="true" aria-labelledby="report-view-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div><p className="eyebrow">Berichtsvorschau</p><h2 id="report-view-title">{viewingReport.title}</h2></div>
              <div className="mini-actions">
                <button type="button" className="secondary-button small" onClick={() => { openReportEditor(viewingReport); setViewingReport(null) }}>Bearbeiten</button>
                <button type="button" className="secondary-button small" onClick={() => setViewingReport(null)}>Schließen</button>
              </div>
            </div>
            <article className="report-paper report-view-paper">
              <span className="report-paper-kicker">{viewingReport.type} <span>·</span> {viewingReport.date || 'Ohne Datum'}</span>
              <h2>{viewingReport.title}</h2>
              <div className="report-paper-meta">
                {viewingReport.product && <span>{viewingReport.product}</span>}
                {viewingReport.batchNumber && <span>Charge {viewingReport.batchNumber}</span>}
                {viewingReport.author && <span>Von {viewingReport.author}</span>}
              </div>
              {viewingReport.summary && <p className="report-paper-summary">{viewingReport.summary}</p>}
              <div className="report-paper-content">{renderReportContent(viewingReport.content)}</div>
              <footer>{viewingReport.status} <span>·</span> Zyro Management</footer>
            </article>
          </section>
        </div>
      )}
      {viewingCustomer && (
        <div className="modal-backdrop" onClick={() => setViewingCustomer(null)}>
          <section className="customer-profile-modal" role="dialog" aria-modal="true" aria-labelledby="customer-profile-title" onClick={(event) => event.stopPropagation()}>
            <header className="customer-profile-header">
              <div>
                <p className="eyebrow">Kundenstamm · Kundenprofil</p>
                <h2 id="customer-profile-title">{viewingCustomer.name}</h2>
                {viewingCustomer.contactName && <span>Ansprechpartner: {viewingCustomer.contactName}</span>}
              </div>
              <div className="mini-actions">
                <button type="button" className="secondary-button small" onClick={() => {
                  editCustomer(viewingCustomer)
                  setViewingCustomer(null)
                }}>Bearbeiten</button>
                <button type="button" className="secondary-button small" onClick={() => setViewingCustomer(null)}>Schließen</button>
              </div>
            </header>
            <div className="customer-profile-grid">
              <section className="customer-profile-section">
                <h3>Kontakt &amp; Adressen</h3>
                <dl className="customer-detail-list">
                  <div><dt>E-Mail</dt><dd>{viewingCustomer.email ? <a href={`mailto:${viewingCustomer.email}`}>{viewingCustomer.email}</a> : '–'}</dd></div>
                  <div><dt>Telefon</dt><dd>{viewingCustomer.phone ? <a href={`tel:${viewingCustomer.phone}`}>{viewingCustomer.phone}</a> : '–'}</dd></div>
                  <div><dt>Rechnungsadresse</dt><dd>{viewingCustomer.address || '–'}</dd></div>
                  <div><dt>Lieferadresse</dt><dd>{viewingCustomer.shippingAddress || viewingCustomer.address || 'Wie Rechnungsadresse'}</dd></div>
                  <div><dt>USt-IdNr.</dt><dd>{viewingCustomer.vatId || '–'}</dd></div>
                </dl>
              </section>
              <section className="customer-profile-section">
                <h3>Zahlungsdaten</h3>
                <dl className="customer-detail-list">
                  <div><dt>Zahlungsziel</dt><dd>{viewingCustomer.paymentTerms || 'Nicht hinterlegt'}</dd></div>
                  <div><dt>Zahlungsart</dt><dd>{viewingCustomer.paymentMethod || 'Nicht festgelegt'}</dd></div>
                  <div className="customer-iban-row">
                    <dt>IBAN <span>Sensibel</span></dt>
                    <dd>
                      {viewingCustomer.iban
                        ? <><span className="customer-iban-value">{customerIbanVisible ? viewingCustomer.iban : `•••• •••• •••• ${viewingCustomer.iban.slice(-4)}`}</span><button type="button" className="secondary-button small" onClick={() => setCustomerIbanVisible((visible) => !visible)}>{customerIbanVisible ? 'Verbergen' : 'Anzeigen'}</button></>
                        : 'Nicht hinterlegt'}
                    </dd>
                  </div>
                </dl>
                {viewingCustomer.notes && <div className="customer-notes"><strong>Interne Notizen</strong><p>{viewingCustomer.notes}</p></div>}
              </section>
              <section className="customer-profile-section customer-history-section">
                <h3>Rechnungsübersicht</h3>
                <div className="customer-metrics">
                  <div><span>Rechnungen</span><strong>{viewingCustomer.invoiceCount || 0}</strong></div>
                  <div><span>Umsatz brutto</span><strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(viewingCustomer.gross || 0)}</strong></div>
                  <div><span>Bezahlt</span><strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(viewingCustomer.paid || 0)}</strong></div>
                  <div><span>Offen</span><strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(viewingCustomer.outstanding || 0)}</strong></div>
                </div>
                <div className="table-scroll">
                  <table className="data-table customer-history-table">
                    <thead><tr><th>Rechnung</th><th>Datum</th><th>Status</th><th>Betrag</th><th></th></tr></thead>
                    <tbody>
                      {salesDocuments.filter((document) => document.kind === 'rechnung' && (document.recipient || '').trim().toLocaleLowerCase() === viewingCustomer.name.toLocaleLowerCase()).map((document) => {
                        const netAmount = getSalesDocumentItems(document).reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
                        const amount = netAmount * (1 + (Number(document.vatRate) || 0) / 100)
                        return <tr key={document.id}><td>{document.number}</td><td>{document.documentDate || '–'}</td><td>{document.status}</td><td>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)}</td><td><button type="button" className="secondary-button small" onClick={() => printSalesDocument(document)}>Öffnen</button></td></tr>
                      })}
                      {salesDocuments.filter((document) => document.kind === 'rechnung' && (document.recipient || '').trim().toLocaleLowerCase() === viewingCustomer.name.toLocaleLowerCase()).length === 0 && <tr><td colSpan="5">Noch keine Rechnungen für diesen Kunden.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="customer-profile-section customer-history-section">
                <h3>Aufträge</h3>
                <div className="table-scroll">
                  <table className="data-table customer-history-table">
                    <thead><tr><th>Produkt</th><th>Charge</th><th>Status</th><th>Fällig</th></tr></thead>
                    <tbody>
                      {orders.filter((order) => (order.customer || '').trim().toLocaleLowerCase() === viewingCustomer.name.toLocaleLowerCase()).map((order) => (
                        <tr key={order.id}><td>{order.product || '–'}</td><td>{order.lotNumber || '–'}</td><td>{order.status || '–'}</td><td>{order.dueDate || '–'}</td></tr>
                      ))}
                      {orders.filter((order) => (order.customer || '').trim().toLocaleLowerCase() === viewingCustomer.name.toLocaleLowerCase()).length === 0 && <tr><td colSpan="4">Noch keine Aufträge für diesen Kunden.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <p className="customer-privacy-note">Bankdaten werden nur angezeigt, wenn du sie aktiv einblendest. Zugriff auf Kundendaten richtet sich nach den Berechtigungen deines Zyro-Kontos.</p>
          </section>
        </div>
      )}
      {networkSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setNetworkSettingsOpen(false)}>
          <section className="network-settings-modal" role="dialog" aria-modal="true" aria-labelledby="network-settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Lokales Netzwerk</p>
                <h2 id="network-settings-title">Haupt-PC-Verbindung</h2>
              </div>
              <button type="button" className="secondary-button small" onClick={() => setNetworkSettingsOpen(false)}>Schließen</button>
            </div>
            <p className="network-help">Der Haupt-PC muss eingeschaltet sein und Zyro Management geöffnet haben. Erlaube den Netzwerkzugriff in der Windows-Firewall nur für private Netzwerke.</p>

            {networkStatus.mode === 'host' ? (
              <div className="network-host-panel">
                <strong>{networkStatus.running ? 'Haupt-PC ist aktiv' : 'Host wird gestartet'}</strong>
                {networkStatus.addresses.length > 0
                  ? networkStatus.addresses.map((address) => <code key={address}>{address}:{networkStatus.port}</code>)
                  : <small>Keine aktive IPv4-Netzwerkadresse gefunden.</small>}
                <div className="network-access-code">
                  <label htmlFor="host-access-code">Zugangscode</label>
                  <input id="host-access-code" type="text" value={networkStatus.accessCode} readOnly />
                  <button type="button" className="secondary-button small" onClick={() => navigator.clipboard.writeText(networkStatus.accessCode).then(() => setNetworkDataMessage('Zugangscode kopiert.')).catch(() => setNetworkDataMessage('Zugangscode konnte nicht kopiert werden.'))}>Code kopieren</button>
                </div>
                <button type="button" className="danger-button" onClick={stopMainHost}>Host stoppen</button>
              </div>
            ) : networkStatus.mode === 'client' ? (
              <div className="network-host-panel">
                <strong>Mit Haupt-PC verbunden</strong>
                <code>{networkStatus.hostAddress}</code>
                <button type="button" className="secondary-button" onClick={disconnectFromHost}>Verbindung trennen</button>
              </div>
            ) : (
              <div className="network-host-panel">
                <p>Dieser PC verwendet derzeit nur seine lokalen Daten.</p>
                <button type="button" className="primary-button" onClick={startMainHost}>Diesen PC als Haupt-PC starten</button>
              </div>
            )}

            {networkStatus.mode === 'local' && window.zyroCloud && (
              <form className="network-client-form" onSubmit={enableCloudSync}>
                <h3>Cloud-Sync (Zugriff von überall)</h3>
                {cloudStatus?.enabled ? (
                  <>
                    <p className="network-help">Aktiv. Letzter Abgleich: {cloudStatus.lastSyncAt ? new Date(cloudStatus.lastSyncAt).toLocaleString('de-DE') : 'noch nicht'}</p>
                    {cloudStatus.lastError && <p className="auth-error">{cloudStatus.lastError}</p>}
                    <button type="button" className="secondary-button" onClick={syncCloudNow}>Jetzt synchronisieren</button>
                    <button type="button" className="danger-button" onClick={disableCloudSync}>Cloud-Sync beenden</button>
                  </>
                ) : (
                  <>
                    <p className="network-help">Die Daten werden über Firebase auf allen PCs abgeglichen. Offline arbeitest du lokal weiter, der Abgleich folgt automatisch.</p>
                    <label>
                      {cloudStatus?.tokenConfigured ? 'Admin-Token (optional)' : 'Admin-Token'}
                      <input
                        type="password"
                        value={cloudTokenInput}
                        onChange={(event) => setCloudTokenInput(event.target.value)}
                        placeholder={cloudStatus?.tokenConfigured ? 'Bei Ablehnung das aktuelle Token eingeben' : ''}
                        autoComplete="off"
                      />
                    </label>
                    <button type="submit" className="primary-button">Cloud-Sync aktivieren</button>
                  </>
                )}
                {cloudMessage && <small>{cloudMessage}</small>}
              </form>
            )}

            {networkStatus.mode !== 'host' && (
              <form className="network-client-form" onSubmit={connectToHost}>
                <h3>Mit Haupt-PC verbinden</h3>
                <label>
                  Host-IP und Port
                  <input type="text" value={hostAddressInput} onChange={(event) => setHostAddressInput(event.target.value)} placeholder="192.168.1.20:47821" required />
                </label>
                <label>
                  Zugangscode
                  <input type="password" value={accessCodeInput} onChange={(event) => setAccessCodeInput(event.target.value)} autoComplete="new-password" required />
                </label>
                <button type="submit" className="primary-button">Verbinden</button>
              </form>
            )}
          </section>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">Z</div>
          <div>
            <p className="brand-kicker">ZYRO</p>
            <h2>Management</h2>
          </div>
        </div>

        <div className="user-box">
          <span>Angemeldet</span>
          <strong>{currentUser.name}</strong>
          <small>{currentUser.role}</small>
        </div>

        <nav className="nav-menu">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'nav-button active' : 'nav-button'}
              aria-label={tab === 'postfach' && mailboxUnreadCount > 0 ? `Postfach, ${mailboxUnreadCount} ungelesene E-Mails` : undefined}
              title={tab === 'postfach' && mailboxUnreadCount > 0 ? `${mailboxUnreadCount} ungelesene E-Mails` : undefined}
              onClick={() => {
                setActiveTab(tab)
              }}
            >
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'tickets' && 'Tickets'}
              {tab === 'anfragen' && `Neue Anfragen${contactMessages.filter((message) => message.status === 'new' || message.status === 'customer_replied').length ? ` (${contactMessages.filter((message) => message.status === 'new' || message.status === 'customer_replied').length})` : ''}`}
              {tab === 'telefon' && 'Telefon'}
              {tab === 'postfach' && <>Postfach{mailboxUnreadCount > 0 && <span className="nav-unread-indicator" aria-hidden="true" />}</>}
              {tab === 'dokumente' && 'Dokumentenarchiv'}
              {tab === 'etiketten' && 'Dosendesign'}
              {tab === 'profil' && 'Mein Profil'}
              {tab === 'protokoll' && 'Änderungsprotokoll'}
              {tab === 'produkte' && 'Produkte'}
              {tab === 'rezepturen' && 'Rezepturen'}
              {tab === 'bestellungen' && 'Bestellungen'}
              {tab === 'einkauf' && 'Einkauf'}
              {tab === 'verkauf' && 'Verkauf'}
              {tab === 'kunden' && 'Kunden'}
              {tab === 'analyse' && 'Umsatzanalyse'}
              {tab === 'finanzen' && 'Finanzen'}
              {tab === 'zahlungen' && 'Zahlungen'}
              {tab === 'kalkulation' && 'Kalkulation'}
              {tab === 'shop' && 'Shop'}
              {tab === 'lager' && 'Lager'}
              {tab === 'mde' && 'MDE · Scanner'}
              {tab === 'versand' && 'Versand & Tracking'}
              {tab === 'chargen' && 'Chargen'}
              {tab === 'maschinenbau' && 'Maschinenbau'}
              {tab === 'admin' && 'Admin'}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="main-header">
          <div>
            <p className="eyebrow">{activeTab === 'maschinenbau' ? 'Maschinenbau · Technik & Fertigung' : 'Getränkeproduktion'}</p>
            <h1>{activeTab === 'maschinenbau' ? 'Maschinenbau & Fertigung' : 'ZYRO Betriebsübersicht'}</h1>
          </div>
          <div className="header-actions">
            <button type="button" className="profile-summary-button" onClick={() => setActiveTab('profil')} title="Persönliche Einstellungen">
              {currentUser.avatarDataUrl
                ? <img className="profile-avatar" src={currentUser.avatarDataUrl} alt="" />
                : <span className="profile-avatar profile-avatar-fallback">{currentUser.name.trim().slice(0, 1).toUpperCase()}</span>}
              <span>Mein Profil</span>
            </button>
            {desktopUpdateState?.supported && (
              <div className="desktop-update-control">
                <button
                  type="button"
                  className="secondary-button small"
                  onClick={handleDesktopUpdate}
                  disabled={desktopUpdateBusy || ['checking', 'downloading'].includes(desktopUpdateState.status)}
                >
                  {desktopUpdateState.platform === 'darwin'
                    ? 'Mac-Update herunterladen'
                    : desktopUpdateState.status === 'downloading'
                    ? `Update wird geladen … ${desktopUpdateState.percent}%`
                    : desktopUpdateBusy || desktopUpdateState.status === 'checking'
                    ? 'Suche nach Updates …'
                    : desktopUpdateState.status === 'available'
                      ? `Update ${desktopUpdateState.availableVersion} herunterladen`
                      : desktopUpdateState.status === 'downloaded'
                          ? 'Jetzt aktualisieren'
                          : 'Nach Updates suchen'}
                </button>
                <small role="status" aria-live="polite">
                  {desktopUpdateState.platform === 'darwin'
                    ? `Version ${desktopUpdateState.currentVersion} · Öffnet den aktuellen Mac-Installer`
                    : desktopUpdateState.status === 'available'
                    ? `Version ${desktopUpdateState.availableVersion} verfügbar`
                    : desktopUpdateState.status === 'downloading'
                      ? `Download: ${desktopUpdateState.percent}%`
                      : desktopUpdateState.status === 'downloaded'
                        ? `Version ${desktopUpdateState.availableVersion} bereit – Neustart erforderlich`
                        : desktopUpdateState.status === 'not-available'
                          ? `Version ${desktopUpdateState.currentVersion} ist aktuell`
                          : desktopUpdateState.status === 'error'
                            ? `Update fehlgeschlagen: ${desktopUpdateState.error}`
                            : desktopUpdateState.status === 'checking'
                              ? 'Suche nach einer neuen Version …'
                              : `Installierte Version ${desktopUpdateState.currentVersion}`}
                </small>
              </div>
            )}
            <div className="notification-control">
              <button
                type="button"
                className="notification-button"
                aria-label={`Benachrichtigungen${notificationItems.filter((item) => !item.read).length ? `, ${notificationItems.filter((item) => !item.read).length} ungelesen` : ''}`}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  const opening = !notificationsOpen
                  setNotificationsOpen(opening)
                  if (opening) {
                    const updated = notificationItems.map((item) => ({ ...item, read: true }))
                    setNotificationItems(updated)
                    window.localStorage.setItem(`zyro-notifications-${currentUser.id}`, JSON.stringify(updated))
                  }
                }}
              >
                <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {notificationItems.filter((item) => !item.read).length > 0 && <span className="notification-badge">{Math.min(notificationItems.filter((item) => !item.read).length, 99)}</span>}
              </button>
              {notificationsOpen && (
                <section className="notification-popover" aria-label="Benachrichtigungen">
                  <div className="notification-popover-header">
                    <strong>Benachrichtigungen</strong>
                    <button type="button" className="secondary-button small" onClick={() => {
                      const enabled = !notificationSoundEnabled
                      setNotificationSoundEnabled(enabled)
                      window.localStorage.setItem('zyro-notification-sound', String(enabled))
                    }}>{notificationSoundEnabled ? 'Ton aus' : 'Ton an'}</button>
                  </div>
                  {notificationItems.length === 0 ? <p>Keine neuen Benachrichtigungen.</p> : (
                    <div className="notification-list">
                      {notificationItems.map((item) => (
                        <button key={item.id} type="button" className="notification-item" onClick={() => { setActiveTab('tickets'); setNotificationsOpen(false) }}>
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                          <small>{formatTimestamp(item.createdAt)}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
            {window.zyroData && (
              <div className="network-data-control">
                {networkStatus.mode === 'local' && networkStatus.cloudEnabled ? (
                  <div
                    className={`network-cloud-status ${cloudStatus?.lastError ? 'has-error' : cloudStatus?.lastSyncAt ? 'is-connected' : 'is-pending'}`}
                    role="status"
                    aria-live="polite"
                    title={cloudStatus?.lastError
                      || (cloudStatus?.lastSyncAt ? `Letzter erfolgreicher Abgleich: ${new Date(cloudStatus.lastSyncAt).toLocaleString('de-DE')}` : 'Die Cloud-Verbindung wird geprüft.')}
                  >
                    <span className="network-cloud-status-dot" aria-hidden="true" />
                    <strong>
                      {cloudStatus?.lastError
                        ? 'Cloud-Sync gestört'
                        : cloudStatus?.lastSyncAt
                          ? 'Mit Cloud verbunden'
                          : 'Cloud-Verbindung wird geprüft'}
                    </strong>
                    {cloudStatus?.lastSyncAt && !cloudStatus.lastError && (
                      <small>Zuletzt {new Date(cloudStatus.lastSyncAt).toLocaleTimeString('de-DE')}</small>
                    )}
                  </div>
                ) : (
                  <small title={networkStatus.hostAddress || 'Lokaler Speicher'}>
                    {networkStatus.mode === 'host'
                      ? networkStatus.running ? `Haupt-PC: ${networkStatus.addresses.join(', ')}:${networkStatus.port}` : 'Haupt-PC ist nicht erreichbar'
                      : networkStatus.mode === 'client' ? `Verbunden: ${networkStatus.hostAddress}`
                        : 'Daten nur auf diesem PC'}
                  </small>
                )}
                <div>
                  {typeof window.zyroData?.syncNow === 'function' && (
                    <button
                      type="button"
                      className="secondary-button small"
                      onClick={syncWebCloudNow}
                      disabled={cloudSyncing}
                    >
                      {cloudSyncing ? 'Cloud wird aktualisiert …' : 'Cloud aktualisieren'}
                    </button>
                  )}
                  <button type="button" className="secondary-button small" onClick={() => setNetworkSettingsOpen(true)}>{networkStatus.cloudEnabled ? 'Cloud / Netzwerk' : 'Netzwerk einrichten'}</button>
                </div>
              </div>
            )}
            <button type="button" className="secondary-button" onClick={handleLogout}>
              Abmelden
            </button>
            <button type="button" className="primary-button" onClick={() => activeTab === 'maschinenbau'
              ? openMachinebauEditor(machinebauTypeFilter === 'alle' ? 'projekt' : machinebauTypeFilter)
              : setActiveTab('bestellungen')}>
              {activeTab === 'maschinenbau' ? 'Neuer Eintrag' : 'Neue Charge starten'}
            </button>
          </div>
        </header>
        {networkDataMessage && <p className="network-data-message" role="status">{networkDataMessage}</p>}

        {activeTab === 'maschinenbau' && (
          <>
            {currentUser?.role === 'admin' && (
              <section className="panel machinebau-hr-panel">
                <div className="panel-header">
                  <div>
                    <h2>Mitarbeiterverwaltung</h2>
                    <p className="meta">Personaldaten und SV-Nummern sind verschlüsselt und nur für Admins sichtbar.</p>
                  </div>
                  {hrSvPassphrase && (
                    <button type="button" className="secondary-button small" onClick={() => {
                      setHrSvPassphrase('')
                      setHrSvNumbers({})
                      setHrEmployees([])
                      setHrEmployeeDraft(null)
                      setEditingHrEmployeeId('')
                      setHrSvMessage('HR-Schutzspeicher gesperrt.')
                    }}>Sperren</button>
                  )}
                </div>
                {!hrSvPassphrase ? (
                  <form className="machinebau-hr-unlock" onSubmit={unlockHrSvStorage}>
                    <label>
                      {hrSensitiveRecords.length ? 'HR-Schutzpasswort' : 'Neues HR-Schutzpasswort'}
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={256}
                        required
                        value={hrSvUnlockDraft}
                        onChange={(event) => setHrSvUnlockDraft(event.target.value)}
                        placeholder="Mindestens 12 Zeichen"
                      />
                    </label>
                    {hrSensitiveRecords.length === 0 && (
                      <label>
                        Schutzpasswort wiederholen
                        <input
                          type="password"
                          autoComplete="new-password"
                          minLength={12}
                          maxLength={256}
                          required
                          value={hrSvConfirmDraft}
                          onChange={(event) => setHrSvConfirmDraft(event.target.value)}
                        />
                      </label>
                    )}
                    <button type="submit" className="primary-button" disabled={hrSvBusy}>
                      {hrSvBusy ? 'Bitte warten …' : hrSensitiveRecords.length ? 'HR-Daten entsperren' : 'Schutzspeicher einrichten'}
                    </button>
                    <p className="machinebau-privacy-note">
                      Mitarbeiterdaten und SV-Nummern werden vor der Synchronisierung mit AES-GCM verschlüsselt.
                      Das Schutzpasswort wird nicht gespeichert und kann nicht wiederhergestellt werden. Sichere es separat.
                    </p>
                  </form>
                ) : (
                  <>
                    <div className="machinebau-hr-toolbar">
                      <strong>{hrEmployees.length} Mitarbeiter</strong>
                      <button type="button" className="primary-button" onClick={() => openHrEmployeeEditor()} disabled={hrSvBusy}>
                        Mitarbeiter anlegen
                      </button>
                    </div>
                    {hrEmployeeDraft && (
                      <form className="machinebau-editor" onSubmit={saveHrEmployee}>
                        <div className="panel-header">
                          <div>
                            <h3>{editingHrEmployeeId ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen'}</h3>
                            <p className="meta">SV-Nummer ist optional und wird ausschließlich im verschlüsselten HR-Speicher abgelegt.</p>
                          </div>
                          <button type="button" className="secondary-button small" onClick={() => { setHrEmployeeDraft(null); setEditingHrEmployeeId('') }}>Schließen</button>
                        </div>
                        <div className="form-grid">
                          <label>
                            Vor- und Nachname
                            <input required maxLength={120} autoComplete="name" value={hrEmployeeDraft.name} onChange={(event) => setHrEmployeeDraft((current) => ({ ...current, name: event.target.value }))} />
                          </label>
                          <label>
                            Personalnummer
                            <input maxLength={60} value={hrEmployeeDraft.reference} onChange={(event) => setHrEmployeeDraft((current) => ({ ...current, reference: event.target.value }))} />
                          </label>
                          <label>
                            Abteilung
                            <input maxLength={100} value={hrEmployeeDraft.department} onChange={(event) => setHrEmployeeDraft((current) => ({ ...current, department: event.target.value }))} />
                          </label>
                          <label>
                            Tätigkeit
                            <input maxLength={120} value={hrEmployeeDraft.position} onChange={(event) => setHrEmployeeDraft((current) => ({ ...current, position: event.target.value }))} />
                          </label>
                          <label>
                            Eintrittsdatum
                            <input type="date" value={hrEmployeeDraft.startDate} onChange={(event) => setHrEmployeeDraft((current) => ({ ...current, startDate: event.target.value }))} />
                          </label>
                          <label>
                            Status
                            <select value={hrEmployeeDraft.status} onChange={(event) => setHrEmployeeDraft((current) => ({ ...current, status: event.target.value }))}>
                              <option>Aktiv</option>
                              <option>Abwesend</option>
                              <option>Ausgeschieden</option>
                            </select>
                          </label>
                          <label className="full-width">
                            Sozialversicherungsnummer (SV-Nummer)
                            <input
                              inputMode="text"
                              autoComplete="off"
                              maxLength={16}
                              value={hrEmployeeDraft.socialSecurityNumber}
                              onChange={(event) => setHrEmployeeDraft((current) => ({ ...current, socialSecurityNumber: event.target.value }))}
                              placeholder="z. B. 15 070649 C 103"
                            />
                            <small>Wird nur im entsperrten Admin-Formular angezeigt; die Prüfziffer wird geprüft.</small>
                          </label>
                        </div>
                        <div className="machinebau-form-actions">
                          <button type="button" className="secondary-button" onClick={() => { setHrEmployeeDraft(null); setEditingHrEmployeeId('') }}>Abbrechen</button>
                          <button type="submit" className="primary-button" disabled={hrSvBusy}>{hrSvBusy ? 'Verschlüsseln …' : 'Verschlüsselt speichern'}</button>
                        </div>
                      </form>
                    )}
                    {hrEmployees.length === 0 ? (
                      <div className="machinebau-empty-state">
                        <strong>Noch keine Mitarbeiter erfasst</strong>
                        <span>Lege einen Mitarbeiter an. Angaben werden erst nach dem Verschlüsseln synchronisiert.</span>
                      </div>
                    ) : (
                      <div className="machinebau-record-list">
                        {hrEmployees.map((employee) => (
                          <article className="machinebau-record" key={employee.id}>
                            <div className="machinebau-record-heading">
                              <div>
                                <span className="machinebau-record-type">{employee.reference || 'Mitarbeiter'}{employee.department ? ` · ${employee.department}` : ''}</span>
                                <h3>{employee.name}</h3>
                              </div>
                              <span className="machinebau-status">{employee.status}</span>
                            </div>
                            <div className="machinebau-record-meta">
                              {employee.position && <span>Tätigkeit: {employee.position}</span>}
                              {employee.startDate && <span>Eintritt: {employee.startDate}</span>}
                              <span>SV-Nummer: {hrSvNumbers[employee.id] ? 'verschlüsselt erfasst' : 'nicht erfasst'}</span>
                            </div>
                            <div className="machinebau-record-actions">
                              <button type="button" className="secondary-button small" onClick={() => openHrEmployeeEditor(employee)}>Bearbeiten</button>
                              <button type="button" className="danger-button small" onClick={() => removeHrEmployee(employee)} disabled={hrSvBusy}>Entfernen</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {hrSvMessage && <p className={hrSvPassphrase ? 'machinebau-privacy-note' : 'report-feedback'} role="status">{hrSvMessage}</p>}
              </section>
            )}

            <section className="stats-grid machinebau-stats">
              <article className="stat-card primary"><span>Anlagen</span><strong>{machinebauStats.assets}</strong><small>erfasste Maschinen</small></article>
              <article className="stat-card"><span>Offene Projekte</span><strong>{machinebauStats.projects}</strong><small>noch nicht abgeschlossen</small></article>
              <article className="stat-card"><span>Fertigungsaufträge</span><strong>{machinebauStats.workOrders}</strong><small>aktiv oder geplant</small></article>
              <article className={machinebauStats.overdue ? 'stat-card warning' : 'stat-card'}><span>Service / Wartung fällig</span><strong>{machinebauStats.overdue}</strong><small>Termin überschritten</small></article>
            </section>

            <section className="panel machinebau-panel">
              <div className="panel-header">
                <div>
                  <h2>Maschinenbau</h2>
                  <p className="meta">Projekte, Anlagen, Stücklisten, Fertigung, Wartung, Service, Qualität und Sicherheit an einem Ort.</p>
                </div>
                <button type="button" className="primary-button" onClick={() => openMachinebauEditor(machinebauTypeFilter === 'alle' ? 'projekt' : machinebauTypeFilter)}>
                  Eintrag anlegen
                </button>
              </div>

              {machinebauDraft && (
                <form className="machinebau-editor" onSubmit={saveMachinebauRecord}>
                  <div className="panel-header">
                    <div>
                      <h3>{editingMachinebauId ? 'Eintrag bearbeiten' : 'Neuen Eintrag anlegen'}</h3>
                      <p className="meta">Referenzen, Verantwortliche und Fälligkeiten helfen bei der Zuordnung.</p>
                    </div>
                    <button type="button" className="secondary-button small" onClick={() => { setMachinebauDraft(null); setEditingMachinebauId(''); setMachinebauMessage('') }}>Schließen</button>
                  </div>
                  <div className="form-grid">
                    <label>
                      Bereich
                      <select disabled={Boolean(editingMachinebauId)} value={machinebauDraft.type} onChange={(event) => {
                        const nextType = event.target.value
                        const definition = machinebauTypes.find((entry) => entry.value === nextType)
                        setMachinebauDraft((current) => ({ ...current, type: nextType, status: definition.statuses[0] }))
                      }}>
                        {machinebauTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    <label>
                      Titel / Bezeichnung
                      <input required maxLength={140} value={machinebauDraft.title} onChange={(event) => setMachinebauDraft((current) => ({ ...current, title: event.target.value }))} placeholder="z. B. CNC-Fräse 1 oder Gehäusefertigung" />
                    </label>
                    <label>
                      Nummer / Referenz
                      <input maxLength={100} value={machinebauDraft.reference} onChange={(event) => setMachinebauDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="z. B. Projekt-, Auftrags- oder Inventarnummer" />
                    </label>
                    <label>
                      Status
                      <select value={machinebauDraft.status} onChange={(event) => setMachinebauDraft((current) => ({ ...current, status: event.target.value }))}>
                        {(machinebauTypes.find((type) => type.value === machinebauDraft.type)?.statuses || []).map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    <label>
                      Verantwortlich
                      <input maxLength={100} value={machinebauDraft.responsible} onChange={(event) => setMachinebauDraft((current) => ({ ...current, responsible: event.target.value }))} placeholder="Name oder Team" />
                    </label>
                    <label>
                      Fälligkeits- / Prüftermin
                      <input type="date" value={machinebauDraft.dueDate} onChange={(event) => setMachinebauDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                    </label>
                    <label>
                      Zugehöriges Projekt
                      <select value={machinebauDraft.projectId} onChange={(event) => setMachinebauDraft((current) => ({ ...current, projectId: event.target.value }))}>
                        <option value="">Kein Projekt</option>
                        {machinebauRecords.filter((record) => record.type === 'projekt' && String(record.id) !== String(editingMachinebauId)).map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
                      </select>
                    </label>
                    <label>
                      Zugehörige Anlage
                      <select value={machinebauDraft.assetId} onChange={(event) => setMachinebauDraft((current) => ({ ...current, assetId: event.target.value }))}>
                        <option value="">Keine Anlage</option>
                        {machinebauRecords.filter((record) => record.type === 'anlage' && String(record.id) !== String(editingMachinebauId)).map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
                      </select>
                    </label>
                    {machinebauDraft.type === 'bericht' && (
                      <label className="full-width">
                        Zusammenfassung
                        <textarea maxLength={500} rows={2} value={machinebauDraft.summary} onChange={(event) => setMachinebauDraft((current) => ({ ...current, summary: event.target.value }))} placeholder="Kernaussage und offene Punkte" />
                      </label>
                    )}
                    <label className="full-width">
                      {machinebauDraft.type === 'bericht' ? 'Berichtstext' : 'Beschreibung / Material / Arbeitsschritte'}
                      <textarea
                        required={machinebauDraft.type === 'bericht'}
                        maxLength={machinebauDraft.type === 'bericht' ? 30000 : 15000}
                        rows={machinebauDraft.type === 'bericht' ? 12 : 6}
                        value={machinebauDraft.details}
                        onChange={(event) => setMachinebauDraft((current) => ({ ...current, details: event.target.value }))}
                        placeholder={machinebauDraft.type === 'stueckliste'
                          ? 'Bauteil | Menge | Einheit | Artikel-/Zeichnungsnummer\nz. B. Lager 6204 | 2 | Stück | DIN 625'
                          : 'Aufgabe, technische Angaben, Maßnahmen, Prüfpunkte oder Notizen'}
                      />
                    </label>
                  </div>
                  {machinebauDraft.type !== 'bericht' && (
                    <div className="machinebau-ai-action">
                      <button type="button" className="secondary-button" disabled={machinebauAiLoading} onClick={draftMachinebauAiReport}>
                        {machinebauAiLoading ? 'KI erstellt Entwurf …' : 'KI-Bericht aus diesem Eintrag erstellen'}
                      </button>
                      <small>Die eingegebenen Angaben werden zur Erstellung an Firebase AI (Google) übermittelt. KI-Entwürfe vor Verwendung fachlich prüfen.</small>
                    </div>
                  )}
                  {machinebauMessage && <p className="report-feedback" role="alert">{machinebauMessage}</p>}
                  <div className="machinebau-form-actions">
                    <button type="button" className="secondary-button" onClick={() => { setMachinebauDraft(null); setEditingMachinebauId('') }}>Abbrechen</button>
                    <button type="submit" className="primary-button">{editingMachinebauId ? 'Änderungen speichern' : 'Eintrag speichern'}</button>
                  </div>
                </form>
              )}

              <div className="machinebau-list-tools">
                <label>
                  Suchen
                  <input type="search" value={machinebauSearch} onChange={(event) => setMachinebauSearch(event.target.value)} placeholder="Titel, Nummer, Status oder Details" />
                </label>
                <label>
                  Bereich filtern
                  <select value={machinebauTypeFilter} onChange={(event) => setMachinebauTypeFilter(event.target.value)}>
                    <option value="alle">Alle Bereiche</option>
                    {machinebauTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
              </div>

              {filteredMachinebauRecords.length === 0 ? (
                <div className="machinebau-empty-state">
                  <strong>Noch keine passenden Einträge</strong>
                  <span>Lege ein Projekt, eine Anlage oder einen Fertigungs- bzw. Serviceauftrag an.</span>
                  <button type="button" className="secondary-button" onClick={() => openMachinebauEditor(machinebauTypeFilter === 'alle' ? 'projekt' : machinebauTypeFilter)}>Ersten Eintrag anlegen</button>
                </div>
              ) : (
                <div className="machinebau-record-list">
                  {filteredMachinebauRecords.map((record) => {
                    const typeLabel = machinebauTypes.find((type) => type.value === record.type)?.label || 'Maschinenbau'
                    const project = machinebauRecords.find((entry) => entry.type === 'projekt' && String(entry.id) === String(record.projectId))
                    const asset = machinebauRecords.find((entry) => entry.type === 'anlage' && String(entry.id) === String(record.assetId))
                    return (
                      <article className="machinebau-record" key={record.id}>
                        <div className="machinebau-record-heading">
                          <div>
                            <span className="machinebau-record-type">{typeLabel}{record.reference ? ` · ${record.reference}` : ''}</span>
                            <h3>{record.title}</h3>
                          </div>
                          <span className="machinebau-status">{record.status}</span>
                        </div>
                        {(record.responsible || record.dueDate || project || asset) && (
                          <div className="machinebau-record-meta">
                            {record.responsible && <span>Verantwortlich: {record.responsible}</span>}
                            {record.dueDate && <span>Termin: {record.dueDate}</span>}
                            {project && <span>Projekt: {project.title}</span>}
                            {asset && <span>Anlage: {asset.title}</span>}
                          </div>
                        )}
                        {record.summary && <p className="machinebau-record-summary">{record.summary}</p>}
                        {record.details && <p className="machinebau-record-details">{record.details.slice(0, 360)}{record.details.length > 360 ? ' …' : ''}</p>}
                        <div className="machinebau-record-actions">
                          <button type="button" className="secondary-button small" onClick={() => openMachinebauEditor(record.type, record)}>Bearbeiten</button>
                          <button type="button" className="danger-button small" onClick={() => removeMachinebauRecord(record)}>{requiresDeleteApproval ? 'Löschanfrage' : 'Löschen'}</button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'dashboard' && (
          <>
            <section className="stats-grid">
              <article className="stat-card primary">
                <span>Produkte</span>
                <strong>{totals.activeProducts}</strong>
                <small>im Sortiment</small>
              </article>
              <article className="stat-card">
                <span>Rezepturen</span>
                <strong>{totals.activeRecipes}</strong>
                <small>aktiv und freigegeben</small>
              </article>
              <article className="stat-card">
                <span>Bestellungen</span>
                <strong>{totals.openOrders}</strong>
                <small>offene Aufträge</small>
              </article>
              <article className="stat-card warning">
                <span>Nachbestellungen</span>
                <strong>{totals.critical}</strong>
                <small>kritische Materialien</small>
              </article>
              <button type="button" className="stat-card stock-stat-card" onClick={() => setActiveTab('lager')}>
                <span>Verfügbare Dosen</span>
                <strong>{totals.trackedBottleProductCount ? totals.availableBottles.toLocaleString('de-DE') : '–'}</strong>
                <small>{totals.trackedBottleProductCount} von {products.length} Produkten erfasst · manuelle Pflege</small>
              </button>
              <article className="stat-card primary">
                <span>Umsatz brutto gesamt</span>
                <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.gross)}</strong>
                <small>{revenueAnalytics.invoiceCount} gültige Rechnungen</small>
              </article>
              <article className="stat-card">
                <span>Umsatz netto gesamt</span>
                <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.net)}</strong>
                <small>ohne Entwürfe und Stornos</small>
              </article>
              <article className="stat-card">
                <span>Bereits bezahlt</span>
                <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.paid)}</strong>
                <small>bezahlte Rechnungen</small>
              </article>
              <article className="stat-card warning">
                <span>Offene Forderungen</span>
                <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.outstanding)}</strong>
                <small>noch nicht bezahlt</small>
              </article>
            </section>

            <section className="panel revenue-chart-panel">
              <div className="panel-header">
                <div>
                  <h2>Umsatz der letzten 12 Monate</h2>
                  <p className="meta">Monatlicher Bruttoumsatz aus gültigen Rechnungen</p>
                </div>
                <strong>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.gross)}</strong>
              </div>
              <div className="revenue-chart-scroll">
                <div className="revenue-chart" role="img" aria-label="Bruttoumsatz je Monat der letzten zwölf Monate">
                  {monthlyRevenue.values.map((month) => {
                    const barHeight = monthlyRevenue.maximum > 0 ? month.gross / monthlyRevenue.maximum * 100 : 0
                    const formattedGross = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(month.gross)
                    return (
                      <div className="revenue-chart-column" key={month.key} title={`${month.label}: ${formattedGross} aus ${month.count} Rechnungen`} aria-label={`${month.label}: ${formattedGross}, ${month.count} Rechnungen`}>
                        <span className="revenue-chart-value">{month.gross > 0 ? formattedGross : '–'}</span>
                        <div className="revenue-chart-track"><div className="revenue-chart-fill" style={{ height: `${barHeight}%` }} /></div>
                        <small>{month.label}</small>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            <section className="dashboard-grid">
              <div className="panel">
                <div className="panel-header">
                  <h2>Aktive Produktion</h2>
                  <span>{activeProductionOrders.length} laufend</span>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Kunde</th>
                        <th>Produkt</th>
                        <th>Dosen</th>
                        <th>Trays</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeProductionOrders.map((order) => (
                        <tr key={order.id}>
                          <td>{order.customer}</td>
                          <td>{order.product}</td>
                          <td>{order.bottleCount ?? '-'}</td>
                          <td>{order.crateCount ?? '-'}</td>
                          <td><span className="status-badge">{order.status}</span></td>
                        </tr>
                      ))}
                      {activeProductionOrders.length === 0 && <tr><td colSpan="5">Derzeit keine aktive Produktion.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Bestandsüberblick</h2>
                  <span>Lager</span>
                </div>
                <div className="inventory-list">
                  {inventory.map((item) => (
                    <div key={item.item} className="inventory-item">
                      <div>
                        <strong>{item.item}</strong>
                        <small>{item.status}</small>
                      </div>
                      <span>{item.stock}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'kunden' && (
          <>
          <Suspense fallback={<section className="panel customer-map-panel">Europa-Karte wird geladen …</section>}>
            <CustomerMap customers={customers} />
          </Suspense>
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>{editingCustomerId === null ? 'Kunde anlegen' : 'Kunde bearbeiten'}</h2>
                <span>Kundenstamm</span>
              </div>
              <form className="form-grid" onSubmit={saveCustomer}>
                <label className="full-width">
                  Firmen- oder Kundenname
                  <input type="text" value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} required />
                </label>
                <label>
                  Ansprechpartner
                  <input type="text" value={customerForm.contactName} onChange={(event) => setCustomerForm((current) => ({ ...current, contactName: event.target.value }))} />
                </label>
                <label>
                  E-Mail
                  <input type="text" inputMode="email" value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} />
                </label>
                <label>
                  Telefon
                  <input type="tel" value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} />
                </label>
                <label>
                  USt-IdNr.
                  <input type="text" value={customerForm.vatId} onChange={(event) => setCustomerForm((current) => ({ ...current, vatId: event.target.value }))} />
                </label>
                <label className="full-width">
                  Rechnungsadresse
                  <textarea value={customerForm.address} onChange={(event) => setCustomerForm((current) => ({ ...current, address: event.target.value }))} placeholder={'Straße und Hausnummer\nPLZ Ort'} />
                </label>
                <label className="full-width">
                  Lieferadresse (optional)
                  <textarea value={customerForm.shippingAddress} onChange={(event) => setCustomerForm((current) => ({ ...current, shippingAddress: event.target.value }))} placeholder="Leer lassen, wenn sie der Rechnungsadresse entspricht" />
                </label>
                <label>
                  Zahlungsziel
                  <input type="text" value={customerForm.paymentTerms} onChange={(event) => setCustomerForm((current) => ({ ...current, paymentTerms: event.target.value }))} placeholder="z. B. 14 Tage netto" />
                </label>
                <label>
                  Bevorzugte Zahlungsart
                  <select value={customerForm.paymentMethod} onChange={(event) => setCustomerForm((current) => ({ ...current, paymentMethod: event.target.value }))}>
                    <option value="">Nicht festgelegt</option>
                    {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </label>
                <label className="full-width">
                  IBAN (optional, sensible Bankdaten)
                  <input type="text" autoComplete="off" value={customerForm.iban} onChange={(event) => setCustomerForm((current) => ({ ...current, iban: event.target.value }))} placeholder="DE00 0000 0000 0000 0000 00" />
                </label>
                <label className="full-width">
                  Interne Notizen
                  <textarea value={customerForm.notes} onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="Nur für dein Team sichtbar" />
                </label>
                <button type="submit" className="primary-button full-width-button">{editingCustomerId === null ? 'Kunde speichern' : 'Änderungen speichern'}</button>
                {editingCustomerId !== null && (
                  <button type="button" className="secondary-button full-width-button" onClick={() => {
                    setCustomerForm(initialCustomerForm)
                    setEditingCustomerId(null)
                  }}>Abbrechen</button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Kundenliste</h2>
                <div className="header-actions">
                  <span>{revenueAnalytics.customers.length} Kunden</span>
                  <button type="button" className="secondary-button small" onClick={exportCustomerList}>CSV exportieren</button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Kunde</th><th>Anschrift</th><th>Rechnungen</th><th>Umsatz brutto</th><th></th></tr></thead>
                  <tbody>
                    {revenueAnalytics.customers.map((customer) => {
                      const savedCustomer = customers.find((entry) => entry.name.toLocaleLowerCase() === customer.name.toLocaleLowerCase())
                      return (
                      <tr key={customer.name}>
                        <td><button type="button" className="customer-name-link" onClick={() => {
                          setViewingCustomer({ ...savedCustomer, ...customer, ...(savedCustomer || {}) })
                          setCustomerIbanVisible(false)
                        }}>{customer.name}</button></td>
                        <td>{customer.address || '–'}</td>
                        <td>{customer.invoiceCount}</td>
                        <td>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(customer.gross)}</td>
                        <td className="customer-row-actions">
                          <button type="button" className="secondary-button small" onClick={() => {
                            setViewingCustomer({ ...customer, ...savedCustomer })
                            setCustomerIbanVisible(false)
                          }}>Profil</button>
                          {savedCustomer && <button type="button" className="secondary-button small" onClick={() => editCustomer({ ...customer, ...savedCustomer })}>Bearbeiten</button>}
                          {savedCustomer && currentUser?.role === 'admin' && <button type="button" className="danger-button small" onClick={() => deleteCustomer(savedCustomer)}>Löschen</button>}
                        </td>
                      </tr>
                    )})}
                    {revenueAnalytics.customers.length === 0 && <tr><td colSpan="5">Noch keine Kunden vorhanden.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          </>
        )}

        {activeTab === 'analyse' && (
          <>
          <section className="panel sales-target-panel">
            <div className="panel-header">
              <div>
                <h2>Dosen-Verkaufsziel</h2>
                <p className="meta">Fortschritt basiert auf ausgestellten Rechnungen; Entwürfe und Stornos zählen nicht.</p>
              </div>
            </div>
            <form className="sales-target-form" onSubmit={saveSalesTarget}>
              <label>
                Zielanzahl Dosen
                <input type="number" min="1" max="1000000000" step="1" value={salesTargetDraft} onChange={(event) => { setSalesTargetDraft(event.target.value); setSalesTargetMessage('') }} placeholder="z. B. 10.000" required />
              </label>
              <button className="primary-button" type="submit" disabled={currentUser?.role !== 'admin' && !currentUser?.permissions?.includes('analyse')}>Ziel speichern</button>
            </form>
            {salesTargetMessage && <p className="form-message">{salesTargetMessage}</p>}
            {salesTarget[0]?.targetBottles > 0 && (
              <div className="sales-target-progress">
                <div className="sales-target-progress-label">
                  <strong>{totalSoldBottles.toLocaleString('de-DE')} / {salesTarget[0].targetBottles.toLocaleString('de-DE')} Dosen</strong>
                  <span>{Math.min(100, Math.round(totalSoldBottles / salesTarget[0].targetBottles * 100))}%</span>
                </div>
                <div className="sales-target-progress-track">
                  <span style={{ width: `${Math.min(100, totalSoldBottles / salesTarget[0].targetBottles * 100)}%` }} />
                </div>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Umsatzanalyse nach Kunde</h2>
                <p className="meta">Berücksichtigt gültige Rechnungen; Entwürfe, Angebote und Stornos sind ausgeschlossen.</p>
              </div>
              <button type="button" className="secondary-button small" onClick={exportCustomerList}>CSV exportieren</button>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Kunde</th><th>Rechnungen</th><th>Netto</th><th>Brutto</th><th>Bezahlt</th><th>Offen</th></tr></thead>
                <tbody>
                  {revenueAnalytics.customers.map((customer) => (
                    <tr key={customer.name}>
                      <td>{customer.name}</td>
                      <td>{customer.invoiceCount}</td>
                      <td>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(customer.net)}</td>
                      <td>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(customer.gross)}</td>
                      <td>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(customer.paid)}</td>
                      <td>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(customer.outstanding)}</td>
                    </tr>
                  ))}
                  {revenueAnalytics.customers.length === 0 && <tr><td colSpan="6">Noch keine Kunden oder Rechnungen vorhanden.</td></tr>}
                </tbody>
                <tfoot><tr>
                  <th>Gesamt</th>
                  <th>{revenueAnalytics.invoiceCount}</th>
                  <th>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.net)}</th>
                  <th>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.gross)}</th>
                  <th>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.paid)}</th>
                  <th>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(revenueAnalytics.outstanding)}</th>
                </tr></tfoot>
              </table>
            </div>
          </section>
          </>
        )}

        {activeTab === 'kalkulation' && currentUser?.role === 'admin' && (
          <section className="finance-workspace production-calculation-workspace">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>{editingProductionCalculationId ? 'Kalkulation bearbeiten' : 'Getränkekalkulation'}</h2>
                  <p className="meta">Herstellkosten pro Charge, Verkaufspreis, Marge und Break-even berechnen.</p>
                </div>
                <span>Admin · Cloud-Sync</span>
              </div>
              <form className="form-grid production-calculation-form" onSubmit={saveProductionCalculation}>
                <label>
                  Name der Kalkulation
                  <input name="title" value={productionCalculationForm.title} onChange={handleProductionCalculationInput} placeholder="z. B. Mango Spark Charge 06/2026" required />
                </label>
                <label>
                  Produkt zuordnen (optional)
                  <select name="productId" value={productionCalculationForm.productId} onChange={handleProductionCalculationInput}>
                    <option value="">Kein Produkt zugeordnet</option>
                    {products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}</option>)}
                  </select>
                </label>
                <label>
                  Ausbringungsmenge pro Charge (Dosen)
                  <input name="batchBottles" type="number" min="1" step="1" value={productionCalculationForm.batchBottles} onChange={handleProductionCalculationInput} required />
                </label>
                <label>
                  Dosen pro Tray
                  <input name="bottlesPerCrate" type="number" min="1" max="1000" step="1" value={productionCalculationForm.bottlesPerCrate} onChange={handleProductionCalculationInput} required />
                </label>
                <label>
                  Zielmarge (%)
                  <input name="targetMarginPercent" type="text" inputMode="decimal" value={productionCalculationForm.targetMarginPercent} onChange={handleProductionCalculationInput} required />
                </label>
                <label>
                  Mehrwertsteuer
                  <select name="vatRate" value={productionCalculationForm.vatRate} onChange={handleProductionCalculationInput}>
                    <option value="19">19 %</option>
                    <option value="7">7 %</option>
                    <option value="0">0 %</option>
                  </select>
                </label>

                <div className="offer-analysis-uploader full-width">
                  <strong>Lieferantenangebot analysieren</strong>
                  <label>
                    Angebot hochladen (PDF, PNG, JPG oder WEBP · max. 10 MB)
                    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp" onChange={analyzeOfferFile} disabled={offerAnalysisLoading} />
                  </label>
                  <small>Die Angebotsdatei wird zur Analyse an Gemini übermittelt und anschließend nicht in der App gespeichert. Erkannte Angebotsdaten werden mit der Kalkulation synchronisiert. Preise und Mengen bitte vor dem Übernehmen prüfen.</small>
                  {offerAnalysisLoading && <p role="status">Angebot wird analysiert …</p>}
                  {productionCalculationForm.offerAnalysis && (
                    <div className="offer-analysis-result">
                      <div className="panel-header">
                        <div>
                          <strong>{productionCalculationForm.offerAnalysis.supplierName || productionCalculationForm.offerAnalysis.fileName}</strong>
                          <small>
                            {[productionCalculationForm.offerAnalysis.offerNumber, productionCalculationForm.offerAnalysis.offerDate, productionCalculationForm.offerAnalysis.currency].filter(Boolean).join(' · ') || 'Angebotsdaten erkannt'}
                          </small>
                        </div>
                        <button type="button" className="secondary-button small" onClick={applyOfferAnalysis} disabled={productionCalculationForm.offerAnalysis.applied}>
                          {productionCalculationForm.offerAnalysis.applied ? 'Positionen übernommen' : 'Erkannte Nettopositionen übernehmen'}
                        </button>
                      </div>
                      <p>{productionCalculationForm.offerAnalysis.summary}</p>
                      <small>Angebotsmengen werden nicht als Chargenverbrauch übernommen. Nach der Übernahme den tatsächlichen Verbrauch je Charge ergänzen.</small>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Position</th><th>Menge</th><th>Preis netto / Einheit</th><th>Preisart</th><th>Sicherheit</th></tr></thead>
                          <tbody>
                            {productionCalculationForm.offerAnalysis.items.map((item, index) => (
                              <tr key={`${item.name}-${index}`}>
                                <td>{item.name}{item.notes && <small className="table-subtext">{item.notes}</small>}</td>
                                <td>{item.quantity} {item.unit}</td>
                                <td>{item.unitPriceNet > 0 ? `${Number(item.unitPriceNet).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${productionCalculationForm.offerAnalysis.currency || ''}` : 'Nicht verlässlich erkannt'}</td>
                                <td>{item.priceBasis}</td>
                                <td>{item.confidence}</td>
                              </tr>
                            ))}
                            {productionCalculationForm.offerAnalysis.items.length === 0 && <tr><td colSpan="5">Keine Positionen erkannt. Angaben bitte manuell erfassen.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      {productionCalculationForm.offerAnalysis.warnings?.length > 0 && (
                        <ul className="offer-analysis-warnings">
                          {productionCalculationForm.offerAnalysis.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {['ingredients', 'packaging'].map((group) => {
                  const isIngredient = group === 'ingredients'
                  const title = isIngredient ? 'Zutaten und Rohstoffe' : 'Verpackung'
                  const lines = productionCalculationForm[group]
                  return (
                    <fieldset className="production-cost-group full-width" key={group}>
                      <legend>{title}</legend>
                      <p className="meta">Kosten für die tatsächlich in dieser Charge eingesetzte Menge. Einkaufspreis je Mengeneinheit in EUR netto.</p>
                      {lines.map((line, index) => (
                        <div className="production-cost-line" key={`${group}-${index}`}>
                          <label>
                            Bezeichnung
                            <input value={line.name} onChange={(event) => updateProductionCostLine(group, index, 'name', event.target.value)} placeholder={isIngredient ? 'z. B. Saftkonzentrat' : 'z. B. Dose'} />
                          </label>
                          <label>
                            Chargenmenge
                            <input type="text" inputMode="decimal" value={line.amount} onChange={(event) => updateProductionCostLine(group, index, 'amount', event.target.value)} placeholder="z. B. 12" />
                          </label>
                          <label>
                            Einheit
                            <input value={line.unit} onChange={(event) => updateProductionCostLine(group, index, 'unit', event.target.value)} placeholder="kg, l, Stück" />
                          </label>
                          <label>
                            Einkaufspreis je Einheit (€)
                            <input type="text" inputMode="decimal" value={line.unitPrice} onChange={(event) => updateProductionCostLine(group, index, 'unitPrice', event.target.value)} placeholder="z. B. 3,50" />
                          </label>
                          <button type="button" className="danger-button small" aria-label={`${title}position ${index + 1} entfernen`} onClick={() => setProductionCalculationForm((current) => ({ ...current, [group]: current[group].filter((_, lineIndex) => lineIndex !== index) }))}>Entfernen</button>
                        </div>
                      ))}
                      <button type="button" className="secondary-button small" onClick={() => addProductionCostLine(group)}>+ Position hinzufügen</button>
                    </fieldset>
                  )
                })}

                <label>
                  Arbeitskosten pro Charge (€)
                  <input type="text" inputMode="decimal" name="laborCost" value={productionCalculationForm.laborCost} onChange={handleProductionCalculationInput} placeholder="z. B. 85,00" />
                </label>
                <label>
                  Fixkosten / Gemeinkosten pro Charge (€)
                  <input type="text" inputMode="decimal" name="overheadCost" value={productionCalculationForm.overheadCost} onChange={handleProductionCalculationInput} placeholder="z. B. 120,00" />
                </label>

                <div className="production-calculation-results full-width" aria-live="polite">
                  <h3>Berechnung</h3>
                  {productionCalculationPreview ? (
                    <div className="finance-summary-grid">
                      <div><span>Selbstkosten pro Charge</span><strong>{formatFinanceEuro(productionCalculationPreview.totalCostCents)}</strong></div>
                      <div><span>Selbstkosten pro Dose</span><strong>{formatFinanceEuro(productionCalculationPreview.unitCostCents)}</strong></div>
                      <div><span>Selbstkosten pro {productionCalculationPreview.bottlesPerCrate}er-Tray</span><strong>{formatFinanceEuro(productionCalculationPreview.crateCostCents)}</strong></div>
                      <div><span>Verkaufspreis netto pro Dose</span><strong>{formatFinanceEuro(productionCalculationPreview.targetSellingPriceNetCents)}</strong></div>
                      <div><span>Verkaufspreis brutto pro Dose</span><strong>{formatFinanceEuro(productionCalculationPreview.targetSellingPriceGrossCents)}</strong></div>
                      <div><span>Verkaufspreis netto / brutto pro Tray</span><strong>{formatFinanceEuro(productionCalculationPreview.crateSellingPriceNetCents)} / {formatFinanceEuro(productionCalculationPreview.crateSellingPriceGrossCents)}</strong></div>
                      <div><span>MwSt. pro Dose</span><strong>{formatFinanceEuro(productionCalculationPreview.targetSellingPriceGrossCents - productionCalculationPreview.targetSellingPriceNetCents)}</strong></div>
                      <div><span>Umsatz netto / brutto pro Charge</span><strong>{formatFinanceEuro(productionCalculationPreview.batchSellingPriceNetCents)} / {formatFinanceEuro(productionCalculationPreview.batchSellingPriceGrossCents)}</strong></div>
                      <div><span>MwSt. pro Charge</span><strong>{formatFinanceEuro(productionCalculationPreview.batchVatCents)}</strong></div>
                      <div><span>Gewinn pro Charge</span><strong>{formatFinanceEuro(productionCalculationPreview.batchProfitCents)}</strong></div>
                      <div><span>Erzielte Marge</span><strong>{productionCalculationPreview.marginPercent.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %</strong></div>
                      <div><span>Break-even</span><strong>{productionCalculationPreview.breakEvenBottles === 0 ? 'Keine Fixkosten' : `${productionCalculationPreview.breakEvenBottles ?? 'Nicht erreichbar'} Dosen`}</strong></div>
                    </div>
                  ) : <p>Kostenpositionen, Abfüllmenge und Zielmarge ergänzen, um die Berechnung anzuzeigen.</p>}
                </div>

                {productionCalculationMessage && <p className="full-width" role="status">{productionCalculationMessage}</p>}
                <div className="production-calculation-actions full-width">
                  <button type="submit" className="primary-button">{editingProductionCalculationId ? 'Änderungen speichern' : 'Kalkulation speichern'}</button>
                  {editingProductionCalculationId && (
                    <button type="button" className="secondary-button" onClick={() => {
                      setEditingProductionCalculationId('')
                      setProductionCalculationForm(createProductionCalculationForm())
                      setProductionCalculationMessage('')
                    }}>Abbrechen</button>
                  )}
                </div>
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Gespeicherte Kalkulationen</h2>
                <span>{productionCalculations.length} Einträge</span>
              </div>
              {productionCalculations.length === 0 ? <p>Noch keine Kalkulationen gespeichert.</p> : (
                <div className="card-list">
                  {productionCalculations.map((calculation) => {
                    let result
                    try {
                      result = calculateProductionCost(calculation)
                    } catch {
                      result = null
                    }
                    return (
                      <article className="mini-card" key={calculation.id}>
                        <div className="mini-head">
                          <h3>{calculation.title}</h3>
                          <span className="pill">{calculation.batchBottles} Dosen / Charge</span>
                        </div>
                        {calculation.productName && <p>Produkt: {calculation.productName}</p>}
                        {result
                          ? <p>Selbstkosten {formatFinanceEuro(result.unitCostCents)} / Dose · {formatFinanceEuro(result.crateCostCents)} / {result.bottlesPerCrate}er-Tray · Verkauf netto {formatFinanceEuro(result.targetSellingPriceNetCents)} · Gewinn {formatFinanceEuro(result.batchProfitCents)} / Charge</p>
                          : <p>Gespeicherte Eingaben sind ungültig und müssen bearbeitet werden.</p>}
                        {calculation.offerAnalysis && <p>Angebot: {calculation.offerAnalysis.fileName || calculation.offerAnalysis.supplierName} · analysiert {formatTimestamp(calculation.offerAnalysis.analyzedAt)}</p>}
                        <small>Zuletzt geändert: {formatTimestamp(calculation.updatedAt)}</small>
                        <div className="mini-actions">
                          <button type="button" className="secondary-button small" onClick={() => editProductionCalculation(calculation)}>Bearbeiten</button>
                          <button type="button" className="danger-button small" onClick={() => removeProductionCalculation(calculation)}>Löschen</button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'finanzen' && canManageFinance(currentUser) && (
          <section className="finance-workspace">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Finanzbuchungen</h2>
                  <p className="meta">Für Admins und gezielt berechtigte Mitarbeiter · Einnahmen und Ausgaben nach Zahlungsdatum (Ist-Versteuerung).</p>
                </div>
                <div className="header-actions">
                  <button type="button" className="secondary-button small" onClick={exportFinanceCsv}>CSV exportieren</button>
                  <button type="button" className="secondary-button small" onClick={exportDatevPreparation}>DATEV-Vorbereitung</button>
                  <button type="button" className="secondary-button small" onClick={printFinanceReport}>Drucken / PDF</button>
                </div>
              </div>
              <div className="finance-notice" role="note">
                Die Monatsauswertung ist eine vereinfachte Vorbereitung, keine amtliche Umsatzsteuervoranmeldung und keine zertifizierte BWA. Die DATEV-Übergabe ist eine CSV-Arbeitshilfe, kein ungeprüft importierbarer DATEV-Buchungsstapel. Bitte Kontierung, Steuerbehandlung und Import mit dem Steuerbüro abstimmen; die Voranmeldung weiterhin manuell in Mein ELSTER einreichen.
              </div>
              <form className="form-grid finance-entry-form" onSubmit={saveFinanceEntry}>
                <label>
                  Buchungsart
                  <select value={financeEntryForm.type} onChange={(event) => {
                    const type = event.target.value
                    const category = financeCategories[type][0]
                    setFinanceEntryForm((current) => ({
                      ...current,
                      type,
                      category,
                      accountNumber: getSkr03AccountSuggestion({ type, category, vatRate: current.vatRate }),
                    }))
                  }}>
                    <option value="expense">Ausgabe</option>
                    <option value="income">Einnahme</option>
                  </select>
                </label>
                <label>
                  Kategorie
                  <select value={financeEntryForm.category} onChange={(event) => setFinanceEntryForm((current) => ({
                    ...current,
                    category: event.target.value,
                    accountNumber: getSkr03AccountSuggestion({ type: current.type, category: event.target.value, vatRate: current.vatRate }),
                  }))}>
                    {financeCategories[financeEntryForm.type].map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  Belegdatum
                  <input type="date" required value={financeEntryForm.date} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, date: event.target.value }))} />
                </label>
                <label>
                  Zahlungsdatum
                  <input type="date" value={financeEntryForm.paidAt} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, paidAt: event.target.value }))} />
                  <small>Leer lassen, wenn noch nicht bezahlt.</small>
                </label>
                <label>
                  Bruttobetrag (€)
                  <input type="number" inputMode="decimal" min="0.01" step="0.01" required value={financeEntryForm.grossAmount} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, grossAmount: event.target.value }))} />
                </label>
                <label>
                  Umsatzsteuersatz
                  <select value={financeEntryForm.vatRate} onChange={(event) => setFinanceEntryForm((current) => {
                    const previousSuggestion = getSkr03AccountSuggestion(current)
                    return {
                      ...current,
                      vatRate: event.target.value,
                      accountNumber: !current.accountNumber || current.accountNumber === previousSuggestion
                        ? getSkr03AccountSuggestion({ ...current, vatRate: event.target.value })
                        : current.accountNumber,
                    }
                  })}>
                    <option value="19">19 %</option>
                    <option value="7">7 %</option>
                    <option value="0">0 %</option>
                  </select>
                </label>
                <label>
                  Beschreibung
                  <input type="text" maxLength="200" required value={financeEntryForm.description} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, description: event.target.value }))} placeholder="z. B. Wareneinkauf Oktober" />
                </label>
                <label>
                  Geschäftspartner
                  <input type="text" maxLength="160" value={financeEntryForm.counterparty} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, counterparty: event.target.value }))} />
                </label>
                <label>
                  Belegnummer
                  <input type="text" maxLength="80" value={financeEntryForm.documentNumber} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, documentNumber: event.target.value }))} />
                </label>
                <label>
                  Sachkonto (SKR03)
                  <input type="text" inputMode="numeric" pattern="[0-9]{4,6}" maxLength="6" value={financeEntryForm.accountNumber} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, accountNumber: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="z. B. 8400" />
                  <small>Für den DATEV-Export erforderlich. Vorschlag 8400 / 8300 gilt nur für Warenverkauf mit 19 % / 7 % Umsatzsteuer; Kontierung mit Steuerbüro prüfen.</small>
                </label>
                <label className="finance-receipt-check">
                  <input type="checkbox" checked={financeEntryForm.receiptAvailable} onChange={(event) => setFinanceEntryForm((current) => ({ ...current, receiptAvailable: event.target.checked }))} />
                  Beleg liegt vor (für Vorsteuer)
                </label>
                <label>
                  Belege hochladen
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple onChange={handleFinanceReceiptFiles} />
                  <small>PDF, JPG oder PNG · maximal 10 MB je Datei · bis zu fünf Belege je Buchung</small>
                  {financeReceiptFiles.length > 0 && <small>{financeReceiptFiles.map((file) => file.name).join(', ')}</small>}
                </label>
                <div className="finance-form-actions">
                  <button type="submit" className="primary-button" disabled={financeEntrySaving}>{financeEntrySaving ? 'Speichert …' : editingFinanceEntryId ? 'Änderung speichern' : 'Buchung erfassen'}</button>
                  {editingFinanceEntryId && <button type="button" className="secondary-button" disabled={financeEntrySaving} onClick={() => {
                    setEditingFinanceEntryId('')
                    setFinanceEntryForm(createFinanceEntryForm())
                    setFinanceReceiptFiles([])
                  }}>Abbrechen</button>}
                </div>
                {financeMessage && <p className="form-feedback full-width">{financeMessage}</p>}
              </form>
            </div>

            {currentUser?.role === 'admin' && (
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>ELSTER / ERiC vorbereiten</h2>
                    <p className="meta">Steuer- und Herstellerangaben für eine mögliche spätere Anbindung</p>
                  </div>
                  <span>{elsterSetup.developerStatus === 'approved' ? 'Hersteller freigeschaltet' : 'Noch nicht verbunden'}</span>
                </div>
                <div className="finance-notice" role="note">
                  Die Herstellerregistrierung und Freigabe durch ELSTER sind Voraussetzung für ERiC. ELSTER Secure ist hier als gewünschte Login-Methode vorgemerkt, aber eine ERiC-Unterstützung ist noch nicht bestätigt. Es erfolgt keine Übermittlung an ELSTER. Bitte keine Passwörter, Zertifikatsdateien oder privaten Schlüssel eintragen.
                </div>
                <form className="form-grid finance-entry-form" onSubmit={saveElsterSetup}>
                    <label>
                      Firmenname / steuerpflichtiger Name
                      <input type="text" maxLength="160" value={elsterSetup.businessName} onChange={(event) => setElsterSetup((current) => ({ ...current, businessName: event.target.value }))} />
                    </label>
                    <label>
                      Steuernummer
                      <input type="text" maxLength="40" autoComplete="off" value={elsterSetup.taxNumber} onChange={(event) => setElsterSetup((current) => ({ ...current, taxNumber: event.target.value }))} />
                    </label>
                    <label>
                      Zuständiges Finanzamt
                      <input type="text" maxLength="120" value={elsterSetup.taxOffice} onChange={(event) => setElsterSetup((current) => ({ ...current, taxOffice: event.target.value }))} />
                    </label>
                    <label>
                      Bundesland
                      <select value={elsterSetup.federalState} onChange={(event) => setElsterSetup((current) => ({ ...current, federalState: event.target.value }))}>
                        <option value="">Bitte auswählen</option>
                        {['Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'].map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      UStVA-Zeitraum laut Finanzamt
                      <select value={elsterSetup.filingPeriod} onChange={(event) => setElsterSetup((current) => ({ ...current, filingPeriod: event.target.value }))}>
                        <option value="monthly">Monatlich</option>
                        <option value="quarterly">Vierteljährlich</option>
                      </select>
                    </label>
                    <label>
                      ELSTER-Herstellerregistrierung
                      <select value={elsterSetup.developerStatus} onChange={(event) => setElsterSetup((current) => ({ ...current, developerStatus: event.target.value }))}>
                        <option value="not-started">Noch nicht beantragt</option>
                        <option value="applied">Beantragt / in Prüfung</option>
                        <option value="approved">Freigeschaltet</option>
                      </select>
                    </label>
                    <label>
                      Hersteller-ID (falls zugeteilt)
                      <input type="text" maxLength="80" autoComplete="off" value={elsterSetup.manufacturerId} onChange={(event) => setElsterSetup((current) => ({ ...current, manufacturerId: event.target.value }))} />
                    </label>
                    <label>
                      ERiC-Version (falls bekannt)
                      <input type="text" maxLength="40" value={elsterSetup.ericVersion} onChange={(event) => setElsterSetup((current) => ({ ...current, ericVersion: event.target.value }))} placeholder="Noch nicht eingerichtet" />
                    </label>
                    <div className="finance-form-actions">
                      <button type="submit" className="primary-button" disabled={elsterSetupSaving}>{elsterSetupSaving ? 'Speichert …' : 'Vorbereitung speichern'}</button>
                    </div>
                    {elsterSetupMessage && <p className="form-feedback full-width" role="status">{elsterSetupMessage}</p>}
                    <p className="meta full-width">Die Angaben einschließlich Steuernummer werden mit der Cloud synchronisiert und sind in der App nur für Admins abrufbar. Sie sind nicht Ende-zu-Ende-verschlüsselt. Keine Passwörter, Zertifikate oder privaten Schlüssel eintragen. Eine tatsächliche ELSTER-Übermittlung ist noch nicht verfügbar.</p>
                </form>
              </div>
            )}

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Monatsauswertung</h2>
                  <p className="meta">BWA- und UStVA-Vorschau nach Ist-Prinzip</p>
                </div>
              <div className="header-actions">
                <label className="finance-month-picker">
                  Auswertungsmonat
                  <input type="month" value={financeMonth} onChange={(event) => setFinanceMonth(event.target.value)} />
                </label>
                {currentUser?.role === 'admin' && <button type="button" className="secondary-button small" onClick={() => setShowElsterPreview((visible) => !visible)}>{showElsterPreview ? 'ELSTER-Vorschau schließen' : 'ELSTER-Vorschau'}</button>}
              </div>
              </div>
              <div className="finance-summary-grid">
                <div><span>Einnahmen netto</span><strong>{formatFinanceEuro(financeReport.incomeNetCents)}</strong></div>
                <div><span>Ausgaben netto</span><strong>{formatFinanceEuro(financeReport.expenseNetCents)}</strong></div>
                <div><span>Betriebsergebnis vereinfacht</span><strong>{formatFinanceEuro(financeReport.operatingResultCents)}</strong></div>
                <div><span>Umsatzsteuer auf Zahlungseingänge</span><strong>{formatFinanceEuro(financeReport.outputVatCents)}</strong></div>
                <div><span>Vorsteuer laut Belegen</span><strong>{formatFinanceEuro(financeReport.inputVatCents)}</strong></div>
                <div><span>UStVA-Vorschau · Zahllast / Erstattung</span><strong>{formatFinanceEuro(financeReport.vatDueCents)}</strong></div>
              </div>
              {showElsterPreview && currentUser?.role === 'admin' && (
                <section className="elster-preview" aria-labelledby="elster-preview-title">
                  <div className="panel-header">
                    <div>
                      <h3 id="elster-preview-title">ELSTER-UStVA-Übermittlungsvorschau</h3>
                      <p className="meta">
                        {elsterPreview.filingPeriod === 'quarterly' ? 'Vierteljahr' : 'Monat'}: {elsterPreview.startMonth} bis {elsterPreview.endMonth}
                      </p>
                    </div>
                    <button type="button" className="secondary-button small" onClick={printElsterPreview}>Vorschau drucken / PDF</button>
                  </div>
                  <div className="finance-notice" role="note">
                    Dies ist eine unverbindliche Vorschau aus den eingetragenen Buchungen, kein amtlicher ELSTER-Datensatz. Es wird nichts übermittelt. Bitte Belege und Werte prüfen und die Angaben anschließend manuell in Mein ELSTER übertragen.
                  </div>
                  <dl className="elster-preview-details">
                    <div><dt>Unternehmen</dt><dd>{elsterSetup.businessName || 'Nicht eingetragen'}</dd></div>
                    <div><dt>Steuernummer</dt><dd>{elsterSetup.taxNumber || 'Nicht eingetragen'}</dd></div>
                    <div><dt>Finanzamt</dt><dd>{elsterSetup.taxOffice || 'Nicht eingetragen'}</dd></div>
                    <div><dt>Bundesland</dt><dd>{elsterSetup.federalState || 'Nicht eingetragen'}</dd></div>
                  </dl>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead><tr><th>Umsätze nach Steuersatz</th><th>Bemessungsgrundlage netto</th><th>Umsatzsteuer</th></tr></thead>
                      <tbody>
                        {elsterPreview.vatSales.map((item) => (
                          <tr key={item.vatRate}>
                            <td>{item.vatRate} %</td>
                            <td>{formatFinanceEuro(item.netCents)}</td>
                            <td>{formatFinanceEuro(item.vatCents)}</td>
                          </tr>
                        ))}
                        <tr><th>Umsatzsteuer gesamt</th><td></td><th>{formatFinanceEuro(elsterPreview.outputVatCents)}</th></tr>
                        <tr><td>Abziehbare Vorsteuer laut Belegen</td><td></td><td>{formatFinanceEuro(elsterPreview.inputVatCents)}</td></tr>
                        <tr><th>Voraussichtliche Zahllast / Erstattung</th><td></td><th>{formatFinanceEuro(elsterPreview.vatDueCents)}</th></tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Art</th><th>Kategorie</th><th>Netto</th><th>Brutto</th></tr></thead>
                  <tbody>
                    {financeReport.categories.map((item) => (
                      <tr key={`${item.type}-${item.category}`}>
                        <td>{item.type === 'income' ? 'Einnahme' : 'Ausgabe'}</td>
                        <td>{item.category}</td>
                        <td>{formatFinanceEuro(item.netCents)}</td>
                        <td>{formatFinanceEuro(item.grossCents)}</td>
                      </tr>
                    ))}
                    {financeReport.categories.length === 0 && <tr><td colSpan="4">Keine bezahlten Buchungen im ausgewählten Monat.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Buchungen für {financeMonth}</h2>
                <span>{financeEntries.filter((entry) => entry.date?.startsWith(`${financeMonth}-`) || entry.paidAt?.startsWith(`${financeMonth}-`)).length} relevant</span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Art</th><th>Belegdatum</th><th>Bezahlt</th><th>Kategorie / Beschreibung</th><th>Partner / Belegnr.</th><th>SKR03</th><th>Brutto</th><th>Beleg</th><th></th></tr></thead>
                  <tbody>
                    {financeEntries
                      .filter((entry) => entry.date?.startsWith(`${financeMonth}-`) || entry.paidAt?.startsWith(`${financeMonth}-`))
                      .sort((first, second) => String(second.paidAt || second.date).localeCompare(String(first.paidAt || first.date)))
                      .map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.type === 'income' ? 'Einnahme' : 'Ausgabe'}</td>
                          <td>{entry.date}</td>
                          <td>{entry.paidAt || 'Offen'}</td>
                          <td>{entry.category}<small className="table-subtext">{entry.description}</small></td>
                          <td>{entry.counterparty || '–'}<small className="table-subtext">{entry.documentNumber || '–'}</small></td>
                          <td>{entry.accountNumber || 'Nicht kontiert'}</td>
                          <td>{formatFinanceEuro(entry.grossCents)}</td>
                          <td>
                            <span>{entry.receiptAvailable ? 'Ja' : 'Nein'}</span>
                            {(entry.receiptAttachments || []).map((attachment) => (
                              <button key={attachment.id} type="button" className="secondary-button small" onClick={() => downloadFinanceReceipt(entry, attachment)}>
                                {attachment.fileName}
                              </button>
                            ))}
                          </td>
                          <td className="customer-row-actions">
                            <button type="button" className="secondary-button small" onClick={() => editFinanceEntry(entry)}>Bearbeiten</button>
                            {currentUser?.role === 'admin' && <button type="button" className="danger-button small" onClick={() => deleteFinanceEntry(entry)}>Löschen</button>}
                          </td>
                        </tr>
                      ))}
                    {!financeEntries.some((entry) => entry.date?.startsWith(`${financeMonth}-`) || entry.paidAt?.startsWith(`${financeMonth}-`)) && <tr><td colSpan="9">Keine Buchungen im ausgewählten Monat.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'zahlungen' && (
          <>
            <section className="two-column">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Zahlungsantrag einreichen</h2>
                    <p className="meta">Der Antrag wird gespeichert und muss von einem Admin geprüft werden.</p>
                  </div>
                </div>
                <form className="form-grid" onSubmit={submitPaymentRequest}>
                  <label>
                    Auftraggeber
                    <input required maxLength="120" value={paymentRequestForm.clientName} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, clientName: event.target.value }))} />
                  </label>
                  <label>
                    Empfängername
                    <input required maxLength="70" value={paymentRequestForm.recipientName} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, recipientName: event.target.value }))} />
                  </label>
                  <label>
                    Empfänger-IBAN
                    <input required maxLength="40" autoComplete="off" value={paymentRequestForm.recipientIban} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, recipientIban: event.target.value }))} />
                  </label>
                  <label>
                    Empfänger-BIC (optional)
                    <input maxLength="11" autoComplete="off" value={paymentRequestForm.recipientBic} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, recipientBic: event.target.value }))} />
                  </label>
                  <label>
                    Betrag (€)
                    <input type="number" inputMode="decimal" min="0.01" max="1000000000" step="0.01" required value={paymentRequestForm.amount} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, amount: event.target.value }))} />
                  </label>
                  <label>
                    Gewünschter Ausführungstag
                    <input type="date" required value={paymentRequestForm.requestedExecutionDate} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, requestedExecutionDate: event.target.value }))} />
                  </label>
                  <label>
                    Verwendungszweck
                    <input required maxLength="140" value={paymentRequestForm.purpose} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, purpose: event.target.value }))} />
                  </label>
                  <label>
                    Referenz / Rechnungsnummer (optional)
                    <input maxLength="70" value={paymentRequestForm.reference} onChange={(event) => setPaymentRequestForm((current) => ({ ...current, reference: event.target.value }))} />
                  </label>
                  <button type="submit" className="primary-button full-width-button" disabled={paymentSaving}>
                    {paymentSaving ? 'Bitte warten …' : 'Zahlungsantrag einreichen'}
                  </button>
                </form>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Ablauf</h2>
                  <span>{currentUser?.role === 'admin' ? 'Admin' : 'Mitarbeiter'}</span>
                </div>
                <ol>
                  <li>Mitarbeiter reichen einen Antrag mit Auftraggeber, Empfänger- und Zahlungsdaten ein.</li>
                  <li>Ein Admin prüft den Antrag und kann ihn freigeben oder mit Begründung ablehnen.</li>
                  <li>Freigegebene Anträge werden als SEPA-XML exportiert. Die Datei muss im Banking geprüft und dort manuell freigegeben werden.</li>
                  <li>Nach der tatsächlichen Überweisung markiert ein Admin den Antrag als überwiesen.</li>
                </ol>
                <p className="finance-notice" role="note">Es gibt keine direkte Bankanbindung. Diese Anwendung löst selbst keine Überweisung aus.</p>
                {currentUser?.role === 'admin' && (
                  <form className="form-grid" onSubmit={savePaymentAccount}>
                    <h3 className="full-width">Firmenkonto für SEPA-Dateien</h3>
                    <label className="full-width">
                      Kontoinhaber
                      <input required maxLength="70" value={paymentSettingsForm.accountName} onChange={(event) => setPaymentSettingsForm((current) => ({ ...current, accountName: event.target.value }))} />
                    </label>
                    <label>
                      Firmen-IBAN
                      <input required maxLength="40" autoComplete="off" value={paymentSettingsForm.iban} onChange={(event) => setPaymentSettingsForm((current) => ({ ...current, iban: event.target.value }))} />
                    </label>
                    <label>
                      Firmen-BIC (optional)
                      <input maxLength="11" autoComplete="off" value={paymentSettingsForm.bic} onChange={(event) => setPaymentSettingsForm((current) => ({ ...current, bic: event.target.value }))} />
                    </label>
                    <button type="submit" className="secondary-button full-width-button" disabled={paymentSaving}>Zahlungskonto speichern</button>
                  </form>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>{currentUser?.role === 'admin' ? 'Zahlungsanträge' : 'Meine Zahlungsanträge'}</h2>
                  <p className="meta">{visiblePaymentRequests.length} Antrag/Anträge · Beträge und Empfängerdaten sind nach Einreichung unveränderlich.</p>
                </div>
                {currentUser?.role === 'admin' && (
                  <button type="button" className="primary-button" disabled={paymentSaving || !paymentRequests.some((request) => request.status === 'approved')} onClick={exportApprovedPayments}>
                    Freigegebene als SEPA-XML exportieren
                  </button>
                )}
              </div>
              {paymentMessage && <p role="status">{paymentMessage}</p>}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {currentUser?.role === 'admin' && <th>Antragsteller</th>}
                      <th>Auftraggeber / Empfänger</th>
                      <th>Betrag</th>
                      <th>Ausführung</th>
                      <th>Status</th>
                      <th>Verwendungszweck / Referenz</th>
                      {currentUser?.role === 'admin' && <th>Aktionen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePaymentRequests
                      .slice()
                      .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)))
                      .map((request) => (
                        <tr key={request.id}>
                          {currentUser?.role === 'admin' && <td>{request.requesterName}<small className="table-subtext">{new Date(request.createdAt).toLocaleDateString('de-DE')}</small></td>}
                          <td>{request.clientName}<small className="table-subtext">{request.recipientName} · {request.recipientIban}</small></td>
                          <td>{formatPaymentAmount(request.amountCents)}</td>
                          <td>{request.requestedExecutionDate}</td>
                          <td>
                            {paymentStatusLabels[request.status] || request.status}
                            {request.rejectionReason && <small className="table-subtext">{request.rejectionReason}</small>}
                            {request.paidAt && <small className="table-subtext">Überwiesen am {request.paidAt}{request.paymentReference ? ` · ${request.paymentReference}` : ''}</small>}
                          </td>
                          <td>{request.purpose}<small className="table-subtext">{request.reference || 'Keine Referenz'}</small></td>
                          {currentUser?.role === 'admin' && (
                            <td className="customer-row-actions">
                              {request.status === 'pending' && (
                                <>
                                  <button type="button" className="primary-button small" disabled={String(request.requesterId) === String(currentUser.id) || paymentSaving} onClick={() => reviewPaymentRequest(request, 'approved')}>Freigeben</button>
                                  <button type="button" className="secondary-button small" disabled={paymentSaving} onClick={() => reviewPaymentRequest(request, 'rejected')}>Ablehnen</button>
                                </>
                              )}
                              {request.status === 'exported' && <button type="button" className="secondary-button small" disabled={paymentSaving} onClick={() => markPaymentAsPaid(request)}>Als überwiesen markieren</button>}
                            </td>
                          )}
                        </tr>
                      ))}
                    {visiblePaymentRequests.length === 0 && (
                      <tr><td colSpan={currentUser?.role === 'admin' ? 7 : 6}>Noch keine Zahlungsanträge vorhanden.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeTab === 'shop' && currentUser.role === 'admin' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Versandkosten</h2>
                <span>Webshop</span>
              </div>
              <p>Privat- und Geschäftskunden erhalten bis zur eingestellten Traygrenze und maximal 31,5 kg DPD-Paketversand; bei schwereren Geschäftskundenbestellungen wird Spedition zum Preis je Palette berechnet. DPD-Tarife sind separat einstellbar. Die bisherigen Paketpreise dienen als Ausgangswerte und müssen mit deinem DPD-Vertrag abgeglichen werden.</p>
              <form className="form-grid" onSubmit={saveShopShippingSettings}>
                {defaultShopShippingTiers.map((tier) => {
                  const savedPrice = shopSettings.find((entry) => entry?.id === 'global')?.shippingTiers?.find((savedTier) => savedTier.maxWeightGrams === tier.maxWeightGrams)?.priceCents
                  return <label key={tier.maxWeightGrams}>{tier.label} (€)<input name={`shippingTier-${tier.maxWeightGrams}`} type="number" min="0" step="0.01" required defaultValue={((savedPrice ?? tier.priceCents) / 100).toFixed(2)} /></label>
                })}
                <label>DPD maximal 24er-Trays<input name="businessDpdMaxTrays" type="number" min="1" max="20" step="1" required defaultValue={shopSettings.find((entry) => entry?.id === 'global')?.businessDpdMaxTrays ?? defaultBusinessDpdMaxTrays} /></label>
                {defaultShopShippingTiers.map((tier) => {
                  const globalSettings = shopSettings.find((entry) => entry?.id === 'global')
                  const dpdPrice = globalSettings?.businessDpdShippingTiers?.find((savedTier) => savedTier.maxWeightGrams === tier.maxWeightGrams)?.priceCents
                  const packagePrice = globalSettings?.shippingTiers?.find((savedTier) => savedTier.maxWeightGrams === tier.maxWeightGrams)?.priceCents
                  return <label key={`business-dpd-${tier.maxWeightGrams}`}>DPD Geschäftskunden bis {tier.label.match(/bis (.+)$/)?.[1] || `${tier.maxWeightGrams / 1000} kg`} (€)<input name={`businessDpdShippingTier-${tier.maxWeightGrams}`} type="number" min="0" step="0.01" required defaultValue={((dpdPrice ?? packagePrice ?? tier.priceCents) / 100).toFixed(2)} /></label>
                })}
                <label>Spedition je Palette (€)<input name="shippingPricePerPallet" type="number" min="0" step="0.01" required defaultValue={((shopSettings.find((entry) => entry?.id === 'global')?.shippingPricePerPalletCents ?? defaultShopShippingPricePerPalletCents) / 100).toFixed(2)} /></label>
                <label>24er-Trays je Palette<input name="shippingTraysPerPallet" type="number" min="1" max="10000" step="1" required defaultValue={shopSettings.find((entry) => entry?.id === 'global')?.shippingTraysPerPallet ?? defaultShopShippingTraysPerPallet} /></label>
                <label>Großer Karton (kg)<input name="largeCartonWeight" type="number" min="0" max="100" step="0.001" defaultValue={shopSettings.find((entry) => entry?.id === 'global')?.largeCartonTareGrams !== undefined ? (shopSettings.find((entry) => entry?.id === 'global').largeCartonTareGrams / 1000).toFixed(3) : ''} placeholder="optional" /></label>
                <label>Kleiner Karton (kg)<input name="smallCartonWeight" type="number" min="0" max="100" step="0.001" defaultValue={shopSettings.find((entry) => entry?.id === 'global')?.smallCartonTareGrams !== undefined ? (shopSettings.find((entry) => entry?.id === 'global').smallCartonTareGrams / 1000).toFixed(3) : ''} placeholder="optional" /></label>
                <button type="submit" className="primary-button full-width-button">Versandkosten speichern</button>
              </form>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2>Rabattcode anlegen</h2>
                <span>{shopDiscounts.length} Codes</span>
              </div>
              <form className="form-grid" onSubmit={saveShopDiscount}>
                <label>Rabattcode<input name="code" type="text" required minLength="3" maxLength="32" pattern="[A-Za-z0-9_-]+" placeholder="z. B. WELCOME10" /></label>
                <label>Rabattart<select name="type" defaultValue="percent"><option value="percent">Prozent</option><option value="fixed">Fester Betrag (€)</option></select></label>
                <label>Rabattwert<input name="value" type="number" min="0.01" max="1000000" step="0.01" required placeholder="z. B. 10" /></label>
                <button type="submit" className="primary-button full-width-button">Rabattcode speichern</button>
              </form>
              {shopDiscounts.length === 0 ? <p>Noch keine Rabattcodes angelegt.</p> : (
                <div className="card-list">
                  {shopDiscounts.map((discount) => (
                    <article className="mini-card" key={discount.id}>
                      <div className="mini-head">
                        <h3>{discount.code}</h3>
                        <span className="pill">{discount.active ? 'Aktiv' : 'Pausiert'}</span>
                      </div>
                      <p>{discount.type === 'percent' ? `${discount.value}% Rabatt` : `${(discount.value / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € Rabatt`}</p>
                      <div className="mini-actions">
                        <button type="button" className="secondary-button small" onClick={() => updateShopDiscount(discount.id, { active: !discount.active })}>{discount.active ? 'Pausieren' : 'Aktivieren'}</button>
                        <button type="button" className="danger-button small" onClick={() => setShopDiscounts((current) => current.filter((entry) => entry.id !== discount.id))}>Löschen</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="panel full-width">
              <div className="panel-header">
                <h2>Kundenkonten</h2>
                <button type="button" className="secondary-button small" onClick={loadBusinessCustomers} disabled={businessCustomersLoading}>
                  {businessCustomersLoading ? 'Lade Konten …' : 'Konten laden'}
                </button>
              </div>
              <p>Alle registrierten Kundenkonten und Geschäftskundenanträge. Du kannst Geschäftskunden prüfen, pro Shop-Produkt einen eigenen Brutto-Verkaufspreis je 24er-Tray festlegen und Konten dauerhaft löschen. Bei einer Kontolöschung bleiben Bestellungen und Rechnungen erhalten.</p>
              {networkStatus.mode === 'client' && <p role="status">Kundenkonten können nur am Haupt-PC gelöscht werden. Öffne die Desktop-App dort, um die Verwaltung zu verwenden.</p>}
              {!businessCustomersLoaded
                ? <p>Noch nicht geladen. Das Laden benötigt das Website-Admin-Token auf dem Haupt-PC.</p>
                : businessCustomers.length === 0
                  ? <p>Es liegen noch keine Geschäftskundenanträge vor.</p>
                : (
                  <div className="card-list">
                    {businessCustomers.map((customer) => {
                      const profile = customer.profile || {}
                      const businessPrices = customer.prices || {}
                      const isBusinessCustomer = ['pending', 'approved', 'rejected', 'suspended'].includes(customer.status)
                      const statusLabel = customer.status === 'pending'
                        ? 'Antrag offen'
                        : customer.status === 'approved'
                          ? 'Freigegeben'
                          : customer.status === 'suspended'
                            ? 'Pausiert'
                            : customer.status === 'rejected'
                              ? 'Abgelehnt'
                              : customer.verified ? 'Privatkunde' : 'E-Mail nicht bestätigt'
                      return (
                        <article className="mini-card" key={customer.email}>
                          <div className="mini-head">
                            <h3>{profile.company || profile.name || customer.email}</h3>
                            <span className="pill">{statusLabel}</span>
                          </div>
                          <p>{customer.email}{profile.name ? ` · ${profile.name}` : ''}{profile.phone ? ` · ${profile.phone}` : ''}</p>
                          {profile.address && <p>Lieferadresse: {profile.address}, {profile.postalCode || ''} {profile.city || ''}</p>}
                          {profile.vatId && <p>USt-IdNr.: {profile.vatId}</p>}
                          {profile.billingEmail && <p>Rechnungs-E-Mail: {profile.billingEmail}</p>}
                          {profile.deliveryNote && <p>Lieferhinweis: {profile.deliveryNote}</p>}
                          {isBusinessCustomer && (
                            <form className="form-grid" onSubmit={(event) => saveBusinessCustomer(event, customer)}>
                              <label>Kontostatus
                                <select name="status" defaultValue={customer.status}>
                                  <option value="pending">Antrag offen</option>
                                  <option value="approved">Freigegeben</option>
                                  <option value="rejected">Abgelehnt</option>
                                  <option value="suspended">Pausiert</option>
                                </select>
                              </label>
                              <div className="business-customer-prices">
                                <strong>Geschäftskunden-Verkaufspreise</strong>
                                <small>Bruttopreis je 24er-Tray. Leer lassen, um den normalen Shoppreis zu verwenden.</small>
                                {products
                                  .filter((product) => (product.shopActive === true || product.shopActive === 'true') && product.status !== 'Inaktiv')
                                  .map((product) => {
                                    const productId = shopCatalogProductId(product)
                                    const savedPriceCents = Number(businessPrices[productId]) || 0
                                    const retailPrice = Number(String(product.shopCratePrice || '').replace(',', '.'))
                                      || Number(String(product.unitPrice || '').replace(',', '.')) * 1.19 * 24
                                    return (
                                      <label key={productId}>
                                        {product.name} · Standardpreis {retailPrice > 0 ? `${retailPrice.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : 'nicht festgelegt'}
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          name={`business-price-${productId}`}
                                          key={`${customer.email}-${productId}-${savedPriceCents}`}
                                          defaultValue={savedPriceCents ? (savedPriceCents / 100).toFixed(2).replace('.', ',') : ''}
                                          placeholder="Standardpreis verwenden"
                                        />
                                      </label>
                                    )
                                  })}
                                {products.every((product) => !(product.shopActive === true || product.shopActive === 'true') || product.status === 'Inaktiv') && (
                                  <small>Aktuell sind keine aktiven Shop-Produkte vorhanden.</small>
                                )}
                              </div>
                              <button type="submit" className="primary-button">Geschäftskundenkonto speichern</button>
                            </form>
                          )}
                          {currentUser?.role === 'admin' && (
                            <button
                              type="button"
                              className="danger-button small"
                              onClick={() => {
                                setCustomerDeleteConfirmation(customer.email)
                                setCustomerDeleteEmailInput('')
                                setShopMessage('')
                              }}
                              disabled={deletingCustomerEmail === customer.email || networkStatus.mode === 'client'}
                            >
                              {deletingCustomerEmail === customer.email ? 'Lösche Konto …' : 'Kundenkonto löschen'}
                            </button>
                          )}
                          {customerDeleteConfirmation === customer.email && (
                            <form
                              className="form-grid"
                              onSubmit={(event) => {
                                event.preventDefault()
                                deleteCustomerAccount(customer)
                              }}
                            >
                              <p role="alert">Kundenkonto dauerhaft löschen? Bestellungen und Rechnungen bleiben erhalten. Gib zur Bestätigung die E-Mail-Adresse <strong>{customer.email}</strong> ein.</p>
                              <label>
                                E-Mail-Adresse bestätigen
                                <input
                                  type="email"
                                  autoComplete="off"
                                  value={customerDeleteEmailInput}
                                  onChange={(event) => setCustomerDeleteEmailInput(event.target.value)}
                                  required
                                />
                              </label>
                              <div className="mini-actions">
                                <button
                                  type="submit"
                                  className="danger-button small"
                                  disabled={deletingCustomerEmail === customer.email || customerDeleteEmailInput.trim().toLowerCase() !== customer.email.trim().toLowerCase()}
                                >
                                  {deletingCustomerEmail === customer.email ? 'Lösche Konto …' : 'Endgültig löschen'}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button small"
                                  disabled={deletingCustomerEmail === customer.email}
                                  onClick={() => {
                                    setCustomerDeleteConfirmation(null)
                                    setCustomerDeleteEmailInput('')
                                  }}
                                >
                                  Abbrechen
                                </button>
                              </div>
                            </form>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              {shopMessage && <p role="status">{shopMessage}</p>}
            </div>
            <div className="panel full-width">
              <p>{cloudStatus?.enabled
                ? 'Cloud-Sync ist aktiv. Einstellungen und Rabattcodes werden nach dem nächsten Abgleich im Webshop verwendet.'
                : 'Hinweis: Aktiviere zuerst den Cloud-Sync im Admin-Bereich, damit Einstellungen und Rabattcodes im Webshop ankommen.'}</p>
            </div>
          </section>
        )}

        {activeTab === 'produkte' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Produkt anlegen</h2>
                <span className="product-can-reference"><img src="/zyro-pfirsich-maracuja-can-transparent.png" alt="" /><span>500 ml Dose · 24er-Tray</span></span>
              </div>

              <form className="form-grid" onSubmit={editingProductId !== null ? saveProduct : addProduct}>
                <label>
                  Produktname
                  <input type="text" name="name" value={productForm.name} onChange={handleProductInput} placeholder="Zyro Mango Burst" />
                </label>
                <label>
                  SKU
                  <input type="text" name="sku" value={productForm.sku} onChange={handleProductInput} placeholder="ZYR-MB-004" />
                </label>
                <label>
                  EAN-13
                  <input
                    type="text"
                    name="ean13"
                    value={productForm.ean13}
                    onChange={handleProductInput}
                    inputMode="numeric"
                    pattern="[0-9]{13}"
                    maxLength={13}
                    placeholder="Optional · 13 Ziffern"
                    title="Bitte eine 13-stellige EAN-13 eingeben."
                  />
                  <small>Optional · wird beim Scannen des Produkts erkannt</small>
                </label>
                <label>Pfand pro Dose (€)<input type="text" inputMode="decimal" name="depositPerUnit" value={productForm.depositPerUnit} onChange={handleProductInput} placeholder="z. B. 0,25" /></label>
                <label>Mindestbestand (Dosen)<input type="number" min="0" name="minStock" value={productForm.minStock} onChange={handleProductInput} placeholder="Warnung darunter" /></label>
                <label>Charge / Losnummer<input type="text" name="lotNumber" value={productForm.lotNumber} onChange={handleProductInput} /></label>
                <label>Mindesthaltbarkeitsdatum<input type="date" name="bestBefore" value={productForm.bestBefore} onChange={handleProductInput} /></label>
                <label>Dosen pro Tray<input type="number" min="24" max="24" name="bottlesPerCase" value="24" readOnly /></label>
                <label>Gewicht pro Dose (kg)<input type="text" inputMode="decimal" name="weightKg" value={productForm.weightKg} onChange={handleProductInput} placeholder="z. B. 0,5" /></label>
                <div className="full-width product-label-upload">
                  <strong>Etikettdatei</strong>
                  {productForm.labelAttachment ? (
                    <div className="product-label-file">
                      {productForm.labelAttachment.type.startsWith('image/') && (
                        <img src={productForm.labelAttachment.dataUrl} alt={`Etikett für ${productForm.name || 'Produkt'}`} />
                      )}
                      <span>{productForm.labelAttachment.name} · {formatFileSize(productForm.labelAttachment.size)}</span>
                      <div className="mini-actions">
                        <button type="button" className="secondary-button small" onClick={() => setViewingLabReport({ ...productForm.labelAttachment, archiveUpload: true })}>Vorschau</button>
                        <a className="secondary-button small" href={productForm.labelAttachment.dataUrl} download={productForm.labelAttachment.name}>Herunterladen</a>
                        <button type="button" className="danger-button small" onClick={() => setProductForm((current) => ({ ...current, labelAttachment: null }))}>Entfernen</button>
                      </div>
                    </div>
                  ) : <p>Noch kein Etikett hochgeladen.</p>}
                  <label className="secondary-button small product-image-upload">
                    {productForm.labelAttachment ? 'Etikett ersetzen' : 'Etikett hochladen'}
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.pdf" onChange={handleProductLabelUpload} hidden />
                  </label>
                  <small>PDF, JPG, PNG oder WebP · maximal 2 MB. Gespeicherte Produktetiketten erscheinen auch im Dokumentenarchiv.</small>
                </div>
                <fieldset className="shop-fields" style={{ gridColumn: '1 / -1', border: '1px solid #d4d9d9', borderRadius: 8, padding: 12, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                  <legend>🛒 Online-Shop</legend>
                  <div className="product-image-manager" style={{ gridColumn: '1 / -1' }}>
                    <div className="product-image-gallery">
                      {(productForm.shopImages?.length ? productForm.shopImages : (productForm.shopImage ? [productForm.shopImage] : [])).map((image, index) => (
                        <div className="product-image-item" key={`${index}-${image.slice(0, 40)}`}>
                          <img src={image} alt={`${productForm.name || 'Produkt'} Bild ${index + 1}`} />
                          <span>{index === 0 ? 'Hauptbild' : `Bild ${index + 1}`}</span>
                          <button
                            type="button"
                            className="secondary-button small"
                            aria-label={`Produktbild ${index + 1} entfernen`}
                            onClick={() => setProductForm((current) => {
                              const images = (current.shopImages?.length ? current.shopImages : (current.shopImage ? [current.shopImage] : []))
                                .filter((_, imageIndex) => imageIndex !== index)
                              return { ...current, shopImages: images, shopImage: images[0] || '' }
                            })}
                          >Entfernen</button>
                        </div>
                      ))}
                      {!(productForm.shopImages?.length || productForm.shopImage) && <div className="product-image-empty">Noch keine Bilder hinzugefügt</div>}
                    </div>
                    <label className="secondary-button small product-image-upload" style={{ cursor: 'pointer' }}>
                      Mehrere Bilder hinzufügen
                      <input type="file" accept="image/*" multiple onChange={handleProductImages} hidden />
                    </label>
                    <small>Bis zu 5 Bilder pro Produkt. Das erste Bild wird als Hauptbild im Shop verwendet.</small>
                  </div>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, display: 'flex' }}><input type="checkbox" checked={productForm.shopActive} onChange={(event) => setProductForm((current) => ({ ...current, shopActive: event.target.checked }))} /> Im Shop anzeigen</label>
                  <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, display: 'flex' }}><input type="checkbox" checked={productForm.shopPreorderEnabled} onChange={(event) => setProductForm((current) => ({ ...current, shopPreorderEnabled: event.target.checked }))} /> Vorbestellung erlauben, wenn Lagerbestand 0 ist</label>
                  <label>Voraussichtliches Lieferdatum<input type="date" value={productForm.shopExpectedDeliveryDate} onChange={(event) => setProductForm((current) => ({ ...current, shopExpectedDeliveryDate: event.target.value }))} disabled={!productForm.shopPreorderEnabled} required={productForm.shopPreorderEnabled} /></label>
                  <small style={{ gridColumn: '1 / -1' }}>Bei Bestand 0 ist der Artikel nur mit aktivierter Vorbestellung bestellbar. Die normale Zahlung im Checkout bleibt unverändert.</small>
                  <label>Preis pro 24er-Tray, brutto (€)<input type="text" inputMode="decimal" name="shopCratePrice" value={productForm.shopCratePrice} onChange={handleProductInput} placeholder="z. B. 28,56" /></label>
                  <label>Shop-Beschreibung<textarea name="shopDescription" rows="6" maxLength="1500" value={productForm.shopDescription} onChange={handleProductInput} placeholder="Geschmack, Zutaten, Besonderheiten – Absätze mit Enter" /></label>
                  <label>Zutaten<textarea name="shopIngredients" rows="3" maxLength="600" value={productForm.shopIngredients} onChange={handleProductInput} placeholder="Wasser, Zucker, Maracuja-Saft ..." /></label>
                  <div className="product-nutrition-editor">
                    <div>
                      <strong>Nährwerte pro 100 ml</strong>
                      <small>{formatNutritionValues(productForm.shopNutritionValues) || productForm.shopNutrition || 'Noch keine Nährwerte eingetragen.'}</small>
                    </div>
                    <button type="button" className="secondary-button small" onClick={() => setNutritionEditorOpen(true)}>Nährwerte feldweise eintragen</button>
                  </div>
                  <label>Staffel 1 ab Dosen<input type="number" min="1" name="tier1Qty" value={productForm.tier1Qty} onChange={handleProductInput} placeholder="z. B. 48" /></label>
                  <label>Staffel 1 Rabatt %<input type="text" inputMode="decimal" name="tier1Pct" value={productForm.tier1Pct} onChange={handleProductInput} placeholder="z. B. 5" /></label>
                  <label>Staffel 2 ab Dosen<input type="number" min="1" name="tier2Qty" value={productForm.tier2Qty} onChange={handleProductInput} placeholder="z. B. 240" /></label>
                  <label>Staffel 2 Rabatt %<input type="text" inputMode="decimal" name="tier2Pct" value={productForm.tier2Pct} onChange={handleProductInput} placeholder="z. B. 10" /></label>
                  <small style={{ gridColumn: '1 / -1' }}>Shop braucht außerdem das Gewicht pro Dose. Bestand und Staffelpreise werden automatisch mit dem Shop synchronisiert.</small>
                </fieldset>
                <label>
                  Kategorie
                  <select name="category" value={productForm.category} onChange={handleProductInput}>
                    <option value="Energy">Energy</option>
                    <option value="Fruit">Fruit</option>
                    <option value="Zero">Zero</option>
                    <option value="Classic">Classic</option>
                    <option value="Limonade">Limonade</option>
                  </select>
                </label>
                <label>
                  Volumen
                  <input type="text" name="volume" value={productForm.volume} onChange={handleProductInput} placeholder="500ml" />
                </label>
                <label>
                  Produzierte Menge
                  <input type="number" name="productionQuantity" min="0" step="0.01" value={productForm.productionQuantity} onChange={handleProductInput} placeholder="Menge eingeben" />
                </label>
                <label>
                  Einheit
                  <select name="productionUnit" value={productForm.productionUnit} onChange={handleProductInput}>
                    <option value="Dosen">Dosen</option>
                    <option value="Trays">Trays</option>
                    <option value="Liter">Liter</option>
                  </select>
                </label>
                <label>
                  Verfügbare Dosen
                  <input type="number" name="availableBottles" min="0" step="1" value={productForm.availableBottles} onChange={handleProductInput} placeholder="Bestand eintragen" />
                  <small>Optional · Bestand wird manuell gepflegt</small>
                </label>
                <label>
                  Einzelpreis netto (EUR)
                  <input type="number" name="unitPrice" min="0" step="0.01" value={productForm.unitPrice} onChange={handleProductInput} placeholder="Preis hinterlegen" />
                </label>
                <label>
                  Status
                  <select name="status" value={productForm.status} onChange={handleProductInput}>
                    <option value="Aktiv">Aktiv</option>
                    <option value="In Planung">In Planung</option>
                    <option value="Auslaufend">Auslaufend</option>
                  </select>
                </label>
                <div className="lab-report-controls full-width">
                  <label>
                    Laborbericht hochladen
                    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={(event) => handleLabReportUpload(event, setProductForm)} />
                  </label>
                  {labReportMessage && <small role="status">{labReportMessage}</small>}
                  {(productForm.labReports || []).map((report) => (
                    <div className="lab-report-item" key={report.id}>
                      <button type="button" className="secondary-button small" onClick={() => setViewingLabReport(report)}>{report.name}</button>
                      <button type="button" className="danger-button small" onClick={() => removeLabReport(setProductForm, report.id)}>Entfernen</button>
                    </div>
                  ))}
                </div>
                <button type="submit" className="primary-button full-width-button">
                  {editingProductId !== null ? 'Produkt aktualisieren' : 'Produkt speichern'}
                </button>
                {productFormMessage && <p className="auth-error full-width" role="alert">{productFormMessage}</p>}
                {editingProductId !== null && (
                  <button
                    type="button"
                    className="secondary-button full-width-button"
                    onClick={() => {
                      setEditingProductId(null)
                      setProductForm(initialProductForm)
                      setProductFormMessage('')
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Produktliste</h2>
                <span>{products.length} Einträge</span>
              </div>
              <section className="panel">
                <div className="panel-header"><div><span className="eyebrow">Lager</span><h3>Bruch / Retoure / Absatz</h3></div></div>
                <form className="mde-receipt-form" onSubmit={submitStockAdjustment}>
                  <label>Produkt<select value={adjustForm.productId} onChange={(event) => setAdjustForm((c) => ({ ...c, productId: event.target.value }))} required><option value="">Bitte wählen</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                  <label>Vorgang<select value={adjustForm.type} onChange={(event) => setAdjustForm((c) => ({ ...c, type: event.target.value }))}><option value="Bruch">Bruch / Schwund (−)</option><option value="Retoure">Retoure (+)</option></select></label>
                  <label>Menge<input type="number" min="1" step="1" value={adjustForm.quantity} onChange={(event) => setAdjustForm((c) => ({ ...c, quantity: event.target.value }))} required /></label>
                  <label>Grund<input maxLength="250" value={adjustForm.note} onChange={(event) => setAdjustForm((c) => ({ ...c, note: event.target.value }))} placeholder="z. B. Glasbruch beim Transport" /></label>
                  <button className="primary-button" type="submit">Buchen</button>
                </form>
                {adjustMessage && <p className="form-message">{adjustMessage}</p>}
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Produkt</th><th>Verkauft (30 Tage)</th><th>Verkauft gesamt</th><th>Umsatz netto</th><th>Bestand</th><th>Reicht ca.</th></tr></thead>
                    <tbody>
                      {salesAnalysis.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.last30.toLocaleString('de-DE')}</td>
                          <td>{row.total.toLocaleString('de-DE')}</td>
                          <td>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(row.revenue)}</td>
                          <td>{row.stock ?? '–'}</td>
                          <td style={row.daysLeft !== null && row.daysLeft < 14 ? { color: '#b91c1c', fontWeight: 700 } : undefined}>{row.daysLeft === null ? '–' : `${row.daysLeft} Tage`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="card-list">
                {products.map((product) => (
                  <article key={product.id} className="mini-card">
                    <div className="mini-head">
                      <h3>{product.name}</h3>
                      <span className="pill">{product.category}</span>
                    </div>
                    <p>{product.sku}</p>
                    <ul>
                      <li>Volumen: {displayProductVolume(product.volume)}</li>
                      <li>EAN-13: {product.ean13 || product.bottleLabel?.ean13 || 'Nicht hinterlegt'}</li>
                      {Number(product.productionQuantity) > 0 && <li>Produziert: {Number(product.productionQuantity).toLocaleString('de-DE')} {product.productionUnit === 'Flaschen' ? 'Dosen' : (product.productionUnit || 'Dosen')}</li>}
                      <li>Verfügbar: {Number.isSafeInteger(product.availableBottles) && product.availableBottles >= 0 ? `${product.availableBottles.toLocaleString('de-DE')} Dosen` : 'Bestand nicht erfasst'}</li>
                      {product.shopActive && <li>🛒 Im Shop: {Number(product.shopCratePrice) > 0 ? `${Number(product.shopCratePrice).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € / Tray` : Number(product.unitPrice) > 0 ? `${(Number(product.unitPrice) * 1.19 * 24).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / Tray (aus Einzelpreis netto + 19 % USt)` : 'Preis fehlt'}{product.shopTiers?.length ? ` · ${product.shopTiers.length} Staffel(n)` : ''}</li>}
                      {product.shopActive && (() => {
                        const issues = getShopIssues(product, products)
                        return issues.length
                          ? <li className="shop-status shop-status-error">⚠ Nicht im Shop sichtbar: {issues.join(', ')}</li>
                          : <li className="shop-status shop-status-ok">✓ Im Shop sichtbar · Bestand {getShopStock(product) ?? 'unbegrenzt'}</li>
                      })()}
                      {isLowStock(product) && <li style={{ color: '#b91c1c', fontWeight: 700 }}>⚠ Unter Mindestbestand ({product.minStock}) – nachbestellen</li>}
                      {product.depositPerUnit > 0 && <li>Pfand: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(product.depositPerUnit)} / Dose</li>}
                      {product.lotNumber && <li>Charge: {product.lotNumber}</li>}
                      {product.bestBefore && <li style={isBestBeforeSoon(product) ? { color: '#b45309', fontWeight: 700 } : undefined}>MHD: {new Date(product.bestBefore).toLocaleDateString('de-DE')}{isBestBeforeSoon(product) ? ' – bald ablaufend' : ''}</li>}
                      <li>Tray: 24 Dosen</li>
                      <li>Nettopreis: {Number(product.unitPrice) > 0 ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(product.unitPrice) : 'Nicht hinterlegt'}</li>
                      <li>Status: {product.status}</li>
                    </ul>
                    {product.labReports?.length > 0 && (
                      <div className="lab-report-list">
                        <strong>Laborberichte ({product.labReports.length})</strong>
                        {product.labReports.map((report) => <button type="button" className="secondary-button small" key={report.id} onClick={() => setViewingLabReport(report)}>{report.name}</button>)}
                      </div>
                    )}
                    <div className="mini-actions">
                      <button type="button" className="secondary-button small" onClick={() => editProduct(product)}>
                        Bearbeiten
                      </button>
                      <button type="button" className="danger-button" onClick={() => removeProduct(product.id)}>
                        {requiresDeleteApproval ? 'Löschanfrage stellen' : 'Entfernen'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'rezepturen' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>{editingRecipeId === null ? 'Rezeptur hinzufügen' : 'Rezeptur bearbeiten'}</h2>
                <span>Produktion</span>
              </div>

              <form className="form-grid" onSubmit={addRecipe}>
                <div className="recipe-ai-box full-width">
                  <p>Geschmacksprofil und Batchgröße eingeben, dann einen KI-Entwurf erstellen lassen.</p>
                  {window.zyroAI && (
                    <div className="ai-connection-row">
                      <span className={aiStatus?.configured ? 'ai-connection connected' : 'ai-connection'}>
                        {aiStatus?.configured ? `Gemini verbunden${aiStatus.viaHost ? ' · Haupt-PC' : ''} · ${aiStatus.model}` : aiStatus?.encryptionAvailable === false ? 'Sichere Speicherung nicht verfügbar' : 'Gemini nicht eingerichtet'}
                      </span>
                      <button type="button" className="secondary-button small" onClick={() => setAiSettingsOpen((open) => !open)}>
                        {aiSettingsOpen ? 'Einstellungen schließen' : 'KI einrichten'}
                      </button>
                    </div>
                  )}
                  {aiSettingsOpen && window.zyroAI && (
                    <div className="ai-settings-panel">
                      {aiStatus?.viaHost || networkStatus.mode === 'client' ? (
                        <small>KI-Anfragen laufen über den Haupt-PC. Der Gemini-Schlüssel bleibt dort verschlüsselt gespeichert und muss nur dort eingerichtet werden.</small>
                      ) : (
                        <>
                          <label>
                            Gemini API-Schlüssel
                            <input
                              type="password"
                              value={geminiApiKey}
                              onChange={(event) => setGeminiApiKey(event.target.value)}
                              placeholder="Schlüssel aus Google AI Studio"
                              autoComplete="new-password"
                            />
                          </label>
                          <small>Der Schlüssel wird vor dem Speichern geprüft und verschlüsselt im Windows-Benutzerprofil abgelegt.</small>
                          <button type="button" className="secondary-button" onClick={saveGeminiApiKey} disabled={aiSettingsSaving || !geminiApiKey.trim()}>
                            {aiSettingsSaving ? 'Verbindung wird geprüft …' : 'Schlüssel prüfen und speichern'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <button type="button" className="secondary-button" onClick={developRecipe} disabled={recipeAiLoading}>
                    {recipeAiLoading ? 'Entwurf wird erstellt …' : 'KI-Rezeptur entwickeln'}
                  </button>
                  {recipeAiMessage && <small role="status">{recipeAiMessage}</small>}
                </div>
                <label>
                  Rezeptname
                  <input type="text" name="name" value={recipeForm.name} onChange={handleRecipeInput} placeholder="Zyro Tropical Spark" />
                </label>
                <label>
                  Kategorie
                  <select name="type" value={recipeForm.type} onChange={handleRecipeInput}>
                    <option value="Energy">Energy</option>
                    <option value="Fruit">Fruit</option>
                    <option value="Zero">Zero</option>
                    <option value="Classic">Classic</option>
                    <option value="Limonade">Limonade</option>
                  </select>
                </label>
                <label>
                  Batchgröße
                  <input type="text" name="batchSize" value={recipeForm.batchSize} onChange={handleRecipeInput} placeholder="10.000ml" />
                </label>
                <label className="full-width">
                  Beschreibung
                  <textarea name="description" value={recipeForm.description} onChange={handleRecipeInput} placeholder="Geschmack, Merkmale, Zielgruppe..." />
                </label>
                <label className="full-width">
                  Zutaten
                  <textarea name="ingredients" value={recipeForm.ingredients} onChange={handleRecipeInput} placeholder={'Wasser: 6.000ml\nZitronensaft: 1.600ml\nSüßungsmittel: 300g'} />
                </label>
                <div className="lab-report-controls full-width">
                  <label>
                    Laborbericht hochladen
                    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={(event) => handleLabReportUpload(event, setRecipeForm)} />
                  </label>
                  {labReportMessage && <small role="status">{labReportMessage}</small>}
                  {(recipeForm.labReports || []).map((report) => (
                    <div className="lab-report-item" key={report.id}>
                      <button type="button" className="secondary-button small" onClick={() => setViewingLabReport(report)}>{report.name}</button>
                      <button type="button" className="danger-button small" onClick={() => removeLabReport(setRecipeForm, report.id)}>Entfernen</button>
                    </div>
                  ))}
                </div>
                <button type="submit" className="primary-button full-width-button">
                  {editingRecipeId !== null ? 'Änderungen speichern' : recipeForm.aiGenerated ? 'Entwurf zur Prüfung speichern' : 'Rezept speichern'}
                </button>
                {editingRecipeId !== null && (
                  <button
                    type="button"
                    className="secondary-button full-width-button"
                    onClick={() => {
                      setEditingRecipeId(null)
                      setRecipeForm(initialRecipeForm)
                      setRecipeAiMessage('')
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Rezepturbestand</h2>
                <span>{recipes.length} Einträge</span>
              </div>
              {recipeApprovalMessage && <p className="recipe-approval-message" role="status">{recipeApprovalMessage}</p>}
              <div className="card-list">
                {recipes.map((recipe) => (
                  <article key={recipe.id} className="mini-card">
                    <div className="mini-head">
                      <h3>{recipe.name}</h3>
                      <span className="pill">{recipe.status || recipe.type}</span>
                    </div>
                    <p>Batchgröße: {recipe.batchSize}</p>
                    <p>{recipe.description}</p>
                    {recipe.status === 'Freigegeben' && recipe.approvedAt && (
                      <p className="recipe-approval-meta">Freigegeben von {recipe.approvedBy || 'Admin'} am {new Date(recipe.approvedAt).toLocaleString('de-DE')}</p>
                    )}
                    <ul>
                      {recipe.ingredients.split('\n').map((ingredient, index) => (
                        <li key={`${recipe.id}-${index}`}>{ingredient}</li>
                      ))}
                    </ul>
                    {recipe.labReports?.length > 0 && (
                      <div className="lab-report-list">
                        <strong>Laborberichte ({recipe.labReports.length})</strong>
                        {recipe.labReports.map((report) => <button type="button" className="secondary-button small" key={report.id} onClick={() => setViewingLabReport(report)}>{report.name}</button>)}
                      </div>
                    )}
                    <div className="mini-actions">
                      {currentUser?.role === 'admin' && recipe.status !== 'Freigegeben' && (
                        <button type="button" className="primary-button" onClick={() => approveRecipe(recipe)}>Freigeben</button>
                      )}
                      <button type="button" className="secondary-button small" onClick={() => editRecipe(recipe)}>
                        Bearbeiten
                      </button>
                      <button type="button" className="danger-button" onClick={() => removeRecipe(recipe.id)}>
                        {requiresDeleteApproval ? 'Löschanfrage stellen' : 'Entfernen'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'rezepturen' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>ZYRO – Testprotokoll</h2>
                <p className="meta">Nach jedem Versuch die tatsächlichen Werte eintragen. Aromamengen in Gramm pro 500 ml.</p>
              </div>
              <span>{labTests.length} gespeicherte Versuche</span>
            </div>
            <form className="form-grid" onSubmit={saveLabTest}>
              <fieldset className="full-width">
                <legend>Probennummer</legend>
                <div className="mini-actions" role="radiogroup" aria-label="Probennummer">
                  {['A', 'B', 'C'].map((sampleCode) => (
                    <label className="permission-option" key={sampleCode}>
                      <input
                        type="radio"
                        name="sampleCode"
                        value={sampleCode}
                        checked={labTestForm.sampleCode === sampleCode}
                        onChange={(event) => setLabTestForm((current) => ({ ...current, sampleCode: event.target.value }))}
                      />
                      Probe {sampleCode}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label>
                Zugehörige Rezeptur (optional)
                <select value={labTestForm.recipeId} onChange={(event) => setLabTestForm((current) => ({ ...current, recipeId: event.target.value }))}>
                  <option value="">Keine Rezeptur zuordnen</option>
                  {recipes.map((recipe) => <option key={recipe.id} value={String(recipe.id)}>{recipe.name}</option>)}
                </select>
              </label>
              <label>
                Pfirsicharoma (g pro 500 ml)
                <input type="number" min="0" max="1000" step="0.01" required value={labTestForm.peachFlavorGrams} onChange={(event) => setLabTestForm((current) => ({ ...current, peachFlavorGrams: event.target.value }))} />
              </label>
              <label>
                Maracujaaroma (g pro 500 ml)
                <input type="number" min="0" max="1000" step="0.01" required value={labTestForm.passionFruitFlavorGrams} onChange={(event) => setLabTestForm((current) => ({ ...current, passionFruitFlavorGrams: event.target.value }))} />
              </label>
              <label>
                Gemessener pH-Wert
                <input type="number" min="0" max="14" step="0.01" placeholder="Noch nicht gemessen" value={labTestForm.phValue} onChange={(event) => setLabTestForm((current) => ({ ...current, phValue: event.target.value }))} />
              </label>
              <label>
                Fruchtigkeit <output>{labRatingLabels(labTestForm.fruitiness)}</output>
                <input type="range" min="1" max="10" step="1" value={labTestForm.fruitiness} onChange={(event) => setLabTestForm((current) => ({ ...current, fruitiness: Number(event.target.value) }))} />
                <small>1 = wenig · 10 = sehr fruchtig</small>
              </label>
              <label>
                Natürlichkeit des Geschmacks <output>{labRatingLabels(labTestForm.naturalness)}</output>
                <input type="range" min="1" max="10" step="1" value={labTestForm.naturalness} onChange={(event) => setLabTestForm((current) => ({ ...current, naturalness: Number(event.target.value) }))} />
                <small>1 = künstlich · 10 = sehr natürlich</small>
              </label>
              <label>
                Nachgeschmack
                <select value={labTestForm.aftertaste} onChange={(event) => setLabTestForm((current) => ({ ...current, aftertaste: event.target.value }))}>
                  {Object.entries(labAftertasteLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Süße
                <select value={labTestForm.sweetness} onChange={(event) => setLabTestForm((current) => ({ ...current, sweetness: event.target.value }))}>
                  {Object.entries(labSweetnessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="full-width">
                Weitere Beobachtungen
                <textarea maxLength="2000" rows="4" value={labTestForm.observations} onChange={(event) => setLabTestForm((current) => ({ ...current, observations: event.target.value }))} placeholder="Aroma, Farbe, Kohlensäure, Mundgefühl oder sonstige Auffälligkeiten …" />
              </label>
              {labTestMessage && <p className="full-width" role="status">{labTestMessage}</p>}
              <button type="submit" className="primary-button full-width-button" disabled={labTestSaving}>
                {labTestSaving ? 'Protokoll wird gespeichert …' : 'Versuch speichern'}
              </button>
            </form>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Probe / Datum</th><th>Rezeptur</th><th>Aromen (g / 500 ml)</th><th>pH</th><th>Fruchtigkeit</th><th>Natürlichkeit</th><th>Nachgeschmack</th><th>Süße</th><th>Weitere Beobachtungen</th><th>Erfasst von</th></tr>
                </thead>
                <tbody>
                  {labTests
                    .slice()
                    .sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)))
                    .map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.sampleCode}<small className="table-subtext">{new Date(entry.createdAt).toLocaleString('de-DE')}</small></td>
                        <td>{entry.recipeName || '–'}</td>
                        <td>Pfirsich {entry.peachFlavorGrams} · Maracuja {entry.passionFruitFlavorGrams}</td>
                        <td>{entry.phValue ?? 'Noch nicht gemessen'}</td>
                        <td>{labRatingLabels(entry.fruitiness)}</td>
                        <td>{labRatingLabels(entry.naturalness)}</td>
                        <td>{labAftertasteLabels[entry.aftertaste] || entry.aftertaste}</td>
                        <td>{labSweetnessLabels[entry.sweetness] || entry.sweetness}</td>
                        <td>{entry.observations || '–'}</td>
                        <td>{entry.createdByName}</td>
                      </tr>
                    ))}
                  {labTests.length === 0 && <tr><td colSpan="10">Noch keine Versuche gespeichert.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="meta">Gespeicherte Versuche bleiben als Protokoll erhalten und können nicht nachträglich geändert oder gelöscht werden.</p>
          </section>
        )}

        {activeTab === 'bestellungen' && (
          <>
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>{editingOrderId === null ? 'Bestellung erfassen' : 'Bestellung bearbeiten'}</h2>
                <span>Logistik</span>
              </div>

              <form className="form-grid" onSubmit={addOrder}>
                <label>
                  Auftraggeber / Kunde
                  <select name="customer" value={orderForm.customer} onChange={handleOrderInput} required>
                    {[...new Set([companyDetails.name, ...orders.map((order) => order.customer).filter(Boolean)])].map((customer) => (
                      <option key={customer} value={customer}>{customer}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Produkt
                  <select name="product" value={orderForm.product} onChange={handleOrderInput}>
                    {products.map((product) => (
                      <option key={product.id} value={product.name}>{product.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Dosen
                  <input type="number" name="bottleCount" min="0" step="1" value={orderForm.bottleCount} onChange={handleOrderInput} placeholder="1200" required />
                </label>
                <label>
                  Trays
                  <input type="number" name="crateCount" min="0" step="1" value={orderForm.crateCount} onChange={handleOrderInput} placeholder="50" required />
                </label>
                <label>
                  Zugehörige Rezeptur
                  <select name="recipeId" value={orderForm.recipeId} onChange={handleOrderInput}>
                    <option value="">Automatisch nach Produkt</option>
                    {recipes
                      .filter((recipe) => isRecipeApproved(recipe) || String(recipe.id) === String(orderForm.recipeId))
                      .map((recipe) => (
                        <option key={recipe.id} value={recipe.id} disabled={!isRecipeApproved(recipe)}>
                          {recipe.name} · {recipe.batchSize}{isRecipeApproved(recipe) ? '' : ' · Freigabe erforderlich'}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Lohnabfüller
                  <input type="text" value={`${bottlerDetails.name}, ${bottlerDetails.street}, ${bottlerDetails.city}`} readOnly />
                </label>
                <label className="full-width">
                  Produktionshinweise
                  <textarea name="productionNotes" value={orderForm.productionNotes} onChange={handleOrderInput} placeholder="Abfüllung, Verpackung, Etikettierung oder besondere Vorgaben …" />
                </label>
                <label>
                  Übergabe am
                  <input type="date" name="handoffDate" value={orderForm.handoffDate} onChange={handleOrderInput} />
                </label>
                <label>
                  Lieferdatum
                  <input type="date" name="dueDate" value={orderForm.dueDate} onChange={handleOrderInput} />
                </label>
                <label>
                  Status
                  <select name="status" value={orderForm.status} onChange={handleOrderInput}>
                    <option value="In Produktion">In Produktion</option>
                    <option value="Versandbereit">Versandbereit</option>
                    <option value="Abgeschlossen">Abgeschlossen</option>
                  </select>
                </label>
                <button type="submit" className="primary-button full-width-button">
                  {editingOrderId === null ? 'Bestellung speichern' : 'Änderungen speichern'}
                </button>
                {editingOrderId !== null && (
                  <button
                    type="button"
                    className="secondary-button full-width-button"
                    onClick={() => {
                      setEditingOrderId(null)
                      setOrderForm(initialOrderForm)
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Bestellübersicht</h2>
                <span>{orders.length} Aufträge</span>
              </div>
              <form className="order-scan-form" onSubmit={scanOrder}>
                <label>
                  Auftrag per internem Barcode öffnen
                  <input
                    type="text"
                    value={scanCode}
                    onChange={(event) => {
                      setScanCode(event.target.value)
                      setScanMessage('')
                    }}
                    placeholder="Barcode scannen oder ZYR-Auftrags-ID eingeben"
                    autoComplete="off"
                    aria-describedby="order-scan-message"
                  />
                </label>
                <button type="submit" className="secondary-button">Auftrag öffnen</button>
              </form>
              <p className="scan-message" id="order-scan-message" aria-live="polite">{scanMessage}</p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kunde</th>
                      <th>Produkt</th>
                      <th>Interne Auftrags-ID</th>
                        <th>Dosen</th>
                        <th>Trays</th>
                      <th>Lot</th>
                      <th>Status</th>
                        <th>Verlauf</th>
                      <th>Formular</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.customer}</td>
                        <td>{order.product}</td>
                        <td>{order.internalCode || `ZYR-${order.id}`}</td>
                        <td>{order.bottleCount ?? '-'}</td>
                        <td>{order.crateCount ?? '-'}</td>
                        <td>{order.lotNumber}</td>
                        <td>
                          <div className="cell-actions">
                            <span className="status-badge">{order.status}</span>
                            <button type="button" className="secondary-button small" onClick={() => editOrder(order)}>
                              Bearbeiten
                            </button>
                            <button type="button" className="danger-button small" onClick={() => removeOrder(order.id)}>
                              {requiresDeleteApproval ? 'Löschanfrage' : 'Löschen'}
                            </button>
                          </div>
                        </td>
                        <td>
                          {order.workflowHistory?.length ? (
                            <details className="lot-history">
                              <summary>{order.workflowHistory.length} Ereignis(se)</summary>
                              <ul>
                                {[...order.workflowHistory].reverse().map((entry) => (
                                  <li key={entry.id}>
                                    <strong>{entry.action}</strong> · {formatTimestamp(entry.timestamp)}
                                    <div>{entry.userName} · {entry.details}</div>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : <span className="meta">Noch kein Verlauf</span>}
                        </td>
                        <td><button type="button" className="secondary-button small" onClick={() => printOrder(order)}>PDF / Drucken</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          {scannedOrder && (() => {
            const scannedRecipe = recipes.find((recipe) => String(recipe.id) === String(scannedOrder.recipeId) && isRecipeApproved(recipe))
              || recipes.find((recipe) => recipe.name === scannedOrder.product && isRecipeApproved(recipe))
            const ingredientList = scannedOrder.recipeIngredients || scannedRecipe?.ingredients || ''

            return (
              <div className="modal-backdrop" onClick={() => setScannedOrder(null)}>
                <section className="order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="scanned-order-title" onClick={(event) => event.stopPropagation()}>
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Auftrag gefunden</p>
                      <h2 id="scanned-order-title">{scannedOrder.internalCode || `ZYR-${scannedOrder.id}`}</h2>
                    </div>
                    <button type="button" className="secondary-button small" onClick={() => setScannedOrder(null)}>Schließen</button>
                  </div>
                  <div className="order-detail-grid">
                    <div><span>Auftraggeber / Kunde</span><strong>{scannedOrder.customer}</strong></div>
                    <div><span>Produkt</span><strong>{scannedOrder.product}</strong></div>
                    <div><span>Charge</span><strong>{scannedOrder.lotNumber}</strong></div>
                    <div><span>Status</span><strong>{scannedOrder.status}</strong></div>
                    <div><span>Dosen / Trays</span><strong>{scannedOrder.bottleCount ?? '–'} / {scannedOrder.crateCount ?? '–'}</strong></div>
                    <div><span>Lohnabfüller</span><strong>{bottlerDetails.name}</strong></div>
                    <div><span>Übergabe</span><strong>{scannedOrder.handoffDate || 'Nicht festgelegt'}</strong></div>
                    <div><span>Lieferdatum</span><strong>{scannedOrder.dueDate || 'Nicht festgelegt'}</strong></div>
                    <div><span>Rezeptur</span><strong>{scannedOrder.recipeName || scannedRecipe?.name || 'Keine zugeordnet'}</strong></div>
                  </div>
                  {ingredientList && (
                    <div className="order-detail-ingredients">
                      <h3>Rezepturdetails</h3>
                      <ul>{ingredientList.split('\n').filter(Boolean).map((ingredient, index) => <li key={`${scannedOrder.id}-${index}`}>{ingredient}</li>)}</ul>
                    </div>
                  )}
                  {scannedOrder.productionNotes && <p className="order-detail-notes"><strong>Produktionshinweise:</strong> {scannedOrder.productionNotes}</p>}
                  <div className="mini-actions">
                    <button type="button" className="secondary-button" onClick={() => {
                      editOrder(scannedOrder)
                      setScannedOrder(null)
                    }}>Bearbeiten</button>
                    <button type="button" className="primary-button" onClick={() => printOrder(scannedOrder)}>PDF / Drucken</button>
                  </div>
                </section>
              </div>
            )
          })()}
          </>
        )}

        {activeTab === 'verkauf' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>{editingSalesDocumentId === null ? 'Verkaufsbeleg erstellen' : 'Verkaufsbeleg bearbeiten'}</h2>
                <span>Verkauf</span>
              </div>
              <div className="company-details">
                <strong>Rechnungssteller</strong>
                <span>{companyDetails.name}</span>
                <span>{companyDetails.street}</span>
                <span>{companyDetails.city}</span>
                <span>Steuernummer: {companyDetails.taxNumber}</span>
                <span>USt-IdNr.: {companyDetails.vatId}</span>
                <span>IBAN: {companyDetails.iban}</span>
              </div>
              <form className="form-grid" onSubmit={addSalesDocument}>
                <label>
                  Belegart
                  <select name="kind" value={salesDocumentForm.kind} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, kind: event.target.value, status: salesDocumentStatuses[event.target.value][0] }))}>
                    {Object.entries(salesDocumentTypes).map(([kind, definition]) => <option key={kind} value={kind}>{definition.label}</option>)}
                  </select>
                </label>
                <label>
                  Kunde / Empfänger
                  <select
                    value={salesDocumentForm.customerId}
                    onChange={(event) => {
                      const customer = customerOptions.find((entry) => String(entry.id) === event.target.value)
                      setSalesDocumentForm((current) => ({
                        ...current,
                        customerId: event.target.value,
                        recipient: customer?.name || '',
                        recipientEmail: customer?.email || '',
                        recipientAddress: customer?.address || '',
                      }))
                    }}
                  >
                    <option value="">Neuen Kunden eingeben</option>
                    {customerOptions.filter((customer) => customer.id != null).map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                  <input type="text" value={salesDocumentForm.recipient} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, recipient: event.target.value }))} required />
                </label>
                <label className="full-width">
                  E-Mail-Adresse des Empfängers
                  <input type="text" inputMode="email" value={salesDocumentForm.recipientEmail} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, recipientEmail: event.target.value }))} maxLength={254} />
                </label>
                <label className="full-width">
                  Anschrift des Empfängers
                  <textarea value={salesDocumentForm.recipientAddress} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, recipientAddress: event.target.value }))} placeholder={'Straße und Hausnummer\nPLZ Ort'} required />
                </label>
                <label className="full-width">
                  Produktionsauftrag zuordnen (optional)
                  <select value={salesDocumentForm.relatedOrderId} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, relatedOrderId: event.target.value }))}>
                    <option value="">Kein Auftrag zugeordnet</option>
                    {orders.map((order) => <option key={order.id} value={order.id}>{order.lotNumber} · {order.product} · {order.internalCode || `ZYR-${order.id}`}</option>)}
                  </select>
                </label>
                {salesDocumentForm.kind === 'kundenauftrag' && (
                  <label className="full-width">
                    Los-/Lotnummer zuordnen
                    <select value={salesDocumentForm.lotNumber} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, lotNumber: event.target.value }))}>
                      <option value="">Noch keine Produktionscharge zugeordnet</option>
                      {orders.map((order) => <option key={order.id} value={order.lotNumber}>{order.lotNumber} · {order.product} · {order.internalCode || `ZYR-${order.id}`}</option>)}
                    </select>
                  </label>
                )}
                {salesDocumentForm.items.map((item, index) => (
                  <div className="sales-line full-width" key={`${index}-${item.productId}`}>
                    <label>
                      Leistung / Produkt
                      <select
                        value={item.productId}
                        onChange={(event) => {
                          const product = products.find((entry) => String(entry.id) === event.target.value)
                          setSalesDocumentForm((current) => ({
                            ...current,
                            items: current.items.map((line, lineIndex) => lineIndex === index
                              ? { ...line, productId: event.target.value, unitPrice: product?.unitPrice ? String(product.unitPrice) : '' }
                              : line),
                          }))
                        }}
                        required
                      >
                        <option value="">Produkt auswählen</option>
                        {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku} · {product.volume}</option>)}
                      </select>
                    </label>
                    <label>
                      Menge
                      <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => setSalesDocumentForm((current) => ({
                        ...current,
                        items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: event.target.value } : line),
                      }))} required />
                    </label>
                    <label>
                      Einzelpreis netto (EUR)
                      <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setSalesDocumentForm((current) => ({
                        ...current,
                        items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, unitPrice: event.target.value } : line),
                      }))} required />
                    </label>
                    {salesDocumentForm.items.length > 1 && (
                      <button
                        type="button"
                        className="danger-button remove-sales-line"
                        title="Position entfernen"
                        aria-label={`Position ${index + 1} entfernen`}
                        onClick={() => setSalesDocumentForm((current) => ({
                          ...current,
                          items: current.items.filter((_, lineIndex) => lineIndex !== index),
                        }))}
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary-button full-width-button"
                  onClick={() => setSalesDocumentForm((current) => ({
                    ...current,
                    items: [...current.items, { productId: '', quantity: '1', unitPrice: '' }],
                  }))}
                >
                  Position hinzufügen
                </button>
                <label>
                  Umsatzsteuer
                  <select value={salesDocumentForm.vatRate} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, vatRate: event.target.value }))}>
                    <option value="19">19 %</option>
                    <option value="7">7 %</option>
                    <option value="0">0 %</option>
                  </select>
                  {salesDocumentForm.vatRate === '7' && <small>ZUGFeRD-Export ist für 7 % derzeit gesperrt, damit der Steuersatz nicht falsch codiert wird.</small>}
                  {salesDocumentForm.vatRate === '0' && <small>0 % nur mit geprüftem Steuergrund verwenden; der ZUGFeRD-Export ist hierfür noch gesperrt.</small>}
                </label>
                <label>
                  Belegdatum
                  <input type="date" value={salesDocumentForm.documentDate} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, documentDate: event.target.value }))} required />
                </label>
                <label>
                  {salesDocumentForm.kind === 'angebot' ? 'Gültig bis' : salesDocumentForm.kind === 'rechnung' ? 'Fällig am' : 'Liefertermin'}
                  <input type="date" value={salesDocumentForm.dueDate} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, dueDate: event.target.value }))} />
                </label>
                <label>
                  Zahlungsart
                  <select value={salesDocumentForm.paymentMethod} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, paymentMethod: event.target.value }))}>
                    {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                  {salesDocumentForm.paymentMethod === 'Sonstiges' && <input type="text" value={salesDocumentForm.customPaymentMethod} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, customPaymentMethod: event.target.value }))} placeholder="Zahlungsart eingeben" />}
                </label>
                <label>
                  Versandart
                  <select value={salesDocumentForm.shippingMethod} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, shippingMethod: event.target.value }))}>
                    {shippingMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                  {salesDocumentForm.shippingMethod === 'Sonstiges' && <input type="text" value={salesDocumentForm.customShippingMethod} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, customShippingMethod: event.target.value }))} placeholder="Versandart eingeben" />}
                </label>
                <label>
                  Bearbeiter
                  <input type="text" value={currentUser.name} readOnly />
                </label>
                <label>
                  Status
                  <select value={salesDocumentForm.status} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, status: event.target.value }))}>
                    {getSalesDocumentStatusOptions(salesDocumentForm.kind, salesDocumentForm.status, editingSalesDocumentId).map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label className="full-width">
                  Hinweise
                  <textarea value={salesDocumentForm.notes} onChange={(event) => setSalesDocumentForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Zahlungsbedingungen oder zusätzliche Angaben" />
                </label>
                <button type="button" className="secondary-button full-width-button" onClick={previewSalesDocumentDraft}>
                  Vorschau öffnen
                </button>
                <button type="submit" className="primary-button full-width-button">
                  {editingSalesDocumentId === null ? `${salesDocumentTypes[salesDocumentForm.kind].label} speichern` : 'Änderungen speichern'}
                </button>
                {editingSalesDocumentId !== null && (
                  <button
                    type="button"
                    className="secondary-button full-width-button"
                    onClick={() => {
                      setEditingSalesDocumentId(null)
                      setSalesDocumentForm(initialSalesDocumentForm)
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Belegübersicht</h2>
                <div className="header-actions">
                  <span>{salesDocuments.length} Belege</span>
                  <button type="button" className="secondary-button small" onClick={exportBusinessData}>Daten sichern</button>
                  <button type="button" className="secondary-button small" onClick={() => backupInputRef.current?.click()}>Daten importieren</button>
                  <input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={importBusinessData} />
                </div>
              </div>
              {salesFeedback && <p className="sales-feedback" role="status">{salesFeedback}</p>}
              {salesDocuments.some((document) => document.source === 'webshop' && document.kind === 'kundenauftrag' && document.status === 'Offen') && (
                <div className="webshop-inbox">
                  <h3>🛒 Neue Webshop-Bestellungen</h3>
                  {salesDocuments.filter((document) => document.source === 'webshop' && document.kind === 'kundenauftrag' && document.status === 'Offen').map((document) => (
                    <div key={document.id} className="webshop-inbox-row">
                      <span><strong>{document.number}</strong> · {document.recipient} · {document.paymentStatus === 'paid' ? 'bezahlt' : 'Zahlung offen'}{document.hasPreorderItems ? ' · VORBESTELLUNG' : ''}</span>
                      <button type="button" className="secondary-button small" onClick={() => editSalesDocument(document)}>Bearbeiten</button>
                      <button type="button" className="secondary-button small" onClick={() => printPickingList(document)}>Kommissionierliste</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="card-list">
                {salesDocuments.map((salesDocument) => {
                  const netTotal = getSalesDocumentItems(salesDocument).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0)
                  const grossTotal = salesDocument.websiteInvoiceTotals ? Number(salesDocument.websiteInvoiceTotals.grossTotal) : netTotal * (1 + Number(salesDocument.vatRate) / 100)
                  const followupDocument = salesDocuments.find((entry) => entry.id === salesDocument.convertedToId)
                  return (
                    <article key={salesDocument.id} className="mini-card">
                      <div className="mini-head">
                        <h3>{salesDocument.number}</h3>
                        <span className="pill">{salesDocumentTypes[salesDocument.kind]?.label || 'Beleg'}{salesDocument.source === 'webshop' ? ' · Webshop' : ''}</span>
                      </div>
                      <p>{salesDocument.recipient}</p>
                      <p>{getSalesDocumentItems(salesDocument).map((item) => `${item.productName || item.description} × ${item.quantity}${item.isPreorder ? ` · VORBESTELLUNG${item.expectedDeliveryDate ? ` (voraussichtlich ${new Date(`${item.expectedDeliveryDate}T00:00:00.000Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })})` : ''}` : ''}`).join(', ')}</p>
                      {salesDocument.kind === 'kundenauftrag' && salesDocument.lotNumber && <p>Los-/Lotnummer: {salesDocument.lotNumber}</p>}
                      {salesDocument.kind === 'rechnung' && <p>Verwendungszweck: {salesDocument.paymentReference || salesDocument.number}</p>}
                      <p>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(grossTotal)} brutto</p>
                      <label className="sales-card-status">
                        Status
                        <select value={salesDocument.status} onChange={(event) => updateSalesDocumentStatus(salesDocument.id, event.target.value)}>
                          {(salesDocument.kind === 'rechnung' ? {
                            Entwurf: ['Entwurf', 'Versendet', 'Storniert'],
                            Versendet: ['Versendet', 'Bezahlt', 'Überfällig', 'Storniert'],
                            Überfällig: ['Überfällig', 'Bezahlt', 'Storniert'],
                            Bezahlt: ['Bezahlt', 'Storniert'],
                            Storniert: ['Storniert'],
                          }[salesDocument.status] || [salesDocument.status] : salesDocumentStatuses[salesDocument.kind]).map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </label>
                      {salesDocument.kind === 'rechnung' && salesDocument.status !== 'Entwurf' && <small>Ausgestellte Rechnung · unveränderbar</small>}
                      {salesDocument.kind === 'rechnung' && salesDocument.status === 'Bezahlt' && canManageFinance(currentUser) && (
                        financeEntries.some((entry) => String(entry.sourceDocumentId || '') === String(salesDocument.id))
                          ? <small>In Finanzbuchhaltung übernommen</small>
                          : <button type="button" className="secondary-button small" onClick={() => prepareInvoiceFinanceEntry(salesDocument)}>In Finanzbuchhaltung übernehmen</button>
                      )}
                      {followupDocument && <p className="sales-feedback">Folgebeleg: {followupDocument.number}</p>}
                      <div className="mini-actions">
                        {!(salesDocument.kind === 'rechnung' && salesDocument.status !== 'Entwurf') && <button type="button" className="secondary-button small" onClick={() => editSalesDocument(salesDocument)}>Bearbeiten</button>}
                        <button type="button" className="secondary-button small" onClick={() => printSalesDocument(salesDocument)}>PDF / Drucken</button>
                        {salesDocument.kind === 'kundenauftrag' && (
                          <button type="button" className="secondary-button small" onClick={() => printPickingList(salesDocument)}>Kommissionierliste</button>
                        )}
                        {salesDocument.status !== 'Storniert' && (
                          <button
                            type="button"
                            className="primary-button small"
                            disabled={Boolean(sendingSalesDocumentId)}
                            onClick={() => emailSalesDocument(salesDocument)}
                          >
                            {sendingSalesDocumentId === String(salesDocument.id) ? 'Wird gesendet …' : 'E-Mail versenden'}
                          </button>
                        )}
                        {salesDocument.kind === 'angebot' && salesDocument.status === 'Angenommen' && !followupDocument && (
                          <button type="button" className="primary-button" onClick={() => convertSalesDocument(salesDocument, 'kundenauftrag')}>Auftrag erstellen</button>
                        )}
                        {salesDocument.kind === 'kundenauftrag' && ['Verpackt', 'Abgeschlossen'].includes(salesDocument.status) && !followupDocument && (
                          <button type="button" className="primary-button" onClick={() => convertSalesDocument(salesDocument, 'rechnung')}>Rechnung erstellen</button>
                        )}
                      </div>
                    </article>
                  )
                })}
                {salesDocuments.length === 0 && <p>Noch keine Verkaufsbelege angelegt.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'mde' && (
          <section className="mde-workspace">
            <div className="mde-header panel">
              <div>
                <p className="eyebrow">Datalogic Memor 11 · Lagerterminal</p>
                <h2>Wareneingang &amp; Kommissionierung</h2>
                <p className="meta">Barcodes mit dem integrierten Scanner erfassen. Die Buchung erfolgt direkt über die Cloud.</p>
                <div className="mde-packaging-reference">
                  <img src="/zyro-pfirsich-maracuja-can-transparent.png" alt="" />
                  <span>500-ml-Dose · einzeln scannen<br />24 Dosen pro Tray</span>
                </div>
              </div>
              <div className="mde-mode-switch" role="group" aria-label="Lagerprozess auswählen">
                <button type="button" className={mdeInputMode === 'receipt' ? 'primary-button' : 'secondary-button'} onClick={() => { setMdeInputMode('receipt'); setMdeMessage('') }}>Wareneingang</button>
                <button type="button" className={mdeInputMode === 'picking' ? 'primary-button' : 'secondary-button'} onClick={() => { setMdeInputMode('picking'); setMdeMessage('') }}>Auftrag packen</button>
              </div>
            </div>

            {mdeInputMode === 'receipt' ? (
              <div className="panel mde-scan-panel">
                <div className="panel-header">
                  <div><span className="eyebrow">Einlagern</span><h2>Wareneingang buchen</h2></div>
                  <span className="mde-scan-badge">Scanner bereit</span>
                </div>
                <form className="mde-receipt-form" onSubmit={receiveMdeStock}>
                  <label className="mde-barcode-field">
                    Produktbarcode · SKU oder EAN
                    <input ref={mdeScanInputRef} autoComplete="off" autoCapitalize="off" value={mdeReceipt.barcode} onChange={(event) => setMdeReceipt((current) => ({ ...current, barcode: event.target.value, preparedChargeId: '' }))} onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        mdeChargeSelectRef.current?.focus()
                      }
                    }} placeholder="Barcode scannen, Charge auswählen" required />
                  </label>
                  <label>
                    Menge (Dosen)
                    <input type="number" min="1" max="1000000" step="1" value={mdeReceipt.quantity} onChange={(event) => setMdeReceipt((current) => ({ ...current, quantity: event.target.value }))} required />
                  </label>
                  <label>
                    Vorbereitete Charge
                    <select ref={mdeChargeSelectRef} value={mdeReceipt.preparedChargeId} onChange={(event) => setMdeReceipt((current) => ({ ...current, preparedChargeId: event.target.value }))}>
                      <option value="">Charge manuell eingeben</option>
                      {mdePreparedCharges.map((order) => <option key={order.id} value={String(order.id)}>{order.lotNumber} · {order.product}</option>)}
                    </select>
                    {mdeReceipt.barcode && !mdePreparedCharges.length && <small>Keine vorbereitete Charge für dieses Produkt. Lege zuerst unter Bestellungen einen Produktionsauftrag an.</small>}
                  </label>
                  {!mdePreparedCharge && <label>
                    Charge / Los
                    <input maxLength={40} autoComplete="off" value={mdeReceipt.lot} onChange={(event) => setMdeReceipt((current) => ({ ...current, lot: event.target.value }))} placeholder="z. B. CH26-014" />
                  </label>}
                  <label>
                    MHD
                    <input type="date" value={mdeReceipt.bestBefore} onChange={(event) => setMdeReceipt((current) => ({ ...current, bestBefore: event.target.value }))} />
                  </label>
                  <label className="mde-note-field">
                    Notiz / Lieferschein
                    <input maxLength="250" value={mdeReceipt.note} onChange={(event) => setMdeReceipt((current) => ({ ...current, note: event.target.value }))} placeholder="Optional" />
                  </label>
                  <button className="primary-button" type="submit" disabled={mdeBusy}>{mdeBusy ? 'Wird gebucht …' : 'Wareneingang buchen'}</button>
                </form>
                <div className="mde-recent-movements">
                  <div className="panel-header"><h3>Letzte Lagerbewegungen</h3><span>{stockMovements.length} Buchungen</span></div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead><tr><th>Zeit</th><th>Vorgang</th><th>Produkt</th><th>Menge</th><th>Referenz / Notiz</th><th>Benutzer</th></tr></thead>
                      <tbody>
                        {[...stockMovements].sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp))).slice(0, 12).map((movement) => (
                          <tr key={movement.id}>
                            <td>{formatTimestamp(movement.timestamp)}</td>
                            <td>{movement.type}</td>
                            <td>{movement.productName}</td>
                            <td>{['Warenausgang', 'Bruch'].includes(movement.type) ? '−' : '+'}{Number(movement.quantity).toLocaleString('de-DE')}</td>
                            <td>{movement.referenceNumber || movement.note || '–'}</td>
                            <td>{movement.userName || '–'}</td>
                          </tr>
                        ))}
                        {stockMovements.length === 0 && <tr><td colSpan="6">Noch keine Scannerbuchungen erfasst.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel mde-scan-panel">
                <div className="panel-header">
                  <div><span className="eyebrow">Auslagern</span><h2>Auftrag kommissionieren</h2></div>
                  <span className="mde-scan-badge">Bestand wird beim Abschluss abgebucht</span>
                </div>
                <form className="mde-order-scan-form" onSubmit={scanMdeOrder}>
                  <label>
                    Auftragsnummer scannen
                    <input ref={!mdeSelectedOrder ? mdeScanInputRef : undefined} autoComplete="off" value={mdeOrderScan} onChange={(event) => setMdeOrderScan(event.target.value)} placeholder="z. B. KA-2026-0001" />
                  </label>
                  <button type="submit" className="secondary-button">Auftrag laden</button>
                  <label>
                    Oder offenen Auftrag auswählen
                    <select value={mdeOrderId} onChange={(event) => { setMdeOrderId(event.target.value); setMdeScannedQuantities({}); setMdeMessage('') }}>
                      <option value="">Auftrag auswählen …</option>
                      {mdeOpenOrders.map((document) => <option key={document.id} value={document.id}>{document.number} · {document.recipient} · {document.status}</option>)}
                    </select>
                  </label>
                </form>
                {mdeSelectedOrder && (
                  <div className="mde-order-panel">
                    <div className="mde-order-summary">
                      <div><span>Auftrag</span><strong>{mdeSelectedOrder.number}</strong></div>
                      <div><span>Kunde</span><strong>{mdeSelectedOrder.recipient}</strong></div>
                      <div><span>E-Mail</span><strong>{mdeSelectedOrder.recipientEmail || 'Fehlt – bitte Auftrag ergänzen'}</strong></div>
                      <div><span>Fortschritt</span><strong>{mdeOrderLines.reduce((sum, line) => sum + line.scanned, 0)} / {mdeOrderLines.reduce((sum, line) => sum + line.required, 0)} Dosen</strong></div>
                      <div><span>Status</span><strong>{mdeSelectedOrder.status}</strong></div>
                      {mdeSelectedOrder.status === 'Kommissionierung' && (
                        <div><span>Kommissioniert von</span><strong>{mdeSelectedOrder.pickingUserName || 'Mitarbeiter'}</strong></div>
                      )}
                    </div>
                    {mdeSelectedOrder.status !== 'Kommissionierung' ? (
                      <button type="button" className="primary-button" disabled={mdeBusy} onClick={acceptMdeOrderOnDevice}>
                        {mdeBusy ? 'Auftrag wird angenommen …' : 'Auftrag jetzt annehmen'}
                      </button>
                    ) : String(mdeSelectedOrder.pickingUserId) === String(currentUser?.id) ? (
                      <form className="mde-product-scan-form" onSubmit={scanMdeProduct}>
                        <label>
                          Artikelbarcode scannen
                          <input ref={mdeScanInputRef} autoComplete="off" autoCapitalize="off" value={mdeProductScan} onChange={(event) => setMdeProductScan(event.target.value)} placeholder="Produkt scannen und Enter drücken" />
                        </label>
                        <button type="submit" className="primary-button" disabled={mdeBusy}>{mdeBusy ? 'Barcode wird geprüft …' : 'Artikel scannen'}</button>
                      </form>
                    ) : (
                      <p className="mde-feedback">Dieser Auftrag wird bereits von {mdeSelectedOrder.pickingUserName || 'einem anderen Mitarbeiter'} kommissioniert.</p>
                    )}
                    <div className="mde-pick-list">
                      {mdeOrderLines.map((line) => {
                        const complete = line.scanned === line.required
                        return (
                          <article key={line.productId} className={`mde-pick-item ${complete ? 'complete' : ''}`}>
                            <div><strong>{line.name}</strong><span>{line.sku || 'Keine SKU'} · EAN {line.ean || 'fehlt'}</span>
                              {line.lots[0] && <span className="mde-fefo">Zuerst nehmen: Charge {line.lots[0].lot || '–'}{line.lots[0].bestBefore ? ` · MHD ${new Date(line.lots[0].bestBefore).toLocaleDateString('de-DE')}` : ''} ({line.lots[0].quantity} Dosen)</span>}
                            </div>
                            <div className="mde-pick-quantity"><strong>{line.scanned} / {line.required} Dosen</strong><span>{Number.isSafeInteger(line.available) ? `${line.available} Dosen verfügbar` : 'Dosenbestand nicht erfasst'}</span></div>
                          </article>
                        )
                      })}
                      {mdeOrderLines.length === 0 && <p>Dieser Auftrag enthält keine zugeordneten Produkte.</p>}
                    </div>
                    <button type="button" className="primary-button mde-complete-button" disabled={mdeBusy || mdeSelectedOrder.status !== 'Kommissionierung' || String(mdeSelectedOrder.pickingUserId) !== String(currentUser?.id) || !mdeOrderLines.length || mdeOrderLines.some((line) => line.scanned !== line.required)} onClick={completeMdePacking}>
                      {mdeBusy ? 'Abschluss wird verarbeitet …' : 'Verpacken, Bestand abbuchen & Etikett drucken'}
                    </button>
                  </div>
                )}
                {salesDocuments.some((document) => document.kind === 'kundenauftrag' && document.status === 'Verpackt' && document.packedNotificationStatus !== 'sent') && (
                  <div className="mde-mail-retries">
                    <h3>Offene Kundenbenachrichtigungen</h3>
                    {salesDocuments.filter((document) => document.kind === 'kundenauftrag' && document.status === 'Verpackt' && document.packedNotificationStatus !== 'sent').map((document) => (
                      <div className="mde-mail-retry" key={document.id}>
                        <span>{document.number} · {document.recipientEmail || 'Keine E-Mail hinterlegt'}</span>
                        <button type="button" className="secondary-button small" disabled={mdeBusy || !document.recipientEmail} onClick={() => retryPackedNotification(document)}>E-Mail erneut senden</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {mdeMessage && <p className="mde-feedback" role="status">{mdeMessage}</p>}
          </section>
        )}

        {activeTab === 'versand' && (
          <section className="shipment-workspace">
            <div className="mde-header panel">
              <div>
                <p className="eyebrow">Versandzentrale</p>
                <h2>Pakete, Etiketten &amp; Sendungsverfolgung</h2>
                <p className="meta">Versanddaten werden in der Cloud gespeichert und mit dem Kundenauftrag synchronisiert. DPD und Spedition sind verfügbar; für echte frankierte DPD-Labels muss der DPD-Webservice-Zugang eingerichtet sein. Bis dahin druckt die App interne Adressetiketten ohne Porto.</p>
              </div>
            </div>
            {salesDocuments.filter((document) =>
              document.kind === 'kundenauftrag' && ['Verpackt', 'Versendet'].includes(document.status),
            ).length ? (
              <div className="shipment-list">
                {salesDocuments
                  .filter((document) => document.kind === 'kundenauftrag' && ['Verpackt', 'Versendet'].includes(document.status))
                  .sort((left, right) => String(right.packedAt || '').localeCompare(String(left.packedAt || '')))
                  .map((salesDocument) => {
                    const draft = getShipmentDraft(salesDocument)
                    const trackingUrl = shipmentActions.getTrackingUrl(salesDocument)
                    return (
                      <article className="panel shipment-card" key={salesDocument.id}>
                        <div className="shipment-card-header">
                          <div>
                            <span className="eyebrow">{salesDocument.status}</span>
                            <h3>{salesDocument.number} · {salesDocument.recipient}</h3>
                          </div>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              const nativePrintAvailable = Boolean(window.zyroScanner?.printLabel)
                              const labelWindow = nativePrintAvailable ? null : window.open('', '_blank', 'width=820,height=640')
                              if (!nativePrintAvailable && !labelWindow) {
                                setMdeMessage('Der Etikettendruck wurde vom Browser blockiert. Bitte Pop-ups erlauben.')
                                return
                              }
                              printMdeShippingLabel(labelWindow, salesDocument, {
                                ...salesDocument,
                                ...draft,
                                carrierName: draft.carrier === 'DPD' ? 'DPD' : draft.carrierName,
                              })
                            }}
                          >
                            Internes Versandetikett drucken
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => printMdeDeliveryNote(salesDocument)}
                          >
                            Eigenen Lieferschein drucken
                          </button>
                        </div>
                        <div className="shipment-address">
                          <strong>Lieferadresse</strong>
                          <span>{salesDocument.shippingAddress || salesDocument.recipientAddress || 'Keine Lieferadresse hinterlegt'}</span>
                          {salesDocument.shippingLabelCreatedAt && <span>Versandetikett erstellt am {formatTimestamp(salesDocument.shippingLabelCreatedAt)}{salesDocument.shippingLabelCreatedBy ? ` von ${salesDocument.shippingLabelCreatedBy}` : ''} · auch im Dokumentenarchiv</span>}
                          {salesDocument.recipientEmail && <span>{salesDocument.recipientEmail}</span>}
                          {(() => {
                            const weight = getSalesDocumentItems(salesDocument).reduce((sum, item) => {
                              const product = products.find((entry) => String(entry.id) === String(item.productId) || (item.productSku && entry.sku === item.productSku))
                              return sum + (Number(item.quantity) || 0) * (Number(product?.weightKg) || 0)
                            }, 0)
                            if (weight <= 0) return null
                            return <span><strong>Gewicht ca. {weight.toLocaleString('de-DE', { maximumFractionDigits: 1 })} kg</strong> · Empfehlung: {weight <= 31.5 ? 'DPD Paket' : 'Spedition / mehrere Pakete (über 31,5 kg)'}</span>
                          })()}
                        </div>
                        {salesDocument.status === 'Verpackt' ? (
                          <form className="shipment-form" onSubmit={(event) => { event.preventDefault(); shipmentActions.saveShipment(salesDocument) }}>
                            <label>
                              Versanddienst
                              <select value={draft.carrier} onChange={(event) => shipmentActions.updateDraft(salesDocument, 'carrier', event.target.value)}>
                                <option value="DPD">DPD</option>
                                <option value="Spedition">Spedition</option>
                              </select>
                            </label>
                            {draft.carrier === 'Spedition' && (
                              <label>
                                Name der Spedition
                                <input value={draft.carrierName} maxLength="100" onChange={(event) => shipmentActions.updateDraft(salesDocument, 'carrierName', event.target.value)} required />
                              </label>
                            )}
                            <label>
                              Sendungsnummer
                              <input value={draft.trackingNumber} maxLength="120" onChange={(event) => shipmentActions.updateDraft(salesDocument, 'trackingNumber', event.target.value)} required />
                            </label>
                            <label>
                              Tracking-Link (optional, HTTPS)
                              <input type="url" placeholder="https://…" value={draft.trackingUrl} maxLength="2000" onChange={(event) => shipmentActions.updateDraft(salesDocument, 'trackingUrl', event.target.value)} />
                            </label>
                            <button type="submit" className="primary-button" disabled={mdeBusy}>{mdeBusy ? 'Versand wird gespeichert …' : 'Als versendet markieren'}</button>
                          </form>
                        ) : (
                          <div className="shipment-tracking">
                            <span><strong>{salesDocument.carrierName || salesDocument.carrier}</strong> · {salesDocument.trackingNumber || 'Keine Sendungsnummer'}</span>
                            {trackingUrl && <a className="secondary-button" href={trackingUrl} target="_blank" rel="noopener noreferrer">Sendung verfolgen</a>}
                            {salesDocument.trackingToken && (
                              <a className="secondary-button" href={`/tracking/?token=${encodeURIComponent(salesDocument.trackingToken)}`} target="_blank" rel="noopener noreferrer">
                                Kunden-Trackingseite öffnen
                              </a>
                            )}
                            <span>{salesDocument.shipmentNotificationStatus === 'sent' ? 'Kunden-E-Mail mit Sendungsverfolgung gesendet.' : `Kunden-E-Mail noch nicht gesendet${salesDocument.shipmentNotificationError ? `: ${salesDocument.shipmentNotificationError}` : '.'}`}</span>
                            {salesDocument.shipmentNotificationStatus !== 'sent' && (
                              <button type="button" className="primary-button small" disabled={mdeBusy || !salesDocument.recipientEmail} onClick={() => retryShipmentNotification(salesDocument)}>E-Mail mit Tracking erneut senden</button>
                            )}
                            {salesDocument.deliveryConfirmedAt ? (
                              <>
                                <span>Zustellung bestätigt{salesDocument.deliveryConfirmationSource === 'DHL' ? ' durch DHL' : ' manuell'} · {formatTimestamp(salesDocument.deliveryConfirmedAt)}</span>
                                <span>{salesDocument.reviewRequestStatus === 'sent'
                                  ? 'Bewertungs-E-Mail gesendet.'
                                  : salesDocument.reviewRequestStatus === 'submitted'
                                    ? 'Kundenbewertung eingegangen und wartet auf Freigabe.'
                                    : salesDocument.reviewRequestStatus === 'skipped'
                                        ? `Bewertungs-E-Mail wurde übersprungen${salesDocument.reviewRequestError ? `: ${salesDocument.reviewRequestError}` : '.'}`
                                        : salesDocument.reviewRequestStatus === 'sending'
                                          ? 'Bewertungs-E-Mail wird gerade versendet.'
                                          : `Bewertungs-E-Mail noch nicht gesendet${salesDocument.reviewRequestError ? `: ${salesDocument.reviewRequestError}` : '.'}`}</span>
                                {salesDocument.reviewRequestStatus === 'failed' && (
                                  <button type="button" className="primary-button small" disabled={mdeBusy || !salesDocument.recipientEmail} onClick={() => retryReviewRequest(salesDocument)}>Bewertungs-E-Mail erneut senden</button>
                                )}
                              </>
                            ) : salesDocument.carrier === 'DHL' ? (
                              <span>DHL-Zustellung wird automatisch geprüft. Die Bewertungs-E-Mail folgt nach bestätigter Zustellung.</span>
                            ) : (
                              <button type="button" className="secondary-button" disabled={mdeBusy} onClick={() => confirmShipmentDelivery(salesDocument)}>
                                Zustellung bestätigen &amp; Bewertung anfragen
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    )
                  })}
              </div>
            ) : (
              <div className="panel shipment-empty">
                <h3>Noch keine verpackten Aufträge</h3>
                <p>Nimm Aufträge im MDE-Scanner an, scanne alle Artikel und schließe die Verpackung ab. Danach erscheinen sie hier für Versand und Tracking.</p>
              </div>
            )}
            {mdeMessage && <p className="mde-feedback" role="status">{mdeMessage}</p>}
          </section>
        )}

        {activeTab === 'einkauf' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>{editingSupplierId ? 'Lieferant bearbeiten' : 'Lieferant anlegen'}</h2>
                  <p className="meta">Lieferantenstamm für Bestellungen und Eingangsrechnungen</p>
                </div>
              </div>
              <form className="form-grid" onSubmit={saveSupplier}>
                <label>Name / Firma<input maxLength="160" required value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Straße<input maxLength="180" value={supplierForm.street} onChange={(event) => setSupplierForm((current) => ({ ...current, street: event.target.value }))} /></label>
                <label>PLZ<input maxLength="20" value={supplierForm.postalCode} onChange={(event) => setSupplierForm((current) => ({ ...current, postalCode: event.target.value }))} /></label>
                <label>Ort<input maxLength="100" value={supplierForm.city} onChange={(event) => setSupplierForm((current) => ({ ...current, city: event.target.value }))} /></label>
                <label>Land<input maxLength="80" value={supplierForm.country} onChange={(event) => setSupplierForm((current) => ({ ...current, country: event.target.value }))} /></label>
                <label>E-Mail<input type="email" maxLength="254" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label>Telefon<input type="tel" maxLength="50" value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label>USt-IdNr. / Steuernummer<input maxLength="40" value={supplierForm.taxId} onChange={(event) => setSupplierForm((current) => ({ ...current, taxId: event.target.value }))} /></label>
                <div className="finance-form-actions">
                  <button type="submit" className="primary-button">{editingSupplierId ? 'Änderungen speichern' : 'Lieferant speichern'}</button>
                  {editingSupplierId && <button type="button" className="secondary-button" onClick={() => {
                    setEditingSupplierId('')
                    setSupplierForm({ name: '', street: '', postalCode: '', city: '', country: 'Deutschland', email: '', phone: '', taxId: '' })
                  }}>Abbrechen</button>}
                </div>
              </form>
              <div className="card-list">
                {suppliers.map((supplier) => (
                  <article className="mini-card" key={supplier.id}>
                    <div className="mini-head"><h3>{supplier.name}</h3><span>{supplier.taxId || 'Keine Steuer-ID'}</span></div>
                    <p>{[supplier.street, [supplier.postalCode, supplier.city].filter(Boolean).join(' '), supplier.country].filter(Boolean).join(' · ') || 'Keine Anschrift hinterlegt'}</p>
                    <p>{[supplier.email, supplier.phone].filter(Boolean).join(' · ') || 'Keine Kontaktdaten hinterlegt'}</p>
                    <button type="button" className="secondary-button small" onClick={() => {
                      setEditingSupplierId(supplier.id)
                      setSupplierForm({
                        name: supplier.name,
                        street: supplier.street || '',
                        postalCode: supplier.postalCode || '',
                        city: supplier.city || '',
                        country: supplier.country || '',
                        email: supplier.email || '',
                        phone: supplier.phone || '',
                        taxId: supplier.taxId || '',
                      })
                    }}>Bearbeiten</button>
                  </article>
                ))}
                {suppliers.length === 0 && <p>Noch keine Lieferanten angelegt.</p>}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Einkaufsauftrag anlegen</h2>
                  <p className="meta">Produktbestellungen mit Mengen, Nettopreisen und erwarteter Lieferung</p>
                </div>
              </div>
              <form className="form-grid" onSubmit={createPurchaseOrder}>
                <label>Lieferant
                  <select required value={purchaseOrderForm.supplierId} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, supplierId: event.target.value }))}>
                    <option value="">Bitte auswählen</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label>Erwartete Lieferung<input type="date" value={purchaseOrderForm.expectedDate} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, expectedDate: event.target.value }))} /></label>
                <label>Umsatzsteuer
                  <select value={purchaseOrderForm.vatRate} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, vatRate: event.target.value }))}>
                    <option value="19">19 %</option><option value="7">7 %</option><option value="0">0 %</option>
                  </select>
                </label>
                <label>Lieferanten-Rechnungsnummer (optional)<input maxLength="80" value={purchaseOrderForm.invoiceNumber} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, invoiceNumber: event.target.value }))} /></label>
                <label>Rechnungsdatum<input type="date" value={purchaseOrderForm.invoiceDate} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, invoiceDate: event.target.value }))} /></label>
                <label>Fällig am<input type="date" value={purchaseOrderForm.dueDate} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
                <label>Tatsächliches Zahlungsdatum<input type="date" value={purchaseOrderForm.paidAt} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, paidAt: event.target.value }))} /></label>
                <label className="full-width">Notiz<input maxLength="500" value={purchaseOrderForm.note} onChange={(event) => setPurchaseOrderForm((current) => ({ ...current, note: event.target.value }))} /></label>
                <div className="full-width">
                  <h3>Bestellpositionen · Fertigprodukte</h3>
                  {purchaseOrderForm.lines.map((line, index) => (
                    <div className="form-grid" key={`purchase-line-${index}`}>
                      <label>Produkt
                        <select required value={line.productId} onChange={(event) => setPurchaseOrderForm((current) => ({
                          ...current,
                          lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, productId: event.target.value } : item),
                        }))}>
                          <option value="">Bitte auswählen</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}
                        </select>
                      </label>
                      <label>Menge (Einheiten)<input type="number" min="1" max="1000000" step="1" required value={line.quantity} onChange={(event) => setPurchaseOrderForm((current) => ({
                        ...current,
                        lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: event.target.value } : item),
                      }))} /></label>
                      <label>Netto-Preis je Einheit (€)<input type="number" min="0.01" step="0.01" required value={line.unitCost} onChange={(event) => setPurchaseOrderForm((current) => ({
                        ...current,
                        lines: current.lines.map((item, lineIndex) => lineIndex === index ? { ...item, unitCost: event.target.value } : item),
                      }))} /></label>
                      {purchaseOrderForm.lines.length > 1 && <button type="button" className="secondary-button small" onClick={() => setPurchaseOrderForm((current) => ({ ...current, lines: current.lines.filter((_item, lineIndex) => lineIndex !== index) }))}>Position entfernen</button>}
                    </div>
                  ))}
                  <button type="button" className="secondary-button small" onClick={() => setPurchaseOrderForm((current) => ({ ...current, lines: [...current.lines, { productId: '', quantity: '1', unitCost: '' }] }))}>Position hinzufügen</button>
                  <small className="meta">Rohstoffe mit Prozentbestand im Lager werden noch nicht mengenmäßig fortgeschrieben. Einheiten und Nettopreise vor dem Bestellen prüfen.</small>
                </div>
                <button type="submit" className="primary-button full-width" disabled={!suppliers.length || !products.length}>Einkaufsauftrag anlegen</button>
              </form>
            </div>

            <div className="panel full-width">
              <div className="panel-header"><h2>Einkaufsaufträge</h2><span>{purchaseOrders.length} Aufträge</span></div>
              <div className="card-list">
                {purchaseOrders.map((order) => {
                  const linkedEntry = financeEntries.find((entry) => String(entry.sourcePurchaseOrderId || '') === String(order.id))
                  const netCents = order.lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0)
                  const grossCents = Math.round(netCents * (1 + order.vatRate / 100))
                  const receiptDraft = purchaseReceiptDrafts[order.id] || {}
                  return (
                    <article className="mini-card" key={order.id}>
                      <div className="mini-head">
                        <h3>{order.number} · {order.supplierName}</h3>
                        <span className="pill">{({ ordered: 'Bestellt', partial: 'Teillieferung', received: 'Vollständig geliefert', cancelled: 'Storniert' })[order.status] || order.status}</span>
                      </div>
                      <p>Bestelldatum {order.orderDate}{order.expectedDate ? ` · erwartet ${order.expectedDate}` : ''} · Netto {formatFinanceEuro(netCents)} · Brutto {formatFinanceEuro(grossCents)}</p>
                      {order.note && <p>{order.note}</p>}
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead><tr><th>Produkt</th><th>Menge bestellt</th><th>Eingegangen</th><th>Netto je Einheit</th></tr></thead>
                          <tbody>{order.lines.map((line) => <tr key={line.id}>
                            <td>{line.productName}<small className="table-subtext">{line.sku || '–'}</small></td>
                            <td>{line.quantity}</td>
                            <td>{line.receivedQuantity}</td>
                            <td>{formatFinanceEuro(line.unitCostCents)}</td>
                          </tr>)}</tbody>
                        </table>
                      </div>
                      {order.status === 'ordered' || order.status === 'partial' ? (
                        <div className="panel">
                          <h4>Wareneingang buchen · Bestand wird atomar aktualisiert</h4>
                          {order.lines.filter((line) => line.receivedQuantity < line.quantity).map((line) => {
                            const remaining = line.quantity - line.receivedQuantity
                            const lineDraft = receiptDraft[line.id] || {}
                            return (
                              <div className="form-grid" key={`receive-${line.id}`}>
                                <label>{line.productName} · offen {remaining}
                                  <input aria-label={`Wareneingangsmenge ${line.productName}`} type="number" min="0" max={remaining} step="1" value={lineDraft.quantity ?? String(remaining)} onChange={(event) => setPurchaseReceiptDrafts((current) => ({
                                    ...current,
                                    [order.id]: { ...(current[order.id] || {}), [line.id]: { ...lineDraft, quantity: event.target.value } },
                                  }))} />
                                </label>
                                <label>Charge / Los<input maxLength="40" value={lineDraft.lot || ''} onChange={(event) => setPurchaseReceiptDrafts((current) => ({
                                  ...current,
                                  [order.id]: { ...(current[order.id] || {}), [line.id]: { ...lineDraft, lot: event.target.value } },
                                }))} /></label>
                                <label>MHD<input type="date" value={lineDraft.bestBefore || ''} onChange={(event) => setPurchaseReceiptDrafts((current) => ({
                                  ...current,
                                  [order.id]: { ...(current[order.id] || {}), [line.id]: { ...lineDraft, bestBefore: event.target.value } },
                                }))} /></label>
                              </div>
                            )
                          })}
                          <button type="button" className="primary-button" disabled={purchaseBusyId === order.id} onClick={() => receivePurchaseOrder(order)}>{purchaseBusyId === order.id ? 'Wareneingang wird gebucht …' : 'Wareneingang buchen'}</button>
                        </div>
                      ) : null}
                      <div className="form-grid">
                        <label>Lieferanten-Rechnungsnummer<input maxLength="80" value={order.invoiceNumber || ''} disabled={Boolean(linkedEntry)} onChange={(event) => updatePurchaseInvoice(order.id, 'invoiceNumber', event.target.value)} /></label>
                        <label>Rechnungsdatum<input type="date" value={order.invoiceDate || ''} disabled={Boolean(linkedEntry)} onChange={(event) => updatePurchaseInvoice(order.id, 'invoiceDate', event.target.value)} /></label>
                        <label>Fällig am<input type="date" value={order.dueDate || ''} disabled={Boolean(linkedEntry)} onChange={(event) => updatePurchaseInvoice(order.id, 'dueDate', event.target.value)} /></label>
                        <label>Tatsächlich bezahlt am<input type="date" value={order.paidAt || ''} disabled={Boolean(linkedEntry)} onChange={(event) => updatePurchaseInvoice(order.id, 'paidAt', event.target.value)} /></label>
                      </div>
                      {order.invoiceNumber && order.invoiceDate && (
                        linkedEntry
                          ? <p className="meta">In Finanzen übernommen · Buchung {linkedEntry.documentNumber} · {linkedEntry.paidAt ? `bezahlt ${linkedEntry.paidAt}` : 'Zahlung offen'}</p>
                          : <button type="button" className="secondary-button" onClick={() => preparePurchaseFinanceEntry(order)}>Eingangsrechnung in Finanzen übernehmen</button>
                      )}
                      {(order.receipts || []).map((receipt) => <small key={receipt.id}>Wareneingang {formatTimestamp(receipt.timestamp)} · {receipt.userName || 'Benutzer'} · {receipt.items.map((item) => `${item.quantity} × ${order.lines.find((line) => line.id === item.lineId)?.productName || 'Produkt'}`).join(', ')}</small>)}
                    </article>
                  )
                })}
                {purchaseOrders.length === 0 && <p>Noch keine Einkaufsaufträge erfasst.</p>}
              </div>
              {purchaseMessage && <p className="form-feedback" role="status">{purchaseMessage}</p>}
            </div>
          </section>
        )}

        {activeTab === 'lager' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Lagerbestand verwalten</h2>
                <span>Inventar</span>
              </div>

              <form className="form-grid" onSubmit={addInventoryItem}>
                <label>
                  Material
                  <input type="text" name="item" value={inventoryForm.item} onChange={handleInventoryInput} placeholder="Zitronensaft" />
                </label>
                <label>
                  Bestand (%)
                  <input type="number" name="stock" value={inventoryForm.stock} onChange={handleInventoryInput} placeholder="80" />
                </label>
                <label>
                  Zielbestand (%)
                  <input type="number" name="ideal" value={inventoryForm.ideal} onChange={handleInventoryInput} placeholder="100" />
                </label>
                <label>
                  Status
                  <select name="status" value={inventoryForm.status} onChange={handleInventoryInput}>
                    <option value="Gut">Gut</option>
                    <option value="Warnung">Warnung</option>
                    <option value="Nachbestellen">Nachbestellen</option>
                  </select>
                </label>
                <button type="submit" className="primary-button full-width-button">
                  {editingInventoryItem ? 'Bestand aktualisieren' : 'Bestand speichern'}
                </button>
                {editingInventoryItem && (
                  <button
                    type="button"
                    className="secondary-button full-width-button"
                    onClick={() => {
                      setEditingInventoryItem(null)
                      setInventoryForm(initialInventoryForm)
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Bestand</h2>
                <span>{inventory.length} Einträge</span>
              </div>

              <div className="inventory-grid">
                {inventory.map((item) => {
                  const isExpanded = expandedInventoryItem === item.item

                  return (
                    <div key={item.item} className={`inventory-card ${isExpanded ? 'expanded' : ''}`}>
                      <button type="button" className="inventory-toggle" onClick={() => toggleInventoryMenu(item.item)}>
                        <div>
                          <p className="inventory-name">{item.item}</p>
                          <small>{item.status}</small>
                        </div>
                        <span>{isExpanded ? '−' : '+'}</span>
                      </button>

                      {isExpanded && (
                        <>
                          <div className="inventory-amount">{item.stock}%</div>
                          <div className="mini-actions">
                            <button type="button" className="secondary-button small" onClick={() => editInventoryItem(item)}>
                              Bearbeiten
                            </button>
                            <button type="button" className="secondary-button small" onClick={() => restockItem(item.item)}>
                              Nachbestellen
                            </button>
                            <button type="button" className="danger-button" onClick={() => removeInventoryItem(item.item)}>
                              {requiresDeleteApproval ? 'Löschanfrage stellen' : 'Entfernen'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="panel inventory-finished-panel">
              <div className="panel-header">
                <div>
                  <h2>Fertigwaren · Dosenbestand</h2>
                  <p className="meta">MDE-Wareneingänge und verpackte Aufträge aktualisieren den Dosenbestand automatisch.</p>
                </div>
                <strong>{totals.trackedBottleProductCount ? `${totals.availableBottles.toLocaleString('de-DE')} Dosen erfasst` : 'Noch keine Bestände erfasst'}</strong>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Produkt</th><th>SKU</th><th>Dosengröße</th><th>Verfügbar</th><th></th></tr></thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>{product.name}</td>
                        <td>{product.sku || '–'}</td>
                        <td>{product.volume || '–'}</td>
                        <td>{Number.isSafeInteger(product.availableBottles) && product.availableBottles >= 0
                          ? `${product.availableBottles.toLocaleString('de-DE')} Dosen`
                          : <span className="stock-not-recorded">Nicht erfasst</span>}</td>
                        <td><button type="button" className="secondary-button small" onClick={() => {
                          editProduct(product)
                          setActiveTab('produkte')
                        }}>Bestand pflegen</button></td>
                      </tr>
                    ))}
                    {products.length === 0 && <tr><td colSpan="5">Noch keine Produkte angelegt.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'chargen' && (
          <section className="panel">
            <div className="panel-header">
              <h2>Chargen- und Qualitätsprotokoll</h2>
              <span>Rückverfolgbarkeit</span>
            </div>
            <div className="table-scroll">
              <table className="data-table lot-table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Produkt</th>
                    <th>Dosen</th>
                    <th>Trays</th>
                    <th>Lohnabfüller</th>
                    <th>Übergabe</th>
                    <th>Geschmacksstatus</th>
                    <th>Verkostungsnotiz</th>
                    <th>Prüfverlauf</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.lotNumber}</td>
                      <td>{order.product}</td>
                      <td>{order.bottleCount ?? '-'}</td>
                      <td>{order.crateCount ?? '-'}</td>
                      <td>{order.bottler || bottlerDetails.name}</td>
                      <td>{order.handoffDate || '-'}</td>
                      <td>
                        <select
                          className="lot-quality-select"
                          data-quality={qualityDrafts[order.id]?.qualityStatus ?? order.qualityStatus ?? 'Nicht geprüft'}
                          value={qualityDrafts[order.id]?.qualityStatus ?? order.qualityStatus ?? 'Nicht geprüft'}
                          onChange={(event) => handleQualityDraft(order.id, 'qualityStatus', event.target.value)}
                        >
                          <option>Nicht geprüft</option>
                          <option>Unauffällig</option>
                          <option>Verdacht</option>
                          <option>Fehlerhaft</option>
                        </select>
                      </td>
                      <td>
                        <textarea
                          className="lot-note-input"
                          value={qualityDrafts[order.id]?.qualityNotes ?? order.qualityNotes ?? ''}
                          onChange={(event) => handleQualityDraft(order.id, 'qualityNotes', event.target.value)}
                          placeholder="z. B. bitterer Nachgeschmack"
                        />
                      </td>
                      <td>
                        {order.qualityHistory?.length ? (
                          <details className="lot-history">
                            <summary>{order.qualityHistory.length} Prüfung(en)</summary>
                            <ul>
                              {[...order.qualityHistory].reverse().map((review) => (
                                <li key={review.id}>
                                  <strong>{review.status}</strong> · {new Date(review.checkedAt).toLocaleString('de-DE')}
                                  {review.notes && <p>{review.notes}</p>}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          <span>Keine Prüfung</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button small"
                          disabled={!qualityDrafts[order.id]}
                          onClick={() => saveQualityReview(order.id)}
                        >
                          Speichern
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'etiketten' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Dosendesign</h2>
                <span>500 ml · Produktetikett</span>
              </div>
              <form className="form-grid" onSubmit={(event) => { event.preventDefault(); saveBottleLabel() }}>
                <label className="full-width">
                  Produkt
                  <select required value={labelProductId} onChange={(event) => selectLabelProduct(event.target.value)}>
                    <option value="">Produkt auswählen</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}
                  </select>
                </label>
                <label>
                  Füllmenge
                  <input required maxLength={20} name="volume" value={bottleLabel.volume} onChange={handleBottleLabelInput} placeholder="0,5 l" />
                </label>
                <label>
                  Dosenformat
                  <select name="labelFormat" value={bottleLabel.labelFormat} onChange={(event) => setBottleLabel((current) => event.target.value === 'custom'
                    ? { ...current, labelFormat: 'custom' }
                    : { ...current, labelFormat: event.target.value, widthMm: event.target.value === 'rundum' ? '190' : '90', heightMm: event.target.value === 'rundum' ? '100' : '110' })}>
                    <option value="rundum">Rundumetikett · 190 × 100 mm</option>
                    <option value="front">500 ml · Frontetikett</option>
                    <option value="custom">Eigenes Maß</option>
                  </select>
                </label>
                <label>
                  EAN-13
                  <input required inputMode="numeric" pattern="[0-9]{13}" maxLength={13} name="ean13" value={bottleLabel.ean13} onChange={handleBottleLabelInput} placeholder="13 Ziffern" />
                </label>
                <label>
                  Tagline links (optional)
                  <input maxLength={80} name="tagline" value={bottleLabel.tagline} onChange={handleBottleLabelInput} placeholder="z. B. Mehr als eine Limonade" />
                </label>
                <label className="full-width">
                  Produktbeschreibung unter dem Namen
                  <input maxLength={120} name="productDescription" value={bottleLabel.productDescription} onChange={handleBottleLabelInput} placeholder="z. B. Pfirsich × Maracuja · natürlich fruchtig" />
                </label>
                <label className="full-width">
                  Markenstory links (optional)
                  <textarea maxLength={500} rows={3} name="backDescription" value={bottleLabel.backDescription} onChange={handleBottleLabelInput} placeholder="Kurze Marken- oder Produktgeschichte" />
                </label>
                <label className="full-width">
                  Frucht-/Produktmotiv für die Mitte
                  <input type="file" accept="image/*" onChange={handleLabelArtworkUpload} />
                  {bottleLabel.artworkDataUrl && <img className="label-artwork-upload-preview" src={bottleLabel.artworkDataUrl} alt="Hochgeladenes Produktmotiv" />}
                </label>
                <label className="full-width">
                  Zutaten (in absteigender Reihenfolge)
                  <textarea required maxLength={3000} rows={4} name="ingredients" value={bottleLabel.ingredients} onChange={handleBottleLabelInput} placeholder="z. B. Wasser, Zucker, Fruchtsaftkonzentrat …" />
                </label>
                <label className="full-width">
                  Allergene / Allergenhinweis
                  <input required maxLength={500} name="allergens" value={bottleLabel.allergens} onChange={handleBottleLabelInput} placeholder="Enthält … oder Keine kennzeichnungspflichtigen Allergene" />
                </label>
                <div className="full-width">
                  <h3>Nährwerte je 100 ml</h3>
                  <button type="button" className="secondary-button" onClick={estimateBottleLabelNutrition} disabled={labelDesignLoading || !labelProductId || !aiStatus?.labelConfigured}>
                    {labelDesignLoading ? 'Nährwerte werden berechnet …' : 'Nährwerte aus Rezeptur schätzen'}
                  </button>
                  {bottleLabel.nutritionEstimated && <small>KI-Schätzung vom {formatTimestamp(bottleLabel.nutritionEstimatedAt)} · noch nicht bestätigt</small>}
                </div>
                <label>Energie (kJ)<input required type="number" min="0" step="1" name="energyKj" value={bottleLabel.energyKj} onChange={handleBottleLabelInput} /></label>
                <label>Energie (kcal)<input required type="number" min="0" step="1" name="energyKcal" value={bottleLabel.energyKcal} onChange={handleBottleLabelInput} /></label>
                <label>Fett (g)<input required type="number" min="0" step="0.1" name="fat" value={bottleLabel.fat} onChange={handleBottleLabelInput} /></label>
                <label>davon gesättigte Fettsäuren (g)<input required type="number" min="0" step="0.1" name="saturates" value={bottleLabel.saturates} onChange={handleBottleLabelInput} /></label>
                <label>Kohlenhydrate (g)<input required type="number" min="0" step="0.1" name="carbohydrates" value={bottleLabel.carbohydrates} onChange={handleBottleLabelInput} /></label>
                <label>davon Zucker (g)<input required type="number" min="0" step="0.1" name="sugars" value={bottleLabel.sugars} onChange={handleBottleLabelInput} /></label>
                <label>Eiweiß (g)<input required type="number" min="0" step="0.1" name="protein" value={bottleLabel.protein} onChange={handleBottleLabelInput} /></label>
                <label>Salz (g)<input required type="number" min="0" step="0.01" name="salt" value={bottleLabel.salt} onChange={handleBottleLabelInput} /></label>
                <label className="nutrition-confirmation full-width">
                  <input type="checkbox" checked={bottleLabel.nutritionConfirmed} onChange={(event) => setBottleLabel((current) => ({ ...current, nutritionConfirmed: event.target.checked }))} />
                  <span>Ich habe die Nährwerte fachlich oder anhand einer Laboranalyse geprüft.</span>
                </label>
                <label className="full-width">
                  Verantwortliches Lebensmittelunternehmen
                  <input required maxLength={120} name="operatorName" value={bottleLabel.operatorName} onChange={handleBottleLabelInput} />
                </label>
                <label className="full-width">
                  Anschrift
                  <textarea required maxLength={300} rows={2} name="operatorAddress" value={bottleLabel.operatorAddress} onChange={handleBottleLabelInput} />
                </label>
                <label className="full-width">
                  Aufbewahrungshinweis (optional)
                  <input maxLength={250} name="storage" value={bottleLabel.storage} onChange={handleBottleLabelInput} placeholder="z. B. Kühl und trocken lagern" />
                </label>
                <label>
                  Pfandhinweis (optional)
                  <input maxLength={80} name="deposit" value={bottleLabel.deposit} onChange={handleBottleLabelInput} placeholder="z. B. 0,25 € Pfand" />
                </label>
                <label>
                  Los / Charge (optional)
                  <input maxLength={40} name="lotNumber" value={bottleLabel.lotNumber} onChange={handleBottleLabelInput} />
                </label>
                <label>
                  Mindestens haltbar bis (optional)
                  <input maxLength={40} name="bestBefore" value={bottleLabel.bestBefore} onChange={handleBottleLabelInput} placeholder="Platzhalter für Chargendruck" />
                </label>
                <label>
                  Etikettenbreite (mm)
                  <input required type="number" min="40" max="200" step="1" name="widthMm" value={bottleLabel.widthMm} onChange={handleBottleLabelInput} />
                </label>
                <label>
                  Etikettenhöhe (mm)
                  <input required type="number" min="40" max="250" step="1" name="heightMm" value={bottleLabel.heightMm} onChange={handleBottleLabelInput} />
                </label>
                <div className="full-width">
                  <h3>ChatGPT-Verbindung</h3>
                  {aiStatus?.labelConfigured ? (
                    <p>ChatGPT verbunden{aiStatus.viaHost ? ' · Haupt-PC' : ''} · {aiStatus.labelModel || 'gpt-4o-mini'}</p>
                  ) : networkStatus?.mode === 'client' ? (
                    <p>OpenAI API-Schlüssel einmalig am Haupt-PC einrichten. Verbundene Geräte nutzen diese Verbindung.</p>
                  ) : (
                    <>
                      <label className="full-width">
                        OpenAI API-Schlüssel
                        <input type="password" value={openAiApiKey} onChange={(event) => setOpenAiApiKey(event.target.value)} placeholder="OpenAI API key" autoComplete="new-password" />
                      </label>
                      <small className="full-width">ChatGPT Plus enthält keinen API-Zugang; ein OpenAI API-Schlüssel mit API-Abrechnung ist erforderlich. Der Schlüssel wird geprüft und verschlüsselt auf diesem PC gespeichert.</small>
                      <button type="button" className="secondary-button" onClick={saveOpenAiApiKey} disabled={openAiKeySaving || !openAiApiKey.trim()}>
                        {openAiKeySaving ? 'Schlüssel wird geprüft …' : 'ChatGPT-Schlüssel prüfen und speichern'}
                      </button>
                    </>
                  )}
                </div>
                <div className="full-width">
                  <h3>KI-Design</h3>
                  {bottleLabel.design && (
                    <div className="label-design-summary">
                      {bottleLabel.design.palette?.map((color) => <span key={color} className="label-color-swatch" style={{ backgroundColor: color }} title={color} />)}
                      <span>{bottleLabel.design.direction}</span>
                    </div>
                  )}
                  <button type="button" className="secondary-button" onClick={generateBottleLabelDesign} disabled={labelDesignLoading || !labelProductId || !aiStatus?.labelConfigured}>
                    {labelDesignLoading ? 'Design wird erstellt …' : 'KI-Design erstellen'}
                  </button>
                  <small>Die KI verändert nur Farben und Motiv, keine Nährwerte oder Pflichttexte.</small>
                </div>
                {labelMessage && <p className="full-width" role="status">{labelMessage}</p>}
                <div className="mini-actions full-width">
                  <button type="submit" className="secondary-button" disabled={labelSaving}>{labelSaving ? 'Speichert …' : 'Etikett speichern'}</button>
                  <button type="button" className="primary-button" onClick={previewBottleLabel}>Vorschau / PDF</button>
                </div>
              </form>
            </div>
            <div className="panel label-preview-panel">
              <div className="panel-header">
                <div>
                  <h2>Live-Vorschau</h2>
                  <span>{bottleLabel.widthMm} × {bottleLabel.heightMm} mm · {bottleLabel.volume}</span>
                </div>
              </div>
              {bottleLabel.nutritionEstimated && !bottleLabel.nutritionConfirmed && <p className="nutrition-estimate-warning" role="status">KI-Schätzung · vor dem Druck fachlich prüfen und bestätigen</p>}
              <article className="label-live-preview" style={{ aspectRatio: `${bottleLabel.widthMm} / ${bottleLabel.heightMm}`, backgroundColor: liveLabelPalette[0], color: liveLabelPalette[2], borderColor: liveLabelPalette[1] }}>
                <aside className="label-live-left" style={{ backgroundColor: liveLabelPalette[0], color: liveLabelPalette[2] }}>
                  <strong className="label-live-side-brand" style={{ color: liveLabelPalette[1] }}>ZYRO®</strong>
                  <h3 style={{ color: liveLabelPalette[1] }}>{bottleLabel.tagline || 'MEHR ALS NUR EIN GETRÄNK.'}</h3>
                  <p>{bottleLabel.backDescription || 'Markenstory und Produktbeschreibung hier eintragen.'}</p>
                  <small>{bottleLabel.operatorName} · {bottleLabel.volume}</small>
                </aside>
                <section className="label-live-center" style={{ backgroundImage: `linear-gradient(145deg, transparent 70%, ${liveLabelPalette[1]} 70% 72%, transparent 72%), linear-gradient(325deg, transparent 82%, ${liveLabelPalette[1]} 82% 84%, transparent 84%), ${liveMotifBackgrounds[liveLabelMotif]}` }}>
                  <span className="label-live-mark" style={{ color: liveLabelPalette[1] }}>Z</span>
                  <span className="label-live-brand" style={{ color: liveLabelPalette[2] }}>ZYRO</span>
                  <h2>{products.find((product) => String(product.id) === String(labelProductId))?.name || 'Produktname'}</h2>
                  <p>{bottleLabel.productDescription || 'Produktbeschreibung'}</p>
                  <div className="label-live-artwork">
                    {bottleLabel.artworkDataUrl
                      ? <img src={bottleLabel.artworkDataUrl} alt="Produktmotiv" />
                      : <div className="label-artwork-placeholder" style={{ color: liveLabelPalette[2], borderColor: liveLabelPalette[1] }}>{liveLabelMotif}<small>Produktmotiv</small></div>}
                  </div>
                  <div className="label-live-footer"><strong>PREMIUM GETRÄNK</strong><span>{bottleLabel.volume}</span></div>
                </section>
                <aside className="label-live-right" style={{ backgroundColor: liveLabelPalette[0], color: liveLabelPalette[2] }}>
                  <p>{bottleLabel.productDescription || 'Erfrischungsgetränk'}</p>
                  <div className="label-live-copy"><strong>Zutaten</strong><span>{bottleLabel.ingredients || 'Zutaten erscheinen hier'}</span></div>
                  <div className="label-live-copy"><strong>Allergene</strong><span>{bottleLabel.allergens || 'Allergenangabe erscheint hier'}</span></div>
                  <div className="label-live-nutrition">
                    <strong>Nährwerte je 100 ml</strong>
                    <span>Energie {bottleLabel.energyKj || '–'} kJ / {bottleLabel.energyKcal || '–'} kcal</span>
                    <span>Fett {bottleLabel.fat || '–'} g · davon gesättigt {bottleLabel.saturates || '–'} g</span>
                    <span>Kohlenhydrate {bottleLabel.carbohydrates || '–'} g · davon Zucker {bottleLabel.sugars || '–'} g</span>
                    <span>Eiweiß {bottleLabel.protein || '–'} g · Salz {bottleLabel.salt || '–'} g</span>
                  </div>
                  {bottleLabel.storage && <div className="label-live-copy"><strong>Aufbewahrung</strong><span>{bottleLabel.storage}</span></div>}
                  <div className="label-live-legal">{bottleLabel.operatorName}<br />{bottleLabel.operatorAddress}{bottleLabel.deposit && ` · ${bottleLabel.deposit}`}</div>
                  <svg className="label-live-barcode" ref={labelBarcodeRef} aria-label="EAN-13 Barcode" />
                  <strong className="label-live-volume">{bottleLabel.volume}</strong>
                </aside>
              </article>
              <div className="label-palette-preview" aria-label="KI-Farbpalette">
                {liveLabelPalette.map((color) => <span key={color} className="label-color-swatch" style={{ backgroundColor: color }} title={color} />)}
                <span>Motiv: {liveLabelMotif}</span>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'telefon' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Internes Telefon</h2>
                  <span>{callConnectionStatus === 'verbunden' ? `${callUsers.filter((user) => String(user.id) !== String(currentUser.id)).length} erreichbar` : 'Nicht verbunden'}</span>
                </div>
                <span className={`status-badge ${callConnectionStatus === 'verbunden' ? 'connected' : ''}`}>
                  {callConnectionStatus === 'verbunden' ? 'Cloud-Telefon verbunden' : callConnectionStatus === 'verbinde' ? 'Verbindung wird aufgebaut …' : 'Offline'}
                </span>
              </div>
              {callError && <p className="network-data-message" role="status">{callError}</p>}
              <audio ref={remoteAudioRef} autoPlay />

              {callInfo && (
                <div className="active-call-panel">
                  <strong>{callInfo.status === 'incoming' ? `Eingehender ${callInfo.videoEnabled ? 'Videoanruf' : 'Sprachanruf'} von ${callInfo.remoteUser.name}` : callInfo.remoteUser.name}</strong>
                  <span>{callInfo.status === 'incoming' ? `Möchte einen ${callInfo.videoEnabled ? 'Videoanruf' : 'Sprachanruf'} beginnen` : callInfo.status === 'ringing' ? 'Klingelt …' : callInfo.status === 'connected' ? `${callInfo.videoEnabled ? 'Videoanruf' : 'Gespräch'} verbunden` : 'Verbindung wird aufgebaut …'}</span>
                  {callInfo.videoEnabled && (
                    <div className="call-video-grid">
                      <div className="call-video-tile">
                        <video ref={remoteVideoRef} autoPlay playsInline muted />
                        {!remoteAudioStream && <span>Warte auf Video …</span>}
                        <strong>{callInfo.remoteUser.name}</strong>
                      </div>
                      <div className="call-video-tile">
                        <video ref={localVideoRef} autoPlay playsInline muted />
                        <strong>Du{!callCameraEnabled ? ' · Kamera aus' : ''}</strong>
                      </div>
                    </div>
                  )}
                  <div className="mini-actions">
                    {callInfo.status === 'incoming' ? (
                      <>
                        <button type="button" className="primary-button" onClick={acceptInternalCall}>{callInfo.videoEnabled ? 'Video annehmen' : 'Annehmen'}</button>
                        <button type="button" className="danger-button" onClick={rejectInternalCall}>Ablehnen</button>
                      </>
                    ) : (
                      <>
                        {callInfo.videoEnabled && <button type="button" className="secondary-button" onClick={toggleCallCamera}>{callCameraEnabled ? 'Kamera ausschalten' : 'Kamera einschalten'}</button>}
                        <button type="button" className="secondary-button" onClick={toggleCallMute}>{callMuted ? 'Mikrofon einschalten' : 'Stummschalten'}</button>
                        <button type="button" className="danger-button" onClick={() => finishCallRef.current(true)}>Auflegen</button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="card-list">
                {callUsers.filter((user) => String(user.id) !== String(currentUser.id)).map((user) => (
                  <article className="mini-card" key={user.id}>
                    <div className="mini-head">
                      <h3>{user.name}</h3>
                      <span className="pill">{user.role}</span>
                    </div>
                    <div className="mini-actions">
                      <button type="button" className="secondary-button" disabled={callConnectionStatus !== 'verbunden' || Boolean(callInfo)} onClick={() => startInternalCall(user, false)}>Sprachanruf</button>
                      <button type="button" className="primary-button" disabled={callConnectionStatus !== 'verbunden' || Boolean(callInfo)} onClick={() => startInternalCall(user, true)}>Videoanruf</button>
                    </div>
                  </article>
                ))}
                {callConnectionStatus === 'verbunden' && callUsers.filter((user) => String(user.id) !== String(currentUser.id)).length === 0 && <p>Derzeit ist kein anderer Mitarbeiter im Telefonnetz angemeldet.</p>}
              </div>
            </div>
            <SipSoftphone sessionToken={authSessionToken} isAdmin={currentUser.role === 'admin'} />
            <div className="panel">
              <div className="panel-header"><h2>Klingelton &amp; Verbindung</h2></div>
              <div className="call-ringtone-settings">
                <label>
                  Klingelton
                  <select value={callRingtone} onChange={(event) => {
                    setCallRingtone(event.target.value)
                    window.localStorage.setItem('zyro-call-ringtone', event.target.value)
                  }}>
                    <option value="classic">Klassisch</option>
                    <option value="gentle">Sanft</option>
                    <option value="digital">Digital</option>
                    <option value="off">Aus</option>
                  </select>
                </label>
                <label className="call-ringtone-volume">
                  Lautstärke <span>{Math.round(callRingtoneVolume * 100)} %</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={callRingtoneVolume}
                    onChange={(event) => {
                      const volume = Number(event.target.value)
                      setCallRingtoneVolume(volume)
                      window.localStorage.setItem('zyro-call-ringtone-volume', String(volume))
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button small"
                  disabled={callRingtone === 'off' || callRingtoneVolume === 0 || ringtonePreviewing || callInfo?.status === 'incoming'}
                  onClick={() => {
                    ringtoneStopRef.current()
                    const stop = startCallRingtone(callRingtone, callRingtoneVolume)
                    ringtoneStopRef.current = stop
                    setRingtonePreviewing(true)
                    window.clearTimeout(ringtonePreviewTimerRef.current)
                    ringtonePreviewTimerRef.current = window.setTimeout(() => {
                      stop()
                      if (ringtoneStopRef.current === stop) ringtoneStopRef.current = () => {}
                      setRingtonePreviewing(false)
                    }, 3000)
                  }}
                >
                  {ringtonePreviewing ? 'Klingelton wird abgespielt …' : 'Klingelton testen'}
                </button>
                <small>Der Ton wiederholt sich bei eingehenden Anrufen, bis du annimmst oder ablehnst. Einstellungen gelten nur auf diesem Gerät.</small>
              </div>
              <p>Anrufsignale und Erreichbarkeit laufen über Firebase. Sprache und Video werden verschlüsselt direkt zwischen den Geräten übertragen.</p>
              <p>Erlaube Safari oder Zyro den Mikrofonzugriff. Für Anrufe müssen beide Personen angemeldet und online sein.</p>
            </div>
          </section>
        )}

        {activeTab === 'dokumente' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Dokumentenarchiv</h2>
                <span>{filteredDocumentArchive.length} von {documentArchive.length} Dokumenten</span>
              </div>
              <div className="header-actions">
                <button type="button" className="primary-button small" onClick={() => openReportEditor()}>+ Bericht schreiben</button>
                <label className="archive-upload-control">
                  Dateien hochladen
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={handleArchiveDocumentUpload} />
                </label>
                <label>
                  Typ
                  <select value={documentTypeFilter} onChange={(event) => setDocumentTypeFilter(event.target.value)}>
                    <option value="alle">Alle Dokumente</option>
                    <option value="datei">Hochgeladene Dateien</option>
                    <option value="beleg">Verkaufsbelege</option>
                    <option value="versandetikett">Versandetiketten</option>
                    <option value="produktetikett">Produktetiketten</option>
                    <option value="laborbericht">Laborberichte</option>
                    <option value="bericht">Berichte</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="archive-search">
              <label htmlFor="document-archive-search">Dokumentenarchiv durchsuchen</label>
              <div>
                <input
                  id="document-archive-search"
                  type="search"
                  value={documentSearch}
                  onChange={(event) => setDocumentSearch(event.target.value)}
                  placeholder="Nummer, Datei, Produkt, Empfänger oder Absender"
                />
                {documentSearch && <button type="button" className="secondary-button small" onClick={() => setDocumentSearch('')}>Suche löschen</button>}
              </div>
            </div>
            <p className="archive-upload-hint">PDF, JPG, PNG oder WebP · maximal 2 MB je manueller Datei-Upload; E-Mail-Anhänge bis 5 MB. Insgesamt maximal 7 MB. Dateien werden mit deinen Geräten synchronisiert.</p>
            {archiveUploadMessage && <p className="archive-upload-feedback" role="status">{archiveUploadMessage}</p>}
            {filteredDocumentArchive.length === 0 ? <p>Keine passenden Dokumente vorhanden.</p> : (
              <div className="card-list">
                {filteredDocumentArchive.map((archivedDocument) => (
                  <article key={archivedDocument.id} className="mini-card">
                    <div className="mini-head">
                      <h3>{archivedDocument.title}</h3>
                      <span className="pill">{archivedDocument.typeLabel}</span>
                    </div>
                    <p>{archivedDocument.detail}</p>
                    {archivedDocument.date && <p>{archivedDocument.date}</p>}
                    <div className="mini-actions">
                      {archivedDocument.shippingLabelDocument ? (
                        <button type="button" className="secondary-button small" onClick={() => printMdeShippingLabel(window.open('', '_blank', 'width=820,height=640'), archivedDocument.shippingLabelDocument)}>Etikett öffnen / drucken</button>
                      ) : archivedDocument.salesDocument ? (
                        <button type="button" className="secondary-button small" onClick={() => printSalesDocument(archivedDocument.salesDocument)}>Vorschau / PDF</button>
                      ) : archivedDocument.report && archivedDocument.type === 'bericht' ? (
                        <>
                          <button type="button" className="secondary-button small" onClick={() => setViewingReport(archivedDocument.report)}>Vorschau</button>
                          <button type="button" className="secondary-button small" onClick={() => openReportEditor(archivedDocument.report)}>Bearbeiten</button>
                        </>
                      ) : archivedDocument.productLabel ? (
                        <>
                          <button type="button" className="secondary-button small" onClick={() => setViewingLabReport({ ...archivedDocument.productLabel, archiveUpload: true })}>Vorschau</button>
                          <a className="secondary-button small" href={archivedDocument.productLabel.dataUrl} download={archivedDocument.productLabel.name}>Herunterladen</a>
                        </>
                      ) : archivedDocument.uploadedDocument ? (
                        <>
                          {['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(archivedDocument.uploadedDocument.type) && (
                            <button type="button" className="secondary-button small" onClick={() => setViewingLabReport({ ...archivedDocument.uploadedDocument, archiveUpload: true })}>Vorschau</button>
                          )}
                          <button type="button" className="secondary-button small" onClick={() => downloadArchivedFile(archivedDocument.uploadedDocument)}>Herunterladen</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="secondary-button small" onClick={() => setViewingLabReport(archivedDocument.report)}>Vorschau</button>
                          <button type="button" className="secondary-button small" onClick={() => downloadLabReportPdf(archivedDocument.report)}>PDF herunterladen</button>
                        </>
                      )}
                      {!archivedDocument.shippingLabelDocument && !archivedDocument.productLabel && (
                        <button type="button" className="danger-button small" onClick={() => archivedDocument.salesDocument
                          ? removeSalesDocument(archivedDocument.salesDocument.id)
                          : archivedDocument.uploadedDocument
                            ? removeUploadedDocument(archivedDocument.uploadedDocument.id)
                          : archivedDocument.type === 'bericht'
                            ? removeReport(archivedDocument.report)
                            : removeArchivedLabReport(archivedDocument.reportScope, archivedDocument.parentId, archivedDocument.report)}>
                          {requiresDeleteApproval ? 'Löschanfrage' : 'Löschen'}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'profil' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Persönliche Einstellungen</h2>
                <span>Mit allen Geräten synchronisiert</span>
              </div>
              <form className="form-grid" onSubmit={saveProfile}>
                <div className="profile-picture-row full-width">
                  {profileForm.avatarDataUrl
                    ? <img className="profile-avatar profile-avatar-large" src={profileForm.avatarDataUrl} alt="Profilbild-Vorschau" />
                    : <span className="profile-avatar profile-avatar-large profile-avatar-fallback">{(profileForm.name || currentUser.name).trim().slice(0, 1).toUpperCase()}</span>}
                  <label>
                    Profilbild
                    <input type="file" accept="image/*" onChange={handleProfileImage} />
                  </label>
                  {profileForm.avatarDataUrl && <button type="button" className="secondary-button small" onClick={() => setProfileForm((current) => ({ ...current, avatarDataUrl: '' }))}>Bild entfernen</button>}
                </div>
                <label>
                  Vor- und Nachname
                  <input required maxLength={100} type="text" name="name" value={profileForm.name} onChange={handleProfileInput} autoComplete="name" />
                </label>
                <label>
                  Benutzername
                  <input type="text" value={currentUser.username} readOnly />
                </label>
                <label>
                  E-Mail
                  <input maxLength={254} type="text" inputMode="email" name="email" value={profileForm.email} onChange={handleProfileInput} autoComplete="email" />
                </label>
                <label>
                  Telefon
                  <input maxLength={50} type="tel" name="phone" value={profileForm.phone} onChange={handleProfileInput} autoComplete="tel" />
                </label>
                <label className="full-width">
                  Adresse
                  <textarea maxLength={300} name="address" value={profileForm.address} onChange={handleProfileInput} rows={3} autoComplete="street-address" />
                </label>
                <p className="full-width">Rolle: <strong>{currentUser.role}</strong></p>
                {profileFeedback && <p className="full-width" role="status">{profileFeedback}</p>}
                <button type="submit" className="primary-button full-width-button" disabled={profileSaving}>{profileSaving ? 'Wird gespeichert …' : 'Änderungen speichern'}</button>
              </form>
              <form className="form-grid profile-account-form" onSubmit={saveAccount}>
                <div className="full-width">
                  <h3>Zugangsdaten</h3>
                  <p>Für Änderungen muss das aktuelle Passwort bestätigt werden.</p>
                </div>
                <label>
                  Benutzername
                  <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" type="text" name="username" value={accountForm.username} onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))} autoComplete="username" />
                </label>
                <label>
                  Aktuelles Passwort
                  <input required type="password" name="currentPassword" value={accountForm.currentPassword} onChange={(event) => setAccountForm((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" />
                </label>
                <label>
                  Neues Passwort (optional)
                  <input minLength={8} type="password" name="newPassword" value={accountForm.newPassword} onChange={(event) => setAccountForm((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" />
                </label>
                <label>
                  Neues Passwort wiederholen
                  <input minLength={8} type="password" name="confirmPassword" value={accountForm.confirmPassword} onChange={(event) => setAccountForm((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" />
                </label>
                {accountFeedback && <p className="full-width" role="status">{accountFeedback}</p>}
                <button type="submit" className="primary-button full-width-button" disabled={accountSaving}>{accountSaving ? 'Wird gespeichert …' : 'Zugangsdaten ändern'}</button>
              </form>
            </div>
          </section>
        )}

        {activeTab === 'tickets' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Neue Anfrage</h2>
                <span>Ticket erstellen</span>
              </div>
              <form className="form-grid" onSubmit={submitTicket}>
                <label>
                  Kategorie
                  <select name="category" value={ticketForm.category} onChange={handleTicketInput}>
                    <option value="allgemein">Allgemein</option>
                    <option value="daten">Datenkorrektur</option>
                    <option value="zugriff">Zugriff</option>
                    <option value="loeschung">Löschanfrage</option>
                    <option value="sonstiges">Sonstiges</option>
                  </select>
                </label>
                <label>
                  Priorität
                  <select name="priority" value={ticketForm.priority} onChange={handleTicketInput}>
                    <option value="niedrig">Niedrig</option>
                    <option value="normal">Normal</option>
                    <option value="hoch">Hoch</option>
                    <option value="dringend">Dringend</option>
                  </select>
                </label>
                <label className="full-width">
                  Betreff
                  <input required maxLength={120} type="text" name="subject" value={ticketForm.subject} onChange={handleTicketInput} placeholder="Worum geht es?" />
                </label>
                <label className="full-width">
                  Beschreibung
                  <textarea required maxLength={4000} name="description" value={ticketForm.description} onChange={handleTicketInput} rows={5} placeholder="Beschreibe die Anfrage und was benötigt wird." />
                </label>
                {ticketForm.targetName && <p className="full-width">Betroffener Datensatz: <strong>{ticketForm.targetName}</strong></p>}
                {ticketFeedback && <p className="full-width" role="status">{ticketFeedback}</p>}
                <button type="submit" className="primary-button full-width-button">Anfrage senden</button>
              </form>
            </div>

            <div className="panel ticket-overview-panel">
              <div className="panel-header">
                <h2>{currentUser.role === 'admin' ? 'Ticketübersicht' : 'Meine Tickets'}</h2>
                <span>{deleteRequests.filter((ticket) => currentUser.role === 'admin' || String(ticket.requestedById) === String(currentUser.id) || String(ticket.assignedToId || '') === String(currentUser.id) || (!ticket.requestedById && ticket.requestedBy === currentUser.name)).length} Tickets</span>
              </div>
              <div className="ticket-toolbar">
                <label>
                  Suche
                  <input type="search" value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} placeholder="Ticket, Betreff, Nachricht …" />
                </label>
                <label>
                  Status
                  <select value={ticketStatusFilter} onChange={(event) => setTicketStatusFilter(event.target.value)}>
                    <option value="alle">Alle Status</option>
                    {Object.entries(ticketStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                  </select>
                </label>
              </div>
              <div className="ticket-list-scroll">
                <div className="card-list">
                {deleteRequests
                  .filter((ticket) => currentUser.role === 'admin' || String(ticket.requestedById) === String(currentUser.id) || String(ticket.assignedToId || '') === String(currentUser.id) || (!ticket.requestedById && ticket.requestedBy === currentUser.name))
                  .filter((ticket) => ticketStatusFilter === 'alle' || ticket.status === ticketStatusFilter)
                  .filter((ticket) => {
                    const query = ticketSearch.trim().toLocaleLowerCase()
                    if (!query) return true
                    return [ticket.ticketNumber, ticket.subject, ticket.requestedBy, ticket.targetName, ...(ticket.messages || []).map((message) => message.text)]
                      .filter(Boolean)
                      .join(' ')
                      .toLocaleLowerCase()
                      .includes(query)
                  })
                  .slice()
                  .sort((left, right) => {
                    const leftActivity = left.messages?.at(-1)?.createdAt || left.requestedAt
                    const rightActivity = right.messages?.at(-1)?.createdAt || right.requestedAt
                    return new Date(rightActivity) - new Date(leftActivity)
                  })
                  .map((ticket) => {
                    const messages = ticket.messages?.length
                      ? ticket.messages
                      : [{ id: `initial-${ticket.id}`, by: ticket.requestedBy, role: 'mitarbeiter', createdAt: ticket.requestedAt, text: ticket.reason }]
                    const statusLabel = ticketStatusLabels[ticket.status] || ticket.status
                    return (
                      <article key={ticket.id} className="mini-card ticket-card">
                        <div className="mini-head">
                          <h3>{ticket.ticketNumber || `ZY-${String(ticket.id).slice(-6).toUpperCase()}`} · {ticket.subject || ticket.targetName}</h3>
                          <span className="pill">{statusLabel}</span>
                        </div>
                        <p>{ticket.category || 'Löschanfrage'} · Priorität: {ticket.priority || 'normal'}</p>
                        <p>Erstellt von {ticket.requestedBy} am {formatTimestamp(ticket.requestedAt)}</p>
                        {ticket.assignedToName && <p>Zuständig: {ticket.assignedToName}</p>}
                        {ticket.statusHistory?.length > 0 && <p>Zuletzt aktualisiert am {formatTimestamp(ticket.statusHistory.at(-1).createdAt)} von {ticket.statusHistory.at(-1).by}</p>}
                        {ticket.targetType && <p>Datensatz: {ticket.targetName}</p>}
                        <div className="ticket-conversation" aria-label="Ticketverlauf">
                          {messages.map((message) => (
                            <div className="ticket-message" key={message.id}>
                              <div className="ticket-message-head"><strong>{message.by}</strong><span>{formatTimestamp(message.createdAt)}</span></div>
                              <p>{message.text}</p>
                            </div>
                          ))}
                          {ticket.reviewedBy && <p className="ticket-resolution">{ticket.status === 'abgelehnt' ? 'Abgelehnt' : 'Bearbeitet'} von {ticket.reviewedBy} am {formatTimestamp(ticket.reviewedAt)}</p>}
                        </div>
                        <form className="ticket-reply" onSubmit={(event) => { event.preventDefault(); sendTicketMessage(ticket.id) }}>
                          <label>
                            Nachricht
                            <textarea required maxLength={10000} rows={3} value={ticketMessageDrafts[ticket.id] || ''} onChange={(event) => setTicketMessageDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Antwort oder Rückfrage schreiben" />
                          </label>
                          {ticket.status !== 'offen' && <small>Deine Antwort öffnet dieses Ticket erneut.</small>}
                          <button type="submit" className="secondary-button small">Nachricht senden</button>
                        </form>
                        {currentUser.role === 'admin' && networkStatus.mode !== 'client' && (
                          <div className="ticket-admin-controls">
                            {ticket.type === 'anfrage' && <label className="ticket-status-control">
                                Ticketstatus
                                <select value={ticket.status} onChange={(event) => updateTicketStatus(ticket.id, event.target.value)}>
                                  {generalTicketStatuses.map((status) => <option key={status} value={status}>{ticketStatusLabels[status]}</option>)}
                                </select>
                              </label>}
                            <label className="ticket-status-control">
                              Zuständiger Mitarbeiter
                              <select value={String(ticket.assignedToId || '')} onChange={(event) => assignTicket(ticket.id, event.target.value)}>
                                <option value="">Nicht zugewiesen</option>
                                {users.filter((user) => user.role !== 'admin').map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                              </select>
                            </label>
                            <button type="button" className="danger-button small" onClick={() => deleteTicket(ticket)}>Ticket löschen</button>
                          </div>
                        )}
                        {currentUser.role === 'admin' && ticket.status === 'offen' && ticket.type !== 'anfrage' && (
                          <div className="mini-actions">
                            {networkStatus.mode === 'client'
                              ? <p>Freigabe ist nur am Haupt-PC möglich.</p>
                              : <button type="button" className="primary-button" onClick={() => resolveDeleteRequest(ticket, true)}>Freigeben und löschen</button>}
                            {networkStatus.mode !== 'client' && <button type="button" className="secondary-button" onClick={() => resolveDeleteRequest(ticket, false)}>Ablehnen</button>}
                          </div>
                        )}
                        {currentUser.role === 'admin' && ticket.status === 'offen' && ticket.type === 'anfrage' && networkStatus.mode !== 'client' && (
                          <div className="mini-actions">
                            <button type="button" className="primary-button" onClick={() => resolveDeleteRequest(ticket, true)}>Als erledigt markieren</button>
                            <button type="button" className="secondary-button" onClick={() => resolveDeleteRequest(ticket, false)}>Ablehnen</button>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'protokoll' && currentUser.role === 'admin' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Änderungsprotokoll</h2>
                <span>{filteredAuditEntries.length} von {auditEntries.length} Einträgen</span>
              </div>
              <div className="header-actions">
                <label>
                  Aktion
                  <select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)}>
                    <option value="alle">Alle Aktionen</option>
                    <option value="erstellt">Erstellt</option>
                    <option value="geändert">Geändert</option>
                    <option value="gelöscht">Gelöscht</option>
                  </select>
                </label>
                <label>
                  Suche
                  <input type="search" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Benutzer, Bereich, Datensatz" />
                </label>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Zeit</th><th>Benutzer</th><th>Bereich</th><th>Aktion</th><th>Datensatz</th><th>Belegstand</th></tr></thead>
                <tbody>
                  {filteredAuditEntries.slice().reverse().map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatTimestamp(entry.timestamp)}</td>
                      <td>{entry.userName} ({entry.role})</td>
                      <td>{entry.collection.replace('zyro-', '')}</td>
                      <td>{entry.action}</td>
                      <td>{entry.label}</td>
                      <td>{entry.beforeRecord || entry.afterRecord ? (
                        <details>
                          <summary>Vorher / nachher</summary>
                          <pre>{JSON.stringify({ vorher: entry.beforeRecord, nachher: entry.afterRecord }, null, 2)}</pre>
                        </details>
                      ) : '–'}</td>
                    </tr>
                  ))}
                  {filteredAuditEntries.length === 0 && <tr><td colSpan="6">Keine passenden Änderungen vorhanden.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div hidden={activeTab !== 'postfach'}>
          {currentUser.role === 'admin' && <Mailbox sessionToken={authSessionToken} userName={currentUser.name} onUnreadCountChange={setMailboxUnreadCount} onSaveAttachments={archiveMailboxAttachments} />}
        </div>

        {activeTab === 'anfragen' && currentUser.role === 'admin' && (
          <section className="inquiries-page">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Neue Anfragen</h2>
                  <span>Nachrichten vom Kontaktformular · Antworten werden per E-Mail versendet</span>
                </div>
                <button type="button" className="secondary-button small" onClick={loadContactMessages} disabled={contactMessagesLoading || networkStatus.mode === 'client'}>
                  {contactMessagesLoading ? 'Wird geladen …' : 'Anfragen aktualisieren'}
                </button>
              </div>
              {networkStatus.mode === 'client' && <p>Kontaktanfragen können nur am Haupt-PC verwaltet werden.</p>}
              {contactMessagesError && <p className="auth-error" role="alert">{contactMessagesError}</p>}
              <form className="contact-admin-token-form" onSubmit={saveContactAdminToken}>
                <label>
                  SMTP-Admin-Token für den Zugriff in der App
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={contactAdminTokenDraft}
                    onChange={(event) => setContactAdminTokenDraft(event.target.value)}
                    placeholder="Token aus der SMTP-Verwaltung einfügen"
                    minLength={32}
                    required
                  />
                </label>
                <button type="submit" className="secondary-button" disabled={networkStatus.mode === 'client'}>Token sicher speichern</button>
                <small>Wird verschlüsselt auf diesem PC gespeichert und für den Zugriff auf Kontaktanfragen verwendet.</small>
              </form>
              <form className="contact-admin-token-form" onSubmit={saveInquiryNotifyEmail}>
                <label>
                  Adresse für Kundenantworten und Benachrichtigungen (aktuell: {inquiryNotifyEmail || '–'})
                  <input
                    type="text"
                    inputMode="email"
                    value={inquiryNotifyDraft}
                    onChange={(event) => setInquiryNotifyDraft(event.target.value)}
                    placeholder="neue-adresse@example.com"
                    required
                  />
                </label>
                <button type="submit" className="secondary-button" disabled={networkStatus.mode === 'client'}>Adresse speichern</button>
                <small>Hierhin gehen Benachrichtigungen bei neuen Anfragen und Antworten von Kunden; auch Reply-To der Mails an Kunden.</small>
              </form>
              <div className="button-row">
                {[['open', 'Offen'], ['closed', 'Erledigt'], ['all', 'Alle']].map(([value, label]) => (
                  <button key={value} type="button" className={contactFilter === value ? 'primary-button small' : 'secondary-button small'} onClick={() => setContactFilter(value)}>{label}</button>
                ))}
              </div>
            </div>
            {contactReplyMessage && <p role="status">{contactReplyMessage}</p>}
            {contactMessagesLoading && contactMessages.length === 0 && <div className="panel">Kontaktanfragen werden geladen …</div>}
            {!contactMessagesLoading && contactMessages.length === 0 && !contactMessagesError && (
              <div className="panel">Noch keine Kontaktanfragen vorhanden. Neue Nachrichten aus dem Formular erscheinen hier.</div>
            )}
            {contactMessages.filter((message) => contactFilter === 'all' || (contactFilter === 'closed' ? message.status === 'closed' : message.status !== 'closed')).map((message) => (
              <article className="panel contact-message-card" key={message.id}>
                <div className="panel-header">
                  <div>
                    <h2>{message.subject}</h2>
                    <span>{message.name} · <a href={`mailto:${encodeURIComponent(message.email)}`}>{message.email}</a> · {formatTimestamp(message.lastMessageAt || message.createdAt)}</span>
                  </div>
                  <span className={`status-badge ${message.status === 'new' || message.status === 'customer_replied' ? 'warning' : 'connected'}`}>
                    {{ new: 'Neu', customer_replied: 'Kunde hat geantwortet', replied: 'Wartet auf Kunde', closed: 'Erledigt' }[message.status] || message.status}
                  </span>
                </div>
                {message.thread?.map((entry, index) => (
                  <div className={entry.from === 'team' ? 'contact-message-reply' : 'contact-message-body'} key={`${message.id}-${index}`}>
                    <strong>{entry.from === 'team' ? 'ZYRO' : message.name} · {formatTimestamp(entry.at)}</strong>
                    <p>{entry.text}</p>
                  </div>
                ))}
                <label>
                  Antwort
                  <textarea
                    rows="5"
                    value={contactReplyDrafts[message.id] || ''}
                    onChange={(event) => setContactReplyDrafts((current) => ({ ...current, [message.id]: event.target.value }))}
                    placeholder="Deine Nachricht …"
                    maxLength={4000}
                  />
                </label>
                <p className="contact-signature-preview"># ZYRO<br />TASTE THE DIFFERENCE.<br /><br />ZYRO Beverage Brand<br /><br />by Liberty Street Food GmbH<br /><br />Liberty Street Food GmbH<br />Birlenbacherstr. 59, 57078 Siegen, Deutschland<br /><br />www.zyro-getränke.de</p>
                <button type="button" className="primary-button" onClick={() => sendContactReply(message)} disabled={Boolean(sendingContactReplies[message.id])}>
                  {sendingContactReplies[message.id] ? 'Wird gesendet …' : `Antwort an ${message.email} senden`}
                </button>
                <button type="button" className="secondary-button" onClick={() => setContactMessageStatus(message, message.status === 'closed' ? 'replied' : 'closed')}>
                  {message.status === 'closed' ? 'Wieder öffnen' : 'Als erledigt markieren'}
                </button>
                <button type="button" className="danger-button" onClick={() => deleteContactMessage(message)}>Anfrage löschen</button>
              </article>
            ))}
          </section>
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <section className="panel website-admin-panel">
            <div className="panel-header">
              <div>
                <h2>SMTP-Administration</h2>
                <span>{websiteAdminTokenConfigured ? 'Admin-Token lokal verschlüsselt gespeichert' : 'Noch nicht eingerichtet'} · nur am Haupt-PC</span>
              </div>
              <div className="mini-actions">
                <button type="button" className="secondary-button small" onClick={() => setupWebsiteAdminToken()} disabled={networkStatus.mode === 'client'}>Token erzeugen / erneut kopieren</button>
                <button type="button" className="secondary-button small" onClick={() => setupWebsiteAdminToken(true)} disabled={networkStatus.mode === 'client'}>Token neu erzeugen</button>
                <a className="primary-button small" href="https://zyro-78855.web.app/admin-email.html" target="_blank" rel="noreferrer">SMTP-Einstellungen öffnen</a>
              </div>
            </div>
            {networkStatus.mode === 'client' ? (
              <p>Der Website-Admin-Token kann nur am Haupt-PC verwaltet werden.</p>
            ) : (
              <p className="website-admin-setup-note">
                Token im VS-Code-Terminal als Secret setzen: <code>Get-Clipboard -Raw | firebase functions:secrets:set ZYRO_ORDER_ADMIN_TOKEN --data-file - --project zyro-78855</code>, danach mit <code>firebase deploy --only functions,hosting --project zyro-78855</code> bereitstellen. Secret-Änderungen gelten erst nach dem Functions-Deployment. Der Token autorisiert die SMTP-Verwaltung und den Versand von Rechnungen.
              </p>
            )}
            {websiteAdminMessage && <p role="status">{websiteAdminMessage}</p>}
          </section>
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Kundenbewertungen prüfen</h2>
                <span>Bewertungen werden erst nach deiner Freigabe im Shop sichtbar.</span>
              </div>
              <button
                type="button"
                className="secondary-button small"
                disabled={productReviewsLoading}
                onClick={async () => {
                  setProductReviewsLoading(true)
                  setReviewModerationMessage('')
                  try {
                    const result = await window.zyroMde.listProductReviews(authSessionToken)
                    setProductReviews(Array.isArray(result.reviews) ? result.reviews : [])
                  } catch (error) {
                    setReviewModerationMessage(`Bewertungen konnten nicht geladen werden: ${error.message}`)
                  } finally {
                    setProductReviewsLoading(false)
                  }
                }}
              >
                {productReviewsLoading ? 'Wird geladen …' : 'Bewertungen aktualisieren'}
              </button>
            </div>
            {reviewModerationMessage && <p role="status">{reviewModerationMessage}</p>}
            {productReviewsLoading ? <p>Bewertungen werden geladen …</p> : productReviews.length === 0 ? (
              <p>Keine ausstehenden Bewertungen. Neue Kundenbewertungen erscheinen nach bestätigter Zustellung hier.</p>
            ) : (
              <div className="card-list">
                {productReviews.map((review) => (
                  <article className="mini-card" key={review.id}>
                    <div className="mini-head">
                      <h3>{review.productName}</h3>
                      <span className="pill">{'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))} · Verifizierter Kauf</span>
                    </div>
                    <p>{review.comment || 'Keine zusätzliche Nachricht.'}</p>
                    <small>Auftrag {review.orderNumber} · eingegangen {formatTimestamp(review.createdAt)}</small>
                    <div className="mini-actions">
                      <button type="button" className="primary-button small" disabled={Boolean(reviewModerationBusyId)} onClick={() => moderateProductReview(review, 'approve')}>
                        {reviewModerationBusyId === review.id ? 'Wird geprüft …' : 'Freigeben'}
                      </button>
                      <button type="button" className="danger-button small" disabled={Boolean(reviewModerationBusyId)} onClick={() => moderateProductReview(review, 'reject')}>
                        Ablehnen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Firmendaten für Rechnungen</h2>
                <span>Diese Angaben erscheinen auf neu erstellten Rechnungen und Zahlungsinformationen.</span>
              </div>
            </div>
            <form className="form-grid" onSubmit={saveInvoiceCompanyDetails}>
              {invoiceCompanyFields.map(({ name, label, type = 'text', maxLength, required }) => (
                <label key={name}>
                  {label}
                  <input
                    type={type}
                    name={name}
                    maxLength={maxLength}
                    required={Boolean(required)}
                    autoComplete={name === 'street' ? 'street-address' : name === 'postalCode' ? 'postal-code' : name === 'city' ? 'address-level2' : name === 'email' ? 'email' : 'off'}
                    value={invoiceCompanyForm[name] || ''}
                    onChange={(event) => setInvoiceCompanyForm((current) => ({ ...current, [name]: event.target.value }))}
                  />
                </label>
              ))}
              <fieldset className="full-width invoice-legal-fields">
                <legend>Geschäftsführung und Registerangaben (optional)</legend>
                <div className="form-grid">
                  {invoiceCompanyLegalFields.map(({ name, label, maxLength, placeholder }) => (
                    <label key={name}>
                      {label}
                      <input
                        type="text"
                        name={name}
                        maxLength={maxLength}
                        placeholder={placeholder || ''}
                        value={invoiceCompanyForm[name] || ''}
                        onChange={(event) => setInvoiceCompanyForm((current) => ({ ...current, [name]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                <small>Diese Angaben werden auf neuen Rechnungen unter „Geschäftsführung / Register“ angezeigt, wenn sie ausgefüllt sind.</small>
              </fieldset>
              <label>
                Dokumentlayout für Rechnung, Angebot und Auftragsbestätigung
                <select
                  value={invoiceCompanyForm.documentLayout || 'zyro'}
                  onChange={(event) => setInvoiceCompanyForm((current) => ({ ...current, documentLayout: event.target.value }))}
                >
                  {documentLayoutOptions.map((layout) => <option key={layout.value} value={layout.value}>{layout.label}</option>)}
                </select>
              </label>
              <div className="full-width form-grid">
                <label>
                  Vorschau für
                  <select value={documentPreviewKind} onChange={(event) => setDocumentPreviewKind(event.target.value)}>
                    {Object.entries(salesDocumentTypes).map(([kind, type]) => <option key={kind} value={kind}>{type.label}</option>)}
                  </select>
                </label>
                <button type="button" className="secondary-button" onClick={() => previewSalesDocumentTemplate(documentPreviewKind)}>
                  Vorschau mit diesen Firmendaten öffnen
                </button>
              </div>
              <p className="full-width">Das gewählte Layout gilt für neu erstellte Rechnungen, Angebote und Auftragsbestätigungen. Die Vorschau zeigt auch noch nicht gespeicherte Firmendaten. Änderungen werden mit dem Cloud-Sync geteilt; bereits ausgestellte Belege bleiben unverändert.</p>
              <button type="submit" className="primary-button full-width-button" disabled={invoiceCompanySaving}>
                {invoiceCompanySaving ? 'Wird gespeichert …' : 'Firmendaten speichern'}
              </button>
              {invoiceCompanyMessage && <p className="full-width" role="status">{invoiceCompanyMessage}</p>}
            </form>
          </section>
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Lohnabfüller</h2>
                <span>Diese Angaben erscheinen in Produktionsaufträgen und Chargen.</span>
              </div>
            </div>
            <form className="form-grid" onSubmit={saveBottlerDetails}>
              <label>
                Name des Lohnabfüllers
                <input
                  type="text"
                  maxLength={120}
                  required
                  value={bottlerForm.name}
                  onChange={(event) => setBottlerForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Straße und Hausnummer
                <input
                  type="text"
                  maxLength={180}
                  required
                  value={bottlerForm.street}
                  onChange={(event) => setBottlerForm((current) => ({ ...current, street: event.target.value }))}
                />
              </label>
              <label>
                PLZ und Ort
                <input
                  type="text"
                  maxLength={100}
                  required
                  value={bottlerForm.city}
                  onChange={(event) => setBottlerForm((current) => ({ ...current, city: event.target.value }))}
                />
              </label>
              <button type="submit" className="primary-button full-width-button" disabled={bottlerSaving}>
                {bottlerSaving ? 'Wird gespeichert …' : 'Lohnabfüller speichern'}
              </button>
              {bottlerMessage && <p className="full-width" role="status">{bottlerMessage}</p>}
            </form>
          </section>
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Automatische Sicherungen</h2>
                <span>Verschlüsselt · tägliche Sicherung · maximal 30 Versionen</span>
              </div>
              <button type="button" className="secondary-button small" onClick={loadAutomaticBackups}>Sicherungen laden</button>
            </div>
            {!backupEncryptionAvailable && <p className="auth-error">Windows-Speicherverschlüsselung nicht verfügbar; Sicherungen können nicht erstellt werden.</p>}
            {backupMessage && <p role="status">{backupMessage}</p>}
            {networkStatus.mode === 'client' ? (
              <p>Sicherungen können nur am Haupt-PC verwaltet und wiederhergestellt werden.</p>
            ) : automaticBackups.length === 0 ? (
              <p>Noch keine Sicherung gefunden. Die erste wird automatisch nach dem nächsten Start erstellt.</p>
            ) : (
              <div className="card-list">
                {automaticBackups.map((backup) => (
                  <article className="mini-card" key={backup.fileName}>
                    <div className="mini-head">
                      <h3>{backup.fileName}</h3>
                      <span className="pill">{(backup.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                    <p>Erstellt am {formatTimestamp(backup.createdAt)}</p>
                    <button type="button" className="danger-button" onClick={() => restoreAutomaticBackup(backup.fileName)}>Wiederherstellen</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <>
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Benutzer verwalten</h2>
                <span>Admin</span>
              </div>

              <form className="form-grid" onSubmit={handleIssueActivationKey}>
                <label>
                  Rolle des neuen Kontos
                  <select name="role" value={userForm.role} onChange={handleUserInput}>
                    <option value="mitarbeiter">Mitarbeiter</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                {userForm.role === 'mitarbeiter' && (
                  <fieldset className="permission-fieldset full-width">
                    <legend>Zugriff auf Module</legend>
                    <div className="permission-grid">
                      {employeePermissionTabs.map((permission) => (
                        <label key={permission} className="permission-option">
                          <input
                            type="checkbox"
                            checked={activationPermissions.includes(permission)}
                            onChange={(event) => setActivationPermissions((current) => event.target.checked
                              ? [...current, permission]
                              : current.filter((entry) => entry !== permission))}
                          />
                          {permissionLabels[permission]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <button type="submit" className="primary-button full-width-button">Aktivierungsschlüssel erstellen</button>
                {activationMessage && <p>{activationMessage}</p>}
                {issuedActivationKey && <div className="demo-box"><strong>Schlüssel einmalig weitergeben</strong><code>{issuedActivationKey}</code></div>}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Mitglieder</h2>
                <span>{users.length} Accounts</span>
              </div>
              {permissionMessage && <p role="status">{permissionMessage}</p>}
              <div className="card-list">
                {users.map((user) => {
                  const draft = userPermissionDrafts[user.id] || { role: user.role, permissions: user.permissions || [...baseTabs] }
                  const canEdit = String(user.id) !== String(currentUser.id)
                  return (
                    <article key={user.id} className="mini-card">
                      <div className="mini-head">
                        <h3>{user.name}</h3>
                        <span className="pill">{draft.role}</span>
                      </div>
                      <p>{user.username}</p>
                      {user.email && <p>E-Mail: {user.email}</p>}
                      {user.phone && <p>Telefon: {user.phone}</p>}
                      {user.address && <p>Anschrift: {user.address}</p>}
                      {canEdit ? (
                        <>
                          <label className="permission-role-label">
                            Rolle
                            <select value={draft.role} onChange={(event) => setUserPermissionDrafts((current) => ({
                              ...current,
                              [user.id]: {
                                role: event.target.value,
                                permissions: event.target.value === 'admin' ? [] : draft.permissions.length ? draft.permissions : [...baseTabs],
                              },
                            }))}>
                              <option value="mitarbeiter">Mitarbeiter</option>
                              <option value="admin">Admin</option>
                            </select>
                          </label>
                          {draft.role === 'mitarbeiter' && (
                            <div className="permission-grid member-permissions">
                              {employeePermissionTabs.map((permission) => (
                                <label key={permission} className="permission-option">
                                  <input
                                    type="checkbox"
                                    checked={draft.permissions.includes(permission)}
                                    onChange={(event) => setUserPermissionDrafts((current) => ({
                                      ...current,
                                      [user.id]: {
                                        role: draft.role,
                                        permissions: event.target.checked
                                          ? [...draft.permissions, permission]
                                          : draft.permissions.filter((entry) => entry !== permission),
                                      },
                                    }))}
                                  />
                                  {permissionLabels[permission]}
                                </label>
                              ))}
                            </div>
                          )}
                        </>
                      ) : <p>Eigenes Administratorkonto · alle Module</p>}
                      <div className="mini-actions">
                        {canEdit && <button type="button" className="secondary-button small" onClick={() => saveUserPermissions(user.id)}>Berechtigungen speichern</button>}
                        <button type="button" className="danger-button" onClick={() => removeUser(user.id)}>
                          {requiresDeleteApproval ? 'Löschanfrage stellen' : 'Entfernen'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Löschanfragen</h2>
              <span>{deleteRequests.filter((request) => request.status === 'offen').length} offen</span>
            </div>
            {deleteRequests.filter((request) => request.status === 'offen').length === 0 ? (
              <p>Keine offenen Löschanfragen.</p>
            ) : (
              <div className="card-list">
                {deleteRequests.filter((request) => request.status === 'offen').map((request) => (
                  <article key={request.id} className="mini-card">
                    <div className="mini-head">
                      <h3>{request.targetName}</h3>
                      <span className="pill">{request.type}</span>
                    </div>
                    <p>{request.reason}</p>
                    <p>Angefragt von {request.requestedBy} am {new Date(request.requestedAt).toLocaleString('de-DE')}</p>
                    {networkStatus.mode === 'client' ? (
                      <p>Freigabe oder Ablehnung ist nur am Haupt-PC möglich.</p>
                    ) : (
                      <div className="mini-actions">
                        <button type="button" className="primary-button" onClick={() => resolveDeleteRequest(request, true)}>Freigeben und löschen</button>
                        <button type="button" className="secondary-button" onClick={() => resolveDeleteRequest(request, false)}>Ablehnen</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
