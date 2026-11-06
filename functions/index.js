const crypto = require('node:crypto')
const zlib = require('node:zlib')
const admin = require('firebase-admin')
const { defineSecret } = require('firebase-functions/params')
const { onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { validatePublicOrder } = require('./order-validation.cjs')
const { acceptMdeOrder, getPublicShipment, recordMdeScan, validateMdePacking, validateShipment } = require('./mde-workflow.cjs')
const { buildOrderConfirmationEmail } = require('./email-templates.cjs')
const { calculateOrderPricing } = require('./order-pricing.cjs')
const { buildDesktopCatalog, slugify } = require('./shop-catalog.cjs')
const { calculateDiscount, cleanDiscountCodes } = require('./shop-discounts.cjs')
const { applyBusinessPricing, cleanBusinessPrices, getCatalogBusinessPrices, normalizeBusinessTrayItems } = require('./business-pricing.cjs')
const { hashCustomerPassword, validateCustomerPassword, verifyCustomerPassword } = require('./customer-password.cjs')
const {
  hashCustomerActionToken,
  tokenHashMatches,
  isCustomerVerificationTokenValid,
} = require('./customer-verification.cjs')
const { addLot, allocateFefo, normalizeLotInput } = require('./lots.cjs')
const { buildInvoicePdf, createInvoiceFromOrder } = require('./auto-invoice.cjs')
const { buildCheckoutParams, getCheckoutAmountCents, verifyStripeSignature } = require('./stripe-helpers.cjs')
const { hashReviewToken, getReviewPersistenceState, isDhlDelivered, getReviewProducts, validateReviewSubmission } = require('./review-workflow.cjs')
const { validateContactMessage } = require('./contact-validation.cjs')
const { validateFinanceEntries } = require('./finance-validation.cjs')
const { createPurchaseReceipt, validatePurchaseOrders, validateSuppliers } = require('./erp-purchasing.cjs')
const {
  validatePaymentSettings,
  validatePaymentRequestUpdate,
} = require('./payment-requests.cjs')
const { validateLabTestsUpdate } = require('./lab-tests.cjs')
const {
  maxFinanceReceiptBytes,
  validateFinanceReceiptMetadata,
  validateFinanceReceiptContent,
  validateFinanceReceiptUpload,
} = require('./finance-receipt-validation.cjs')
const { validateElsterSetupEntries } = require('./elster-validation.cjs')
const { validateCompanyDetailsEntries, defaultCompanyDetails } = require('./company-details.cjs')
const { validateBottlerDetailsEntries } = require('./bottler-details.cjs')
const { validateSalesDocumentEmail } = require('./sales-document-email.cjs')
const { normalizeEmailAddress, canonicalEmailAddress } = require('./email-address.cjs')
const { describeSmtpFailure, ensureRecipientsAccepted, sendWithTransientRetry } = require('./email-delivery.cjs')
const {
  defaultNotifyEmail,
  signatureText,
  signatureHtml,
  createInquiryAccessToken,
  verifyInquiryAccessToken,
  buildInquiryLink,
  buildInquiryThread,
  validateInquiryReply,
  buildReplySubject,
  buildTeamReplyEmail,
  buildCustomerReceiptEmail,
  buildTeamNotificationEmail,
} = require('./inquiry-helpers.cjs')
const nodemailer = require('nodemailer')

admin.initializeApp()

const db = admin.firestore()
const region = 'europe-west3'
const orderAdminToken = defineSecret('ZYRO_ORDER_ADMIN_TOKEN')
const allowedOrigins = new Set([
  'https://zyro-78855.web.app',
  'https://xn--zyro-getrnke-ocb.de',
  'https://zyro-78855.firebaseapp.com',
  'https://www.xn--zyro-getrnke-ocb.de',
  'https://xn--zyro-getrnke-ocb.de',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const setCors = (request, response) => {
  const origin = request.get('origin')
  if (allowedOrigins.has(origin)) response.set('Access-Control-Allow-Origin', origin)
  response.set('Vary', 'Origin')
  response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.set('Access-Control-Max-Age', '3600')
}
const sendMethodError = (response) => response.status(405).json({ error: 'Methode nicht erlaubt.' })

const verifyRootAdminToken = (request) => {
  const expected = Buffer.from(orderAdminToken.value().trim())
  const authorization = String(request.get('authorization') || '')
  const provided = Buffer.from(authorization.startsWith('Bearer ') ? authorization.slice(7) : '')
  return expected.length >= 32 && provided.length === expected.length && crypto.timingSafeEqual(expected, provided)
}

const createAdminSessionToken = (username) => {
  const payload = Buffer.from(JSON.stringify({ username, exp: Date.now() + 60 * 60 * 1000 })).toString('base64url')
  const signature = crypto.createHmac('sha256', orderAdminToken.value().trim()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

const verifyAdminToken = (request) => {
  if (verifyRootAdminToken(request)) return true
  const authorization = String(request.get('authorization') || '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return false
  try {
    const expected = Buffer.from(crypto.createHmac('sha256', orderAdminToken.value().trim()).update(payload).digest('base64url'))
    const provided = Buffer.from(signature)
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return false
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof claims.username === 'string' && claims.username.length > 0 && Number(claims.exp) > Date.now()
  } catch {
    return false
  }
}

const defaultShopConfig = {
  products: [{
    id: 'pfirsich-maracuja',
    name: 'ZYRO Pfirsich Maracuja',
    description: '500 ml Dose · 24 Dosen je Tray',
    cratePriceCents: 2856,
    active: true,
  }],
  settings: {
    shippingPriceCents: 0,
    shippingPricePerKgCents: 0,
    shippingPricePerPalletCents: 8500,
    shippingTraysPerPallet: 64,
    businessDpdMaxTrays: 6,
    shippingTiers: [],
    businessDpdShippingTiers: [],
    largeCartonTareGrams: 0,
    smallCartonTareGrams: 0,
    vatRate: 19,
    pricesIncludeVat: true,
  },
  payment: { accountHolder: '', iban: '' },
}

const cleanShippingTiers = (input) => {
  if (!Array.isArray(input) || input.length > 10) throw new Error('Paketversandstaffeln ungültig.')
  let previousWeight = 0
  return input.map((entry) => {
    const maxWeightGrams = Number(entry?.maxWeightGrams)
    const priceCents = Number(entry?.priceCents)
    if (!Number.isSafeInteger(maxWeightGrams) || maxWeightGrams <= previousWeight || maxWeightGrams > 31500
      || !Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 10000000) {
      throw new Error('Paketversandstaffeln ungültig.')
    }
    previousWeight = maxWeightGrams
    return { maxWeightGrams, priceCents }
  })
}

let desktopCatalogCache = { at: 0, products: [] }
const readDesktopCatalog = async () => {
  if (Date.now() - desktopCatalogCache.at < 30 * 1000) return desktopCatalogCache.products
  try {
    const { value } = await readCloudAppData('zyro-products')
    desktopCatalogCache = { at: Date.now(), products: buildDesktopCatalog(value) }
  } catch (error) {
    console.error('Desktop-Artikel konnten nicht geladen werden:', error.message)
    desktopCatalogCache = { at: Date.now() - 20 * 1000, products: desktopCatalogCache.products }
  }
  return desktopCatalogCache.products
}

const readShopConfig = async ({ includeDesktop = true } = {}) => {
  const snapshot = await db.collection('publicShop').doc('config').get()
  const stored = snapshot.exists ? snapshot.data() : {}
  const config = {
    ...defaultShopConfig,
    ...stored,
    settings: { ...defaultShopConfig.settings, ...(stored.settings || {}) },
  }
  const { value: desktopSettings } = await readCloudAppData('zyro-shop-settings')
  const shippingSettings = Array.isArray(desktopSettings) ? desktopSettings.find((entry) => entry?.id === 'global') : null
  if (shippingSettings) {
    for (const key of ['shippingPriceCents', 'shippingPricePerKgCents', 'shippingPricePerPalletCents', 'largeCartonTareGrams', 'smallCartonTareGrams']) {
      if (shippingSettings[key] === undefined) continue
      const value = Number(shippingSettings[key])
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Versand-Einstellungen in der Desktop-App sind ungültig.')
      config.settings[key] = value
    }
    if (shippingSettings.shippingTraysPerPallet !== undefined) {
      const value = Number(shippingSettings.shippingTraysPerPallet)
      if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new Error('Paletten-Einstellungen in der Desktop-App sind ungültig.')
      config.settings.shippingTraysPerPallet = value
    }
    if (shippingSettings.businessDpdMaxTrays !== undefined) {
      const value = Number(shippingSettings.businessDpdMaxTrays)
      if (!Number.isSafeInteger(value) || value < 1 || value > 20) throw new Error('DPD-Traygrenze in der Desktop-App ist ungültig.')
      config.settings.businessDpdMaxTrays = value > 6 || value === 2 ? 6 : value
    }
    if (shippingSettings.shippingTiers !== undefined) {
      config.settings.shippingTiers = cleanShippingTiers(shippingSettings.shippingTiers)
    }
    if (shippingSettings.businessDpdShippingTiers !== undefined) {
      config.settings.businessDpdShippingTiers = cleanShippingTiers(shippingSettings.businessDpdShippingTiers)
    }
  }
  const configuredDpdTrayLimit = Number(config.settings.businessDpdMaxTrays)
  if (configuredDpdTrayLimit === 2 || configuredDpdTrayLimit > 6) {
    config.settings.businessDpdMaxTrays = 6
  }
  if (!Array.isArray(config.products) || config.products.length === 0) config.products = defaultShopConfig.products
  if (includeDesktop) {
    const desktopProducts = await readDesktopCatalog()
    if (desktopProducts.length > 0) config.products = desktopProducts
  }
  return config
}

const readShopDiscountCodes = async () => {
  const { value } = await readCloudAppData('zyro-shop-discounts')
  return cleanDiscountCodes(Array.isArray(value) ? value : [])
}

const cleanShopConfig = (input) => {
  if (!input || typeof input !== 'object' || !Array.isArray(input.products) || input.products.length < 1 || input.products.length > 50) {
    throw new Error('Shop-Einstellungen ungültig.')
  }
  const ids = new Set()
  const products = input.products.map((product) => {
    const id = String(product?.id || '')
    const name = String(product?.name || '').trim()
    const description = String(product?.description || '').trim()
    const cratePriceCents = Number(product?.cratePriceCents)
    const unitWeightGrams = Number(product?.unitWeightGrams)
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id) || ids.has(id) || !name || name.length > 100 || description.length > 300 || !Number.isSafeInteger(cratePriceCents) || cratePriceCents < 1 || !Number.isSafeInteger(unitWeightGrams) || unitWeightGrams < 1 || typeof product.active !== 'boolean') {
      throw new Error('Artikel, Traypreis oder Dosengewicht ungültig.')
    }
    ids.add(id)
    return { id, name, description, cratePriceCents, unitWeightGrams, active: product.active }
  })
  const shippingPriceCents = Number(input.settings?.shippingPriceCents)
  const shippingPricePerKgCents = Number(input.settings?.shippingPricePerKgCents)
  const shippingPricePerPalletCents = Number(input.settings?.shippingPricePerPalletCents ?? defaultShopConfig.settings.shippingPricePerPalletCents)
  const shippingTraysPerPallet = Number(input.settings?.shippingTraysPerPallet ?? defaultShopConfig.settings.shippingTraysPerPallet)
  const businessDpdMaxTrays = Number(input.settings?.businessDpdMaxTrays ?? defaultShopConfig.settings.businessDpdMaxTrays)
  const largeCartonTareGrams = Number(input.settings?.largeCartonTareGrams)
  const smallCartonTareGrams = Number(input.settings?.smallCartonTareGrams)
  const vatRate = Number(input.settings?.vatRate)
  const shippingTiers = cleanShippingTiers(input.settings?.shippingTiers || [])
  const businessDpdShippingTiers = cleanShippingTiers(input.settings?.businessDpdShippingTiers || [])
  if (!Number.isSafeInteger(shippingPriceCents) || shippingPriceCents < 0 || !Number.isSafeInteger(shippingPricePerKgCents) || shippingPricePerKgCents < 0 || !Number.isSafeInteger(shippingPricePerPalletCents) || shippingPricePerPalletCents < 0 || !Number.isSafeInteger(shippingTraysPerPallet) || shippingTraysPerPallet < 1 || shippingTraysPerPallet > 10000 || !Number.isSafeInteger(businessDpdMaxTrays) || businessDpdMaxTrays < 1 || businessDpdMaxTrays > 6 || !Number.isSafeInteger(largeCartonTareGrams) || largeCartonTareGrams < 0 || !Number.isSafeInteger(smallCartonTareGrams) || smallCartonTareGrams < 0 || ![0, 7, 19].includes(vatRate) || typeof input.settings?.pricesIncludeVat !== 'boolean') {
    throw new Error('Versand- oder Steuereinstellung ungültig.')
  }
  const payment = {
    accountHolder: String(input.payment?.accountHolder || '').trim().slice(0, 120),
    iban: String(input.payment?.iban || '').replace(/\s/g, '').toUpperCase().slice(0, 34),
  }
  if (payment.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(payment.iban)) throw new Error('IBAN ungültig.')
  return {
    products,
    settings: { shippingPriceCents, shippingPricePerKgCents, shippingPricePerPalletCents, shippingTraysPerPallet, businessDpdMaxTrays, shippingTiers, businessDpdShippingTiers, largeCartonTareGrams, smallCartonTareGrams, vatRate, pricesIncludeVat: input.settings.pricesIncludeVat },
    payment,
  }
}

const requireAdmin = (request, response) => {
  if (!verifyAdminToken(request)) {
    response.status(401).json({ error: 'Nicht autorisiert.' })
    return false
  }
  return true
}

const requireRootAdmin = (request, response) => {
  if (!verifyRootAdminToken(request)) {
    response.status(401).json({ error: 'Nicht autorisiert.' })
    return false
  }
  return true
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

const mailConfigRef = db.collection('privateShop').doc('mail')
const mailboxConfigRef = db.collection('privateShop').doc('mailbox')
const dpdConfigRef = db.collection('privateShop').doc('dpd')
const brandContactMessagesRef = db.collection('brandContactMessages')
const inquiryConfigRef = db.collection('privateShop').doc('inquiryConfig')

const getInquiryNotifyEmail = async () => {
  const snapshot = await inquiryConfigRef.get()
  return snapshot.data()?.notifyEmail || defaultNotifyEmail
}

const encryptMailPassword = (password) => {
  const key = crypto.createHash('sha256').update(orderAdminToken.value().trim()).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  return { passwordCiphertext: encrypted.toString('base64'), passwordIv: iv.toString('hex'), passwordTag: cipher.getAuthTag().toString('hex') }
}

const decryptMailPassword = (mail) => {
  const key = crypto.createHash('sha256').update(orderAdminToken.value().trim()).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(mail.passwordIv, 'hex'))
  decipher.setAuthTag(Buffer.from(mail.passwordTag, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(mail.passwordCiphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

const encryptDpdCredentials = (credentials) => {
  const encrypted = encryptMailPassword(JSON.stringify(credentials))
  return {
    credentialsCiphertext: encrypted.passwordCiphertext,
    credentialsIv: encrypted.passwordIv,
    credentialsTag: encrypted.passwordTag,
  }
}

const decryptDpdCredentials = (settings) => JSON.parse(decryptMailPassword({
  passwordCiphertext: settings.credentialsCiphertext,
  passwordIv: settings.credentialsIv,
  passwordTag: settings.credentialsTag,
}))

const getMailSettings = async () => {
  const snapshot = await mailConfigRef.get()
  if (!snapshot.exists) return { host: '', port: 465, username: '', from: '', secure: true, configured: false }
  const { host, port, username, from, secure, passwordCiphertext } = snapshot.data()
  return { host, port, username, from, secure, configured: Boolean(passwordCiphertext) }
}

const saveMailSettings = async (input) => {
  const existing = await mailConfigRef.get()
  const current = existing.exists ? existing.data() : null
  const host = String(input?.host || '').trim()
  const port = Number(input?.port)
  const username = String(input?.username || '').trim()
  let from
  try {
    from = canonicalEmailAddress(String(input?.from || ''))
  } catch {
    from = ''
  }
  const secure = input?.secure === true
  const password = String(input?.password || '')
  if (!host && !username && !from && !password) {
    await mailConfigRef.delete()
    return { host: '', port: 465, username: '', from: '', secure: true, configured: false }
  }
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !username || username.length > 254 || !from || (password && password.length > 512)) {
    throw new Error('SMTP-Server, Port, Benutzer, Absender oder Passwort ungültig.')
  }
  if (!password && !current?.passwordCiphertext) throw new Error('Bitte das SMTP-Passwort eintragen.')
  const encryptedPassword = password ? encryptMailPassword(password) : {
    passwordCiphertext: current.passwordCiphertext,
    passwordIv: current.passwordIv,
    passwordTag: current.passwordTag,
  }
  await mailConfigRef.set({ host, port, username, from, secure, ...encryptedPassword, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
  return { host, port, username, from, secure, configured: true }
}

const stripeConfigRef = db.collection('privateShop').doc('stripe')

const getStripeConfig = async () => {
  const snapshot = await stripeConfigRef.get()
  const data = snapshot.exists ? snapshot.data() : null
  if (!data?.secret) return null
  return {
    secretKey: decryptMailPassword(data.secret),
    webhookSecret: data.webhook ? decryptMailPassword(data.webhook) : '',
    mode: data.mode || 'test',
  }
}

const saveStripeConfig = async ({ secretKey, webhookSecret }) => {
  const key = String(secretKey || '').trim()
  const webhook = String(webhookSecret || '').trim()
  const existing = (await stripeConfigRef.get()).data() || {}
  if (key && !/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,200}$/.test(key)) throw new Error('Der Stripe-Schlüssel muss mit sk_test_ oder sk_live_ beginnen.')
  if (webhook && !/^whsec_[A-Za-z0-9]{10,200}$/.test(webhook)) throw new Error('Das Webhook-Geheimnis muss mit whsec_ beginnen.')
  const secret = key ? encryptMailPassword(key) : existing.secret
  const hook = webhook ? encryptMailPassword(webhook) : existing.webhook
  if (!secret) throw new Error('Bitte den geheimen Stripe-Schlüssel eintragen.')
  const mode = key ? (key.includes('_live_') ? 'live' : 'test') : (existing.mode || 'test')
  await stripeConfigRef.set({ secret, webhook: hook || null, mode, enabled: Boolean(hook), updatedAt: admin.firestore.FieldValue.serverTimestamp() })
  return { configured: true, webhookConfigured: Boolean(hook), enabled: Boolean(hook), mode }
}

const getStripeStatus = async () => {
  const data = (await stripeConfigRef.get()).data()
  return { configured: Boolean(data?.secret), webhookConfigured: Boolean(data?.webhook), enabled: data?.enabled === true, mode: data?.mode || '' }
}

const sendShopEmail = async ({ to, subject, text, html, attachment, replyTo }) => {
  const snapshot = await mailConfigRef.get()
  if (!snapshot.exists || !snapshot.data().passwordCiphertext) throw new Error('SMTP-Mailversand ist noch nicht eingerichtet.')
  const mail = snapshot.data()
  const port = Number(mail.port)
  const recipient = normalizeEmailAddress(to)
  const normalizedReplyTo = replyTo ? normalizeEmailAddress(replyTo) : ''
  const transporter = nodemailer.createTransport({
    host: mail.host,
    port,
    secure: Boolean(mail.secure),
    auth: { user: mail.username, pass: decryptMailPassword(mail) },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  })
  const info = await sendWithTransientRetry(
    () => transporter.sendMail({
      from: normalizeEmailAddress(mail.from),
      to: recipient,
      subject,
      text,
      html,
      ...(normalizedReplyTo ? { replyTo: normalizedReplyTo } : {}),
      ...(attachment ? { attachments: [attachment] } : {}),
    }),
  )
  ensureRecipientsAccepted(info, [recipient])
  console.info('SMTP hat die Nachricht angenommen.', { messageId: String(info.messageId || ''), acceptedCount: info.accepted.length })
  return info
}

const getSmtpTestFailureMessage = (error) => {
  const code = String(error?.code || '')
  console.warn('SMTP-Test fehlgeschlagen', { code, command: String(error?.command || '') })
  return describeSmtpFailure(error, 'SMTP-Test')
}

// Legt die Webshop-Bestellung als Kundenauftrag in der Cloud an, damit Desktop und Scanner sie sofort sehen.
const syncOrderToDesktop = async (orderId, order, paymentStatus) => {
  try {
    const { value: desktopProducts } = await readCloudAppData('zyro-products')
    const productList = Array.isArray(desktopProducts) ? desktopProducts : []
    const vatRate = Number(order.vatRate) || 19
    await runMdeCloudUpdate(['zyro-sales-documents'], (data) => {
      const documents = data['zyro-sales-documents']
      const existing = documents.find((entry) => entry.websiteOrderId === orderId)
      if (existing) {
        if (paymentStatus === 'paid' && existing.paymentStatus !== 'paid') {
          existing.paymentStatus = 'paid'
          existing.notes = String(existing.notes || '').replace('Zahlung offen', 'BEZAHLT')
        }
        return
      }
      const documentDate = new Date().toISOString().slice(0, 10)
      const year = documentDate.slice(0, 4)
      const lastNumber = documents
        .filter((entry) => entry.kind === 'kundenauftrag')
        .reduce((highest, entry) => Math.max(highest, Number(String(entry.number || '').split('-').at(-1)) || 0), 0)
      const items = order.items.map((item) => {
        const product = productList.find((entry) => slugify(entry.sku || entry.name) === item.productId)
        const lineNet = order.pricesIncludeVat === false ? item.lineTotalCents / 100 : item.lineTotalCents / 100 / (1 + vatRate / 100)
        const name = product?.name || item.productName
        const sku = product?.sku || ''
        const preorderNote = item.isPreorder
          ? `Vorbestellung${item.expectedDeliveryDate ? ` · voraussichtliche Lieferung ${new Date(`${item.expectedDeliveryDate}T00:00:00.000Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })}` : ''}`
          : ''
        return {
          productId: product?.id ?? '',
          reviewProductId: item.productId,
          productName: name,
          productSku: sku,
          productCategory: product?.category || '',
          productVolume: product?.volume || '',
          description: [name, sku, product?.category, product?.volume, preorderNote].filter(Boolean).join(' · '),
          quantity: item.quantity,
          unitPrice: Math.round(lineNet / item.quantity * 100) / 100,
          isPreorder: item.isPreorder === true,
          expectedDeliveryDate: item.expectedDeliveryDate || '',
        }
      })
      const first = items[0]
      const depositCents = Number(order.depositCents) || 0
      const netTotal = (order.totalPriceCents - depositCents - order.vatCents) / 100
      const paid = paymentStatus === 'paid'
      documents.unshift({
        id: orderId,
        websiteOrderId: orderId,
        source: 'webshop',
        kind: 'kundenauftrag',
        number: `KA-${year}-${String(lastNumber + 1).padStart(4, '0')}`,
        paymentReference: '',
        customerId: '',
        lotNumber: '',
        relatedOrderId: '',
        recipient: order.company || order.name,
        recipientEmail: order.email,
        recipientAddress: [order.name !== (order.company || order.name) ? order.name : '', order.address, `${order.postalCode} ${order.city}`].filter(Boolean).join('\n'),
        billingRecipient: order.billingCompany || order.company || order.name,
        billingEmail: order.billingEmail || order.email,
        billingAddress: order.billingAddress && order.billingPostalCode && order.billingCity
          ? [order.billingAddress, `${order.billingPostalCode} ${order.billingCity}`].join('\n')
          : [order.name !== (order.company || order.name) ? order.name : '', order.address, `${order.postalCode} ${order.city}`].filter(Boolean).join('\n'),
        customerVatId: order.vatId || '',
        recipientPhone: order.phone || '',
        contactRole: order.contactRole || '',
        items,
        productId: first.productId,
        productName: first.productName,
        productSku: first.productSku,
        productCategory: first.productCategory,
        productVolume: first.productVolume,
        description: items.map((item) => `${item.description} × ${item.quantity}`).join('\n'),
        quantity: first.quantity,
        unitPrice: first.unitPrice,
        paymentMethod: order.paymentMethod === 'stripe' ? 'Online (Stripe)' : 'Vorkasse',
        paymentStatus: paid ? 'paid' : 'pending',
        hasPreorderItems: order.hasPreorderItems === true,
        shippingMethod: 'DPD Paket (bis 31,5 kg)',
        responsibleName: 'Webshop',
        vatRate,
        documentDate,
        dueDate: '',
        notes: [
          `Webshop-Bestellung ${order.orderNumber} · ${paid ? 'BEZAHLT' : 'Zahlung offen'}`,
          ...items.filter((item) => item.isPreorder).map((item) => `${item.productName}: VORBESTELLUNG${item.expectedDeliveryDate ? ` · voraussichtliche Lieferung ${new Date(`${item.expectedDeliveryDate}T00:00:00.000Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })}` : ''}`),
          order.discountCents > 0 ? `Rabattcode ${order.discountCode}: −${(order.discountCents / 100).toFixed(2).replace('.', ',')} €` : '',
          order.businessPricingApplied ? 'Vereinbarte Geschäftskunden-Verkaufspreise angewendet' : '',
          `Versand: ${(order.shippingPriceCents / 100).toFixed(2).replace('.', ',')} € (${order.shippingMethod || 'DPD Paket (bis 31,5 kg)'}${order.shippingPalletCount ? ` · ${order.shippingPalletCount} Palette(n)` : ` · ${order.shippingBillableWeightKg} kg`})`,
          order.note ? `Kundenhinweis: ${order.note}` : '',
        ].filter(Boolean).join('\n'),
        websiteInvoiceTotals: { netTotal, taxTotal: order.vatCents / 100, grossTotal: (order.totalPriceCents - depositCents) / 100 },
        status: 'Offen',
      })
    })
    await db.collection('publicOrders').doc(orderId).update({ desktopSyncedAt: admin.firestore.FieldValue.serverTimestamp(), desktopSyncError: '' })
  } catch (error) {
    console.error('Bestellung konnte nicht ins Desktop-System übertragen werden:', error.message)
    await db.collection('publicOrders').doc(orderId).update({ desktopSyncError: String(error.message || '').slice(0, 300) }).catch(() => {})
  }
}

const completePublicOrder = async ({ order, shop, paymentStatus, skipEmail = false }) => {
  const orderRef = db.collection('publicOrders').doc()
  const portalOrderRef = db.collection('customerPortalOrders').doc(orderRef.id)
  const orderNumber = `ZY-WEB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${orderRef.id.slice(0, 6).toUpperCase()}`
  const paymentInfo = { accountHolder: shop.payment.accountHolder, iban: shop.payment.iban, reference: orderNumber }
  const orderData = {
    ...order,
    orderNumber,
    status: 'new',
    paymentStatus,
    confirmationEmailStatus: skipEmail ? 'pending' : 'sending',
    confirmationEmailAttempts: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  const batch = db.batch()
  batch.set(orderRef, orderData)
  batch.set(portalOrderRef, {
    ...orderData,
    customerStatus: 'Bestellung eingegangen',
    portalCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  await batch.commit()
  await syncOrderToDesktop(orderRef.id, orderData, paymentStatus)
  if (skipEmail) return { ...orderData, orderId: orderRef.id, paymentInfo, confirmationEmailSent: false }
  const confirmationEmail = buildOrderConfirmationEmail({ order: { ...order, paymentStatus }, orderNumber, paymentInfo })
  let confirmationEmailSent = false
  try {
    await sendShopEmail({ to: order.email, subject: `Bestellbestätigung ${orderNumber} · ZYRO`, ...confirmationEmail })
    confirmationEmailSent = true
  } catch (emailError) {
    console.error('Bestellbestätigung konnte nicht versendet werden:', emailError.message)
  }
  const emailStatus = {
    confirmationEmailStatus: confirmationEmailSent ? 'sent' : 'failed',
    confirmationEmailAttempts: 1,
    ...(confirmationEmailSent
      ? { confirmationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(), confirmationEmailError: '' }
      : { confirmationEmailError: String('Bestellbestätigung konnte nicht versendet werden.').slice(0, 300) }),
  }
  await Promise.all([
    orderRef.set(emailStatus, { merge: true }),
    portalOrderRef.set(emailStatus, { merge: true }),
  ]).catch((error) => console.error('E-Mail-Status der Bestellung konnte nicht gespeichert werden:', error.message))
  return { ...orderData, orderId: orderRef.id, paymentInfo, confirmationEmailSent }
}
  const enforceCustomerAuthLimit = async (request, emailKey, action) => {
    const now = Date.now()
    const ids = [
      `${action}-ip-${getClientRateLimitId(request)}`,
      `${action}-email-${emailKey}`,
    ]
    for (const id of ids) {
      const ref = db.collection('customerPortalAuthRateLimits').doc(id)
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref)
        const current = snapshot.exists ? snapshot.data() : null
        const windowStart = Number(current?.windowStart || 0)
        const count = windowStart > now - 10 * 60 * 1000 ? Number(current?.count || 0) : 0
        const limit = id.includes('-ip-') ? 30 : (action === 'login' ? 12 : 5)
        if (count >= limit) throw new Error('Zu viele Kontoanfragen. Bitte in einigen Minuten erneut versuchen.')
        transaction.set(ref, {
          windowStart: count ? windowStart : now,
          count: count + 1,
          expiresAt: admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000),
        })
      })
    }
  }

  const customerAuthResponse = (request, response) => {
    setCors(request, response)
    response.set('Cache-Control', 'no-store')
  }
  const customerAuthStatus = (error) => /Zu viele Kontoanfragen/.test(error.message) ? 429 : 500
  const customerAuthRef = (email) => db.collection('customerPortalCredentials').doc(customerEmailKey(email))
  exports.registerCustomerPortal = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 30,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    customerAuthResponse(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'POST') return sendMethodError(response)
    const email = normalizeCustomerEmail(request.body?.email)
    if (!email) return response.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' })
    let password
    try {
      password = validateCustomerPassword(request.body?.password)
    } catch (error) {
      return response.status(400).json({ error: error.message })
    }
    try {
      const emailKey = customerEmailKey(email)
      await enforceCustomerAuthLimit(request, emailKey, 'register')
      const credentialsRef = customerAuthRef(email)
      const existing = (await credentialsRef.get()).data()
      if (existing?.verifiedAt) return response.json({ verificationSent: true })
      const credentials = await hashCustomerPassword(password)
      const verificationToken = crypto.randomBytes(32).toString('base64url')
      await credentialsRef.set({
        ...credentials,
        email,
        verificationTokenHash: hashCustomerActionToken(verificationToken),
        verificationExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      try {
        await sendShopEmail({
          to: email,
          subject: 'Bestätige dein ZYRO-Konto',
          text: `Bitte bestätige dein ZYRO-Konto über diesen Link:\nhttps://xn--zyro-getrnke-ocb.de/brand.html#verify=${verificationToken}&email=${encodeURIComponent(email)}\n\nDer Link ist 24 Stunden gültig.`,
          html: `<p>Bitte bestätige dein ZYRO-Konto:</p><p><a href="https://xn--zyro-getrnke-ocb.de/brand.html#verify=${encodeURIComponent(verificationToken)}&amp;email=${encodeURIComponent(email)}">E-Mail-Adresse bestätigen</a></p><p>Der Link ist 24 Stunden gültig.</p>`,
        })
      } catch (error) {
        await credentialsRef.update({
          verificationTokenHash: admin.firestore.FieldValue.delete(),
          verificationExpiresAt: admin.firestore.FieldValue.delete(),
        })
        console.error('Konto-Bestätigungslink konnte nicht gesendet werden:', error.message)
        return response.status(502).json({ error: 'Bestätigungslink konnte nicht gesendet werden. Bitte später erneut versuchen.' })
      }
      return response.json({ verificationSent: true })
    } catch (error) {
      return response.status(customerAuthStatus(error)).json({ error: error.message || 'Konto konnte nicht angelegt werden.' })
    }
  })

  exports.loginCustomerPortal = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 30,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    customerAuthResponse(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'POST') return sendMethodError(response)
    const email = normalizeCustomerEmail(request.body?.email)
    const password = request.body?.password
    if (!email || typeof password !== 'string' || password.length > 128) {
      return response.status(400).json({ error: 'E-Mail-Adresse oder Passwort ungültig.' })
    }
    try {
      const emailKey = customerEmailKey(email)
      await enforceCustomerAuthLimit(request, emailKey, 'login')
      const credentials = (await db.collection('customerPortalCredentials').doc(customerEmailKey(email)).get()).data()
      const passwordValid = await verifyCustomerPassword(password, credentials || {
        passwordSalt: '00000000000000000000000000000000',
        passwordHash: '0'.repeat(128),
      })
      if (!credentials || !passwordValid) return response.status(401).json({ error: 'E-Mail-Adresse oder Passwort ist falsch.' })
      if (!credentials.verifiedAt) return response.status(403).json({ error: 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in deinem Postfach.' })
      return response.json({ accessToken: createCustomerSessionToken(email) })
    } catch (error) {
      return response.status(customerAuthStatus(error)).json({ error: error.message || 'Anmeldung derzeit nicht möglich.' })
    }
  })

  exports.verifyCustomerPortalEmail = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 15,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    customerAuthResponse(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'POST') return sendMethodError(response)
    const email = normalizeCustomerEmail(request.body?.email)
    const token = String(request.body?.token || '')
    if (!email || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return response.status(400).json({ error: 'Bestätigungslink ungültig oder abgelaufen.' })
    try {
      const ref = customerAuthRef(email)
      const verified = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref)
        const credentials = snapshot.data()
        if (!snapshot.exists) return false
        if (!isCustomerVerificationTokenValid(credentials, token)) return false
        transaction.update(ref, {
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedTokenHash: credentials.verificationTokenHash,
          verificationTokenHash: admin.firestore.FieldValue.delete(),
          verificationExpiresAt: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return true
      })
      if (!verified) return response.status(400).json({ error: 'Bestätigungslink ungültig oder abgelaufen. Bitte erneut registrieren.' })
      return response.json({ verified: true, accessToken: createCustomerSessionToken(email) })
    } catch (error) {
      console.error('Konto-E-Mail konnte nicht bestätigt werden:', error.message)
      return response.status(500).json({ error: 'E-Mail-Adresse konnte nicht bestätigt werden.' })
    }
  })

  exports.requestCustomerPasswordReset = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 25,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    customerAuthResponse(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'POST') return sendMethodError(response)
    const email = normalizeCustomerEmail(request.body?.email)
    if (!email) return response.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' })
    try {
      await enforceCustomerAuthLimit(request, customerEmailKey(email), 'reset')
      const ref = customerAuthRef(email)
      const credentials = (await ref.get()).data()
      if (credentials?.verifiedAt) {
        const resetToken = crypto.randomBytes(32).toString('base64url')
        await ref.update({
          resetTokenHash: hashCustomerActionToken(resetToken),
          resetExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        try {
          await sendShopEmail({
            to: email,
            subject: 'Setze dein ZYRO-Passwort zurück',
            text: `Über diesen Link kannst du ein neues Passwort festlegen:\nhttps://xn--zyro-getrnke-ocb.de/brand.html#reset=${resetToken}&email=${encodeURIComponent(email)}\n\nDer Link ist eine Stunde gültig. Wenn du das Zurücksetzen nicht angefordert hast, kannst du diese E-Mail ignorieren.`,
            html: `<p>Über diesen Link kannst du ein neues Passwort festlegen:</p><p><a href="https://xn--zyro-getrnke-ocb.de/brand.html#reset=${encodeURIComponent(resetToken)}&amp;email=${encodeURIComponent(email)}">Passwort zurücksetzen</a></p><p>Der Link ist eine Stunde gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.</p>`,
          })
        } catch (error) {
          await ref.update({
            resetTokenHash: admin.firestore.FieldValue.delete(),
            resetExpiresAt: admin.firestore.FieldValue.delete(),
          })
          console.error('Passwort-Reset-Link konnte nicht gesendet werden:', error.message)
          return response.status(502).json({ error: 'Passwort-Reset-Link konnte nicht gesendet werden. Bitte später erneut versuchen.' })
        }
      }
      return response.json({ sent: true })
    } catch (error) {
      return response.status(customerAuthStatus(error)).json({ error: error.message || 'Passwort-Reset konnte nicht angefordert werden.' })
    }
  })

  exports.resetCustomerPortalPassword = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 30,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    customerAuthResponse(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'POST') return sendMethodError(response)
    const email = normalizeCustomerEmail(request.body?.email)
    const token = String(request.body?.token || '')
    let password
    try {
      password = validateCustomerPassword(request.body?.password)
    } catch (error) {
      return response.status(400).json({ error: error.message })
    }
    if (!email || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return response.status(400).json({ error: 'Passwort-Reset-Link ungültig oder abgelaufen.' })
    try {
      await enforceCustomerAuthLimit(request, customerEmailKey(email), 'reset-save')
      const newCredentials = await hashCustomerPassword(password)
      const ref = customerAuthRef(email)
      const reset = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref)
        const credentials = snapshot.data()
        if (!snapshot.exists || !credentials?.verifiedAt || !credentials?.resetExpiresAt
          || credentials.resetExpiresAt.toMillis() <= Date.now()
          || !tokenHashMatches(credentials.resetTokenHash, token)) return false
        transaction.update(ref, {
          ...newCredentials,
          resetTokenHash: admin.firestore.FieldValue.delete(),
          resetExpiresAt: admin.firestore.FieldValue.delete(),
          passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return true
      })
      if (!reset) return response.status(400).json({ error: 'Passwort-Reset-Link ungültig oder abgelaufen.' })
      return response.json({ reset: true })
    } catch (error) {
      return response.status(customerAuthStatus(error)).json({ error: error.message || 'Passwort konnte nicht zurückgesetzt werden.' })
    }
  })

  const rejectCustomerPortalCodeLogin = () => onRequest({ region, cors: false, maxInstances: 3, timeoutSeconds: 10 }, async (request, response) => {
    setCors(request, response)
    response.set('Cache-Control', 'no-store')
    if (request.method === 'OPTIONS') return response.status(204).send('')
    return response.status(410).json({ error: 'Der Anmeldecode wurde abgeschaltet. Bitte E-Mail und Passwort verwenden.' })
  })
  exports.requestCustomerPortalCode = rejectCustomerPortalCodeLogin()
  exports.verifyCustomerPortalCode = rejectCustomerPortalCodeLogin()

  exports.listCustomerPortalOrders = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    setCors(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'GET') return sendMethodError(response)
    const session = await getCustomerSession(request)
    if (!session) return response.status(401).json({ error: 'Bitte erneut anmelden.' })
    try {
      const snapshot = await db.collection('customerPortalOrders').where('email', '==', session.email).limit(100).get()
      const orders = snapshot.docs.map((document) => {
        const data = document.data()
        return {
          id: document.id,
          orderNumber: data.orderNumber,
          createdAt: data.createdAt?.toDate?.().toISOString() || '',
          status: data.customerStatus === 'Rechnung versendet'
            ? (data.status === 'new' ? 'Bestellung eingegangen' : data.status || 'Bestellung eingegangen')
            : data.customerStatus || data.status || 'Eingegangen',
          trackingProvider: data.trackingProvider || '',
          trackingNumber: data.trackingNumber || '',
          paymentStatus: data.paymentStatus || 'pending',
          paymentMethod: data.paymentMethod,
          items: data.items || [],
          totalPriceCents: data.totalPriceCents,
          shippingPriceCents: data.shippingPriceCents,
          shippingWeightGrams: data.shippingWeightGrams,
          shippingBillableWeightKg: data.shippingBillableWeightKg,
          shippingPalletCount: data.shippingPalletCount,
          shippingMethod: data.shippingMethod,
          invoice: data.invoice ? { number: data.invoice.number, sentAt: data.invoice.sentAt?.toDate?.().toISOString?.() || '' } : null,
        }
      }).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      const invoiceSnapshot = await db.collection('customerPortalInvoices').where('email', '==', session.email).limit(200).get()
      const invoices = invoiceSnapshot.docs.map((document) => ({
        id: document.id,
        number: document.data().number,
        publishedAt: document.data().publishedAt?.toDate?.().toISOString?.() || '',
      })).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      return response.json({ orders, invoices })
    } catch {
      return response.status(500).json({ error: 'Bestellungen konnten nicht geladen werden.' })
    }
  })

  exports.downloadCustomerPortalInvoice = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    setCors(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'POST') return sendMethodError(response)
    const session = await getCustomerSession(request)
    if (!session) return response.status(401).json({ error: 'Bitte erneut anmelden.' })
    const invoiceId = String(request.body?.invoiceId || '')
    if (invoiceId) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(invoiceId)) return response.status(400).json({ error: 'Rechnung ungültig.' })
      try {
        const snapshot = await db.collection('customerPortalInvoices').doc(invoiceId).get()
        const data = snapshot.data()
        if (!snapshot.exists || data.email !== session.email) return response.status(404).json({ error: 'Rechnung nicht gefunden.' })
        return response.json({ filename: `${data.number}.pdf`, contentBase64: data.contentBase64 })
      } catch {
        return response.status(500).json({ error: 'Rechnung konnte nicht geladen werden.' })
      }
    }
    const orderId = String(request.body?.orderId || '')
    if (!/^[A-Za-z0-9]{20}$/.test(orderId)) return response.status(400).json({ error: 'Bestellung ungültig.' })
    try {
      const orderSnapshot = await db.collection('customerPortalOrders').doc(orderId).get()
      const invoice = orderSnapshot.data()?.invoice
      if (!orderSnapshot.exists || orderSnapshot.data().email !== session.email || !invoice?.contentBase64) {
        return response.status(404).json({ error: 'Für diese Bestellung ist keine Rechnung verfügbar.' })
      }
      return response.json({ filename: `${invoice.number}.pdf`, contentBase64: invoice.contentBase64 })
    } catch {
      return response.status(500).json({ error: 'Rechnung konnte nicht geladen werden.' })
    }
  })

  const profileFields = {
    name: 100, company: 120, phone: 40, address: 180, postalCode: 10, city: 100,
    contactRole: 80, vatId: 20, billingEmail: 254,
    billingCompany: 120, billingAddress: 180, billingPostalCode: 10, billingCity: 100,
    deliveryNote: 500,
  }

  exports.customerPortalProfile = onRequest({
    region,
    cors: false,
    maxInstances: 5,
    timeoutSeconds: 15,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    setCors(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (!['GET', 'POST'].includes(request.method)) return sendMethodError(response)
    const session = await getCustomerSession(request)
    if (!session) return response.status(401).json({ error: 'Bitte erneut anmelden.' })
    const profileRef = db.collection('customerProfiles').doc(customerEmailKey(session.email))
    try {
      if (request.method === 'GET') {
        const data = (await profileRef.get()).data() || {}
        return response.json({
          email: session.email,
          profile: Object.fromEntries(Object.keys(profileFields).map((field) => [field, String(data[field] || '')])),
          business: {
            status: String(data.businessStatus || ''),
            prices: data.businessPrices && typeof data.businessPrices === 'object' && !Array.isArray(data.businessPrices)
              ? data.businessPrices
              : {},
            requestedAt: data.businessRequestedAt?.toDate?.().toISOString?.() || '',
          },
        })
      }
      if (request.body?.action === 'delete') {
        const invoices = await db.collection('customerPortalInvoices').where('email', '==', session.email).limit(200).get()
        await profileRef.delete()
        return response.json({ deleted: true, retainedInvoices: invoices.size })
      }
      const input = request.body?.profile || {}
      const profile = {}
      for (const [field, max] of Object.entries(profileFields)) {
        const value = String(input[field] ?? '').replace(/[\r\n]+/g, ' ').trim()
        if (value.length > max) return response.status(400).json({ error: 'Eine Eingabe ist zu lang.' })
        profile[field] = value
      }
      if (profile.postalCode && !/^[A-Za-z0-9 -]{3,10}$/.test(profile.postalCode)) return response.status(400).json({ error: 'Bitte eine gültige PLZ eingeben.' })
      if (profile.billingEmail) {
        try {
          profile.billingEmail = normalizeCustomerEmail(profile.billingEmail)
          if (!profile.billingEmail) throw new Error('invalid')
        } catch {
          return response.status(400).json({ error: 'Bitte eine gültige Rechnungs-E-Mail eingeben.' })
        }
      }
      if (profile.vatId && !/^[A-Z]{2}[A-Z0-9]{6,14}$/.test(profile.vatId.toUpperCase())) {
        return response.status(400).json({ error: 'Bitte eine gültige USt-IdNr. mit Länderkennung eingeben.' })
      }
      profile.vatId = profile.vatId.toUpperCase()
      if ([profile.billingAddress, profile.billingPostalCode, profile.billingCity].some(Boolean)
        && (!profile.billingAddress || !profile.billingPostalCode || !profile.billingCity)) {
        return response.status(400).json({ error: 'Bitte eine abweichende Rechnungsadresse vollständig mit Straße, PLZ und Ort ausfüllen.' })
      }
      if (request.body?.action === 'business-apply') {
        if (!profile.company || !profile.name || !profile.phone || !profile.address || !profile.postalCode || !profile.city || !profile.vatId) {
          return response.status(400).json({ error: 'Für den Geschäftskundenantrag bitte Firma, Ansprechpartner, Telefon, Lieferadresse und USt-IdNr. vollständig ausfüllen.' })
        }
        const existing = (await profileRef.get()).data() || {}
        if (existing.businessStatus === 'approved') {
          return response.status(409).json({ error: 'Dein Geschäftskundenkonto ist bereits freigeschaltet.' })
        }
        if (existing.businessStatus === 'pending') {
          return response.status(409).json({ error: 'Dein Geschäftskundenantrag wird bereits geprüft.' })
        }
        await profileRef.set({
          ...profile,
          email: session.email,
          businessStatus: 'pending',
          businessRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
        return response.json({ saved: true, businessStatus: 'pending' })
      }
      await profileRef.set({ ...profile, email: session.email, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
      return response.json({ saved: true })
    } catch {
      return response.status(500).json({ error: 'Profil konnte nicht verarbeitet werden.' })
    }
  })

  exports.listBusinessCustomers = onRequest({
    region,
    cors: false,
    maxInstances: 3,
    timeoutSeconds: 15,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    if (request.method !== 'GET') return sendMethodError(response)
    if (!requireAdmin(request, response)) return
    try {
      const snapshots = await Promise.all(['pending', 'approved', 'rejected', 'suspended'].map((status) => db.collection('customerProfiles')
        .where('businessStatus', '==', status)
        .limit(200)
        .get()))
      const customers = snapshots.flatMap((snapshot) => snapshot.docs.map((document) => {
        const data = document.data()
        return {
          email: String(data.email || ''),
          profile: Object.fromEntries(Object.keys(profileFields).map((field) => [field, String(data[field] || '')])),
          status: String(data.businessStatus || ''),
          prices: data.businessPrices && typeof data.businessPrices === 'object' && !Array.isArray(data.businessPrices)
            ? data.businessPrices
            : {},
          requestedAt: data.businessRequestedAt?.toDate?.().toISOString?.() || '',
        }
      }))
      return response.json({ customers })
    } catch (error) {
      console.error('Geschäftskunden konnten nicht geladen werden:', error.message)
      return response.status(500).json({ error: 'Geschäftskunden konnten nicht geladen werden.' })
    }
  })

  exports.listCustomerAccounts = onRequest({
    region,
    cors: false,
    maxInstances: 3,
    timeoutSeconds: 20,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    if (request.method !== 'GET') return sendMethodError(response)
    if (!requireAdmin(request, response)) return
    try {
      const [credentialSnapshot, profileSnapshot] = await Promise.all([
        db.collection('customerPortalCredentials').limit(501).get(),
        db.collection('customerProfiles').limit(501).get(),
      ])
      if (credentialSnapshot.size > 500 || profileSnapshot.size > 500) {
        return response.status(413).json({ error: 'Es gibt mehr als 500 Kundenkonten. Bitte nutze die Kundenverwaltung mit einer kleineren Auswahl.' })
      }
      const accounts = new Map()
      credentialSnapshot.docs.forEach((document) => {
        const data = document.data()
        const email = normalizeCustomerEmail(data.email)
        if (!email) return
        accounts.set(email, {
          email,
          verified: Boolean(data.verifiedAt),
          createdAt: data.createdAt?.toDate?.().toISOString?.() || '',
          profile: {},
          status: '',
          prices: {},
          requestedAt: '',
        })
      })
      profileSnapshot.docs.forEach((document) => {
        const data = document.data()
        const email = normalizeCustomerEmail(data.email)
        if (!email) return
        const existing = accounts.get(email) || {
          email,
          verified: false,
          createdAt: '',
          profile: {},
          status: '',
          prices: {},
          requestedAt: '',
        }
        existing.profile = Object.fromEntries(Object.keys(profileFields).map((field) => [field, String(data[field] || '')]))
        existing.status = String(data.businessStatus || '')
        existing.prices = data.businessPrices && typeof data.businessPrices === 'object' && !Array.isArray(data.businessPrices)
          ? data.businessPrices
          : {}
        existing.requestedAt = data.businessRequestedAt?.toDate?.().toISOString?.() || ''
        accounts.set(email, existing)
      })
      return response.json({ customers: [...accounts.values()].sort((left, right) => left.email.localeCompare(right.email)) })
    } catch (error) {
      console.error('Kundenkonten konnten nicht geladen werden:', error.message)
      return response.status(500).json({ error: 'Kundenkonten konnten nicht geladen werden.' })
    }
  })

  exports.deleteCustomerAccount = onRequest({
    region,
    cors: false,
    maxInstances: 3,
    timeoutSeconds: 15,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    if (request.method !== 'POST') return sendMethodError(response)
    if (!requireAdmin(request, response)) return
    const email = normalizeCustomerEmail(request.body?.email)
    const confirmationEmail = normalizeCustomerEmail(request.body?.confirmEmail)
    if (!email || confirmationEmail !== email) {
      return response.status(400).json({ error: 'Bitte bestätige die Kontolöschung mit derselben E-Mail-Adresse.' })
    }
    try {
      const credentialsRef = customerAuthRef(email)
      const profileRef = db.collection('customerProfiles').doc(customerEmailKey(email))
      const [credentials, profile] = await Promise.all([credentialsRef.get(), profileRef.get()])
      if (!credentials.exists && !profile.exists) return response.status(404).json({ error: 'Kundenkonto nicht gefunden.' })
      const batch = db.batch()
      if (credentials.exists) batch.delete(credentialsRef)
      if (profile.exists) batch.delete(profileRef)
      await batch.commit()
      return response.json({
        deleted: true,
        deletedCredentials: credentials.exists,
        deletedProfile: profile.exists,
        orderHistoryRetained: true,
        invoiceHistoryRetained: true,
      })
    } catch (error) {
      console.error('Kundenkonto konnte nicht gelöscht werden:', error.message)
      return response.status(500).json({ error: 'Kundenkonto konnte nicht gelöscht werden.' })
    }
  })

  exports.updateBusinessCustomer = onRequest({
    region,
    cors: false,
    maxInstances: 3,
    timeoutSeconds: 15,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    if (request.method !== 'POST') return sendMethodError(response)
    if (!requireAdmin(request, response)) return
    const email = normalizeCustomerEmail(request.body?.email)
    const status = String(request.body?.status || '')
    let businessPrices
    try {
      const shop = await readShopConfig()
      businessPrices = cleanBusinessPrices(shop.products, request.body?.businessPrices || {})
    } catch (error) {
      return response.status(400).json({ error: error.message })
    }
    if (!email || !['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
      return response.status(400).json({ error: 'Geschäftskundenkonto oder Freigabestatus ungültig.' })
    }
    try {
      const profileRef = db.collection('customerProfiles').doc(customerEmailKey(email))
      const snapshot = await profileRef.get()
      if (!snapshot.exists || !['pending', 'approved', 'rejected', 'suspended'].includes(snapshot.data().businessStatus)) {
        return response.status(404).json({ error: 'Geschäftskundenantrag nicht gefunden.' })
      }
      await profileRef.update({
        businessStatus: status,
        businessPrices,
        businessDiscountPercent: admin.firestore.FieldValue.delete(),
        businessReviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return response.json({ saved: true, status, prices: businessPrices })
    } catch (error) {
      console.error('Geschäftskundenkonto konnte nicht aktualisiert werden:', error.message)
      return response.status(500).json({ error: 'Geschäftskundenkonto konnte nicht aktualisiert werden.' })
    }
  })

  exports.updateCustomerPortalOrderStatus = onRequest({
    region,
    cors: false,
    maxInstances: 3,
    timeoutSeconds: 15,
    secrets: [orderAdminToken],
  }, async (request, response) => {
    setCors(request, response)
    if (request.method === 'OPTIONS') return response.status(204).send('')
    if (request.method !== 'POST') return sendMethodError(response)
    if (!requireAdmin(request, response)) return
    const orderId = String(request.body?.orderId || '')
    const status = String(request.body?.status || '')
    const portalOrderData = request.body?.portalOrderData
    const hasStatus = Object.hasOwn(request.body || {}, 'status')
    const hasTrackingNumber = Object.hasOwn(request.body || {}, 'trackingNumber')
    const hasTrackingProvider = Object.hasOwn(request.body || {}, 'trackingProvider')
    const trackingNumber = String(request.body?.trackingNumber || '').trim()
    const trackingProvider = String(request.body?.trackingProvider || '').trim()
    if (!/^[A-Za-z0-9]{20}$/.test(orderId)
      || (hasStatus && !['Neu', 'In Bearbeitung', 'In Verkauf', 'Versendet', 'Abgeschlossen'].includes(status))
      || (hasTrackingNumber && trackingNumber.length > 100)
      || (hasTrackingProvider && !['DHL', 'DPD', 'UPS', 'GLS', 'Spedition', 'Sonstige', ''].includes(trackingProvider))
      || (hasTrackingProvider && trackingNumber && !trackingProvider)
      || (!hasStatus && !hasTrackingNumber && !hasTrackingProvider)) {
      return response.status(400).json({ error: 'Bestellstatus ungültig.' })
    }
    const update = {
      statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(hasStatus ? { customerStatus: status } : {}),
      ...(hasTrackingNumber ? { trackingNumber: trackingNumber || admin.firestore.FieldValue.delete() } : {}),
      ...(hasTrackingProvider ? { trackingProvider: trackingNumber ? trackingProvider : admin.firestore.FieldValue.delete() } : {}),
      ...(hasStatus ? { workflowStatus: status } : {}),
    }
    const portalRef = db.collection('customerPortalOrders').doc(orderId)
    const [portalSnapshot, publicSnapshot] = await Promise.all([
      portalRef.get(),
      db.collection('publicOrders').doc(orderId).get(),
    ])
    const existingEmail = normalizeCustomerEmail(portalSnapshot.data()?.email)
    const fallbackEmail = normalizeCustomerEmail(publicSnapshot.data()?.email || portalOrderData?.email)
    if (!existingEmail && !fallbackEmail) {
      return response.status(400).json({ error: 'Für diese alte Bestellung fehlen Kundendaten. Bitte Bestellung erneut im App-Konto aktualisieren.' })
    }
    if (existingEmail && fallbackEmail && existingEmail !== fallbackEmail) {
      return response.status(409).json({ error: 'Kunden-E-Mail stimmt nicht mit dem Portalauftrag überein.' })
    }
    const source = publicSnapshot.exists ? publicSnapshot.data() : (portalOrderData || {})
    const createdAt = source.createdAt?.toDate?.()
      || (typeof source.createdAt === 'string' && Number.isFinite(Date.parse(source.createdAt)) ? new Date(source.createdAt) : new Date())
    const portalSeed = portalSnapshot.exists ? {} : {
      email: fallbackEmail,
      company: String(source.company || '').slice(0, 120),
      name: String(source.name || '').slice(0, 100),
      address: String(source.address || '').slice(0, 180),
      postalCode: String(source.postalCode || '').slice(0, 10),
      city: String(source.city || '').slice(0, 100),
      note: String(source.note || '').slice(0, 1000),
      items: Array.isArray(source.items) ? source.items.slice(0, 50) : [],
      orderNumber: String(source.orderNumber || '').slice(0, 80),
      paymentMethod: String(source.paymentMethod || ''),
      totalPriceCents: Number(source.totalPriceCents) || 0,
      shippingPriceCents: Number(source.shippingPriceCents) || 0,
      shippingWeightGrams: Number(source.shippingWeightGrams) || 0,
      shippingBillableWeightKg: Number(source.shippingBillableWeightKg) || 0,
      shippingPalletCount: Number(source.shippingPalletCount) || 0,
      shippingMethod: String(source.shippingMethod || ''),
      portalCreatedAt: admin.firestore.Timestamp.fromDate(createdAt),
      customerStatus: 'Bestellung eingegangen',
    }
    const batch = db.batch()
    batch.set(portalRef, { ...portalSeed, ...update }, { merge: true })
    batch.set(db.collection('publicOrders').doc(orderId), update, { merge: true })
    await batch.commit()
    return response.json({ success: true })
  })

const normalizeCustomerEmail = (value) => {
  try {
    return canonicalEmailAddress(String(value || ''))
  } catch {
    return ''
  }
}
const isValidEmailAddress = (value) => {
  try {
    normalizeEmailAddress(String(value || ''))
    return true
  } catch {
    return false
  }
}
const customerEmailKey = (email) => crypto.createHash('sha256').update(email).digest('hex')

const createCustomerSessionToken = (email) => {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url')
  const signature = crypto.createHmac('sha256', orderAdminToken.value().trim()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

const getCustomerSession = async (request) => {
  const authorization = String(request.get('authorization') || '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) return null
  try {
    const expected = Buffer.from(crypto.createHmac('sha256', orderAdminToken.value().trim()).update(payload).digest('base64url'))
    const provided = Buffer.from(signature)
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!isValidEmailAddress(claims.email) || Number(claims.exp) <= Date.now()) return null
    const email = normalizeCustomerEmail(claims.email)
    const credentials = (await customerAuthRef(email).get()).data()
    if (!credentials?.verifiedAt) return null
    return { email }
  } catch {
    return null
  }
}

const getClientRateLimitId = (request) => crypto.createHash('sha256').update(String(request.ip || 'unbekannt')).digest('hex')

const enforceRateLimit = async (request) => {
  const now = Date.now()
  const ref = db.collection('publicOrderRateLimits').doc(getClientRateLimitId(request))
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? snapshot.data() : null
    const windowStart = Number(current?.windowStart || 0)
    const count = windowStart > now - 15 * 60 * 1000 ? Number(current?.count || 0) : 0
    if (count >= 5) throw new Error('Zu viele Bestellanfragen. Bitte später erneut versuchen.')
    transaction.set(ref, { windowStart: count ? windowStart : now, count: count + 1 })
  })
}

const enforceContactRateLimit = async (request) => {
  const now = Date.now()
  const ref = db.collection('brandContactRateLimits').doc(getClientRateLimitId(request))
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? snapshot.data() : null
    const windowStart = Number(current?.windowStart || 0)
    const count = windowStart > now - 60 * 60 * 1000 ? Number(current?.count || 0) : 0
    if (count >= 5) throw new Error('Zu viele Nachrichten. Bitte versuche es in einer Stunde erneut.')
    transaction.set(ref, { windowStart: count ? windowStart : now, count: count + 1 })
  })
}

exports.sendBrandContactMessage = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 25,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Kontaktanfrage nicht zulässig.' })
  if (String(request.body?.website || '').trim()) return response.status(202).json({ accepted: true })

  try {
    const contact = validateContactMessage(request.body)
    await enforceContactRateLimit(request)
    const messageRef = brandContactMessagesRef.doc()
    const accessToken = createInquiryAccessToken()
    const now = admin.firestore.Timestamp.now()
    await messageRef.set({
      ...contact,
      status: 'new',
      createdAt: now,
      lastMessageAt: now,
      accessToken,
      thread: [{ from: 'customer', text: contact.message, at: now }],
    })
    const subject = `ZYRO Kontakt: ${contact.subject.replace(/[\r\n]+/g, ' ')}`
    let notificationEmailSent = false
    try {
      await sendShopEmail({
        to: await getInquiryNotifyEmail(),
        replyTo: contact.email,
        subject,
        ...buildTeamNotificationEmail({ kind: 'new', inquiry: contact, text: contact.message }),
      })
      notificationEmailSent = true
    } catch (error) {
      console.error('Kontaktanfrage gespeichert, aber die Benachrichtigungs-E-Mail ist fehlgeschlagen:', error.message)
    }
    let confirmationEmailSent = false
    try {
      await sendShopEmail({
        to: contact.email,
        replyTo: await getInquiryNotifyEmail(),
        subject: `Deine Anfrage bei ZYRO: ${contact.subject.replace(/[\r\n]+/g, ' ').slice(0, 150)}`,
        ...buildCustomerReceiptEmail({ name: contact.name, link: buildInquiryLink(messageRef.id, accessToken) }),
      })
      confirmationEmailSent = true
    } catch (error) {
      console.error('Eingangsbestätigung konnte nicht gesendet werden:', error.message)
    }
    await messageRef.update({
      notificationEmailStatus: notificationEmailSent ? 'sent' : 'failed',
      confirmationEmailStatus: confirmationEmailSent ? 'sent' : 'failed',
      emailStatusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch((error) => console.error('E-Mail-Status der Kontaktanfrage konnte nicht gespeichert werden:', error.message))
    return response.json({ sent: true, notificationEmailSent, confirmationEmailSent })
  } catch (error) {
    const rateLimited = /Zu viele Nachrichten/.test(error.message)
    if (rateLimited) return response.status(429).json({ error: error.message })
    console.error('Kontaktformular fehlgeschlagen:', error.message)
    return response.status(503).json({ error: error.message === 'SMTP-Mailversand ist noch nicht eingerichtet.'
      ? 'Das Kontaktformular ist noch nicht eingerichtet. Bitte nutze den E-Mail-Link.'
      : 'Nachricht konnte nicht gesendet werden. Bitte versuche es später erneut.' })
  }
})

const toIso = (value) => value?.toDate?.().toISOString() || null

exports.listBrandContactMessages = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 20,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'GET') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  try {
    const snapshot = await brandContactMessagesRef.orderBy('createdAt', 'desc').limit(100).get()
    const messages = snapshot.docs.map((document) => {
      const data = document.data()
      return {
        id: document.id,
        name: data.name,
        email: data.email,
        subject: data.subject,
        status: data.status,
        createdAt: toIso(data.createdAt),
        lastMessageAt: toIso(data.lastMessageAt || data.createdAt),
        thread: buildInquiryThread(data),
      }
    })
    return response.json({ messages, notifyEmail: await getInquiryNotifyEmail() })
  } catch (error) {
    console.error('Kontaktanfragen konnten nicht geladen werden:', error.message)
    return response.status(500).json({ error: 'Kontaktanfragen konnten nicht geladen werden.' })
  }
})

exports.replyBrandContactMessage = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 30,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  const messageId = String(request.body?.messageId || '')
  let reply
  try {
    reply = validateInquiryReply(request.body?.reply)
  } catch (error) {
    return response.status(400).json({ error: error.message })
  }
  if (!/^[A-Za-z0-9]{20}$/.test(messageId)) {
    return response.status(400).json({ error: 'Anfrage oder Antwort ist ungültig.' })
  }
  try {
    const messageRef = brandContactMessagesRef.doc(messageId)
    const snapshot = await messageRef.get()
    if (!snapshot.exists) return response.status(404).json({ error: 'Kontaktanfrage nicht gefunden.' })
    const contact = snapshot.data()
    let accessToken = contact.accessToken
    if (!accessToken) {
      accessToken = createInquiryAccessToken()
      await messageRef.update({ accessToken })
    }
    await sendShopEmail({
      to: contact.email,
      replyTo: await getInquiryNotifyEmail(),
      subject: buildReplySubject(contact.subject),
      ...buildTeamReplyEmail({ reply, link: buildInquiryLink(messageId, accessToken) }),
    })
    const now = admin.firestore.Timestamp.now()
    const thread = Array.isArray(contact.thread)
      ? contact.thread
      : buildInquiryThread(contact).map((entry) => ({
        from: entry.from,
        text: entry.text,
        at: entry.at ? admin.firestore.Timestamp.fromDate(new Date(entry.at)) : now,
      }))
    await messageRef.update({
      status: 'replied',
      lastMessageAt: now,
      thread: [...thread, { from: 'team', text: reply, at: now }],
    })
    return response.json({ sent: true })
  } catch (error) {
    console.error('Antwort auf Kontaktanfrage fehlgeschlagen:', error.message)
    return response.status(502).json({ error: 'Antwort konnte nicht gesendet werden. SMTP-Einstellungen prüfen.' })
  }
})

exports.deleteBrandContactMessage = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 15,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  const messageId = String(request.body?.messageId || '')
  if (!/^[A-Za-z0-9]{20}$/.test(messageId)) return response.status(400).json({ error: 'Kontaktanfrage ungültig.' })
  try {
    const messageRef = brandContactMessagesRef.doc(messageId)
    const snapshot = await messageRef.get()
    if (!snapshot.exists) return response.status(404).json({ error: 'Kontaktanfrage nicht gefunden.' })
    await messageRef.delete()
    return response.json({ deleted: true })
  } catch (error) {
    console.error('Kontaktanfrage konnte nicht gelöscht werden:', error.message)
    return response.status(500).json({ error: 'Kontaktanfrage konnte nicht gelöscht werden.' })
  }
})

exports.updateBrandContactMessage = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 15,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  const messageId = String(request.body?.messageId || '')
  const status = String(request.body?.status || '')
  if (!/^[A-Za-z0-9]{20}$/.test(messageId) || !['closed', 'replied', 'new'].includes(status)) {
    return response.status(400).json({ error: 'Anfrage oder Status ungültig.' })
  }
  try {
    const messageRef = brandContactMessagesRef.doc(messageId)
    if (!(await messageRef.get()).exists) return response.status(404).json({ error: 'Kontaktanfrage nicht gefunden.' })
    await messageRef.update({ status })
    return response.json({ updated: true })
  } catch (error) {
    console.error('Status der Kontaktanfrage konnte nicht geändert werden:', error.message)
    return response.status(500).json({ error: 'Status konnte nicht geändert werden.' })
  }
})

exports.brandInquirySettings = onRequest({
  region,
  cors: false,
  maxInstances: 2,
  timeoutSeconds: 15,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'GET' && request.method !== 'POST') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  try {
    if (request.method === 'POST') {
      const notifyEmail = String(request.body?.notifyEmail || '').trim().toLowerCase()
      if (notifyEmail.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(notifyEmail)) {
        return response.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' })
      }
      await inquiryConfigRef.set({ notifyEmail, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    }
    return response.json({ notifyEmail: await getInquiryNotifyEmail() })
  } catch (error) {
    console.error('Anfrage-Einstellungen fehlgeschlagen:', error.message)
    return response.status(500).json({ error: 'Einstellungen konnten nicht gespeichert werden.' })
  }
})

const enforceInquiryThreadRateLimit = async (request) => {
  const now = Date.now()
  const ref = db.collection('brandInquiryRateLimits').doc(getClientRateLimitId(request))
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const current = snapshot.exists ? snapshot.data() : null
    const windowStart = Number(current?.windowStart || 0)
    const count = windowStart > now - 15 * 60 * 1000 ? Number(current?.count || 0) : 0
    if (count >= 30) throw new Error('Zu viele Anfragen. Bitte versuche es später erneut.')
    transaction.set(ref, { windowStart: count ? windowStart : now, count: count + 1 })
  })
}

exports.brandInquiryThread = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 25,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'GET' && request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Nicht zulässig.' })
  const source = request.method === 'GET' ? request.query : request.body
  const inquiryId = String(source?.id || '')
  const accessToken = String(source?.t || '')
  const notFound = () => response.status(404).json({ error: 'Anfrage nicht gefunden oder Link ungültig.' })
  if (!/^[A-Za-z0-9]{20}$/.test(inquiryId) || accessToken.length > 200) return notFound()

  try {
    await enforceInquiryThreadRateLimit(request)
    const inquiryRef = brandContactMessagesRef.doc(inquiryId)
    const snapshot = await inquiryRef.get()
    if (!snapshot.exists || !verifyInquiryAccessToken(snapshot.data().accessToken, accessToken)) return notFound()
    let data = snapshot.data()

    if (request.method === 'POST') {
      const text = validateInquiryReply(request.body?.reply)
      if (String(request.body?.website || '').trim()) return response.status(202).json({ accepted: true })
      const now = admin.firestore.Timestamp.now()
      data = await db.runTransaction(async (transaction) => {
        const current = (await transaction.get(inquiryRef)).data()
        const thread = Array.isArray(current.thread)
          ? current.thread
          : buildInquiryThread(current).map((entry) => ({
            from: entry.from,
            text: entry.text,
            at: entry.at ? admin.firestore.Timestamp.fromDate(new Date(entry.at)) : now,
          }))
        if (thread.length >= 200) throw new Error('Diese Unterhaltung ist zu lang. Bitte schreibe uns eine neue Nachricht.')
        const updated = { thread: [...thread, { from: 'customer', text, at: now }], status: 'customer_replied', lastMessageAt: now }
        transaction.update(inquiryRef, updated)
        return { ...current, ...updated }
      })
      try {
        await sendShopEmail({
          to: await getInquiryNotifyEmail(),
          replyTo: data.email,
          subject: `ZYRO Antwort von ${String(data.name).replace(/[\r\n]+/g, ' ')}: ${String(data.subject).replace(/[\r\n]+/g, ' ').slice(0, 150)}`,
          ...buildTeamNotificationEmail({ kind: 'customer_reply', inquiry: data, text }),
        })
      } catch (error) {
        console.error('Kundenantwort gespeichert, aber die Benachrichtigung ist fehlgeschlagen:', error.message)
      }
    }

    return response.json({
      subject: data.subject,
      name: data.name,
      status: data.status,
      thread: buildInquiryThread(data),
    })
  } catch (error) {
    if (/Zu viele Anfragen/.test(error.message)) return response.status(429).json({ error: error.message })
    if (/muss zwischen|zu lang/.test(error.message)) return response.status(400).json({ error: error.message })
    console.error('Anfrage-Verlauf fehlgeschlagen:', error.message)
    return response.status(500).json({ error: 'Anfrage konnte nicht verarbeitet werden.' })
  }
})

const cloudDataKeys = new Set([
  'zyro-users',
  'zyro-activation-keys',
  'zyro-products',
  'zyro-recipes',
  'zyro-lab-tests',
  'zyro-orders',
  'zyro-sales-documents',
  'zyro-suppliers',
  'zyro-purchase-orders',
  'zyro-finance-entries',
  'zyro-payment-requests',
  'zyro-payment-settings',
  'zyro-cost-calculations',
  'zyro-elster-setup',
  'zyro-company-details',
  'zyro-bottler-details',
  'zyro-website-orders',
  'zyro-customers',
  'zyro-sales-target',
  'zyro-inventory',
  'zyro-stock-movements',
  'zyro-reports',
  'zyro-machinebau',
  'zyro-hr-sensitive',
  'zyro-archive-documents',
  'zyro-delete-requests',
  'zyro-audit-log',
  'zyro-shop-settings',
  'zyro-shop-discounts',
])
const cloudManifestRef = db.collection('appData').doc('manifest')
const cloudChunksRef = db.collection('appDataChunks')
const cloudChunkSize = 700 * 1024
const cloudChunkId = (key, index) => `${key}_${String(index).padStart(3, '0')}`
const financeReceiptBucketName = 'zyro-78855-finance-529526392508'
const financeReceiptObject = (entryId, receiptId) => admin.storage().bucket(financeReceiptBucketName)
  .file(`finance-receipts/${entryId}/${receiptId}`)
const getFinanceReceiptInput = (request) => {
  let fileName
  try {
    fileName = decodeURIComponent(String(request.get('x-zyro-receipt-name') || ''))
  } catch {
    throw new Error('Dateiname für den Beleg ungültig.')
  }
  return validateFinanceReceiptUpload({
    entryId: String(request.get('x-zyro-receipt-entry') || ''),
    fileName,
    contentType: String(request.get('content-type') || '').split(';')[0].trim().toLowerCase(),
    size: request.rawBody?.length || 0,
  })
}
const getFinanceReceiptObject = async (entryId, receiptId) => {
  if (typeof entryId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entryId)
    || typeof receiptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(receiptId)) {
    throw new Error('Beleg ungültig.')
  }
  const file = financeReceiptObject(entryId, receiptId)
  const [metadata] = await file.getMetadata()
  const customMetadata = metadata.metadata || {}
  if (customMetadata.entryId !== entryId || customMetadata.receiptId !== receiptId) {
    throw new Error('Beleg nicht gefunden.')
  }
  const contentType = String(metadata.contentType || '')
  const receipt = {
    id: receiptId,
    fileName: String(customMetadata.fileName || 'beleg'),
    contentType,
    size: Number(metadata.size),
  }
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(contentType)
    || receipt.size > maxFinanceReceiptBytes) {
    throw new Error('Gespeicherter Beleg ist ungültig.')
  }
  validateFinanceReceiptMetadata([{
    ...receipt,
    uploadedAt: String(customMetadata.uploadedAt || ''),
  }])
  return { file, receipt }
}
const saveFinanceReceipt = async (request, actor) => {
  const receipt = getFinanceReceiptInput(request)
  const data = validateFinanceReceiptContent(receipt.contentType, request.rawBody)
  const id = crypto.randomUUID()
  await financeReceiptObject(receipt.entryId, id).save(data, {
    resumable: false,
    validation: 'md5',
    metadata: {
      contentType: receipt.contentType,
      cacheControl: 'private, no-store',
      metadata: {
        entryId: receipt.entryId,
        receiptId: id,
        fileName: receipt.fileName,
        uploadedBy: String(actor.id),
        uploadedAt: new Date().toISOString(),
      },
    },
  })
  return { id, fileName: receipt.fileName, contentType: receipt.contentType, size: data.length, uploadedAt: new Date().toISOString() }
}
const loadFinanceReceipt = async (entryId, receiptId) => {
  const { file, receipt } = await getFinanceReceiptObject(entryId, receiptId)
  const [data] = await file.download({ validation: 'md5' })
  if (data.length > maxFinanceReceiptBytes) throw new Error('Gespeicherter Beleg ist zu groß.')
  return {
    receipt: { ...receipt, size: data.length },
    data,
  }
}
const deleteFinanceReceipt = async (entryId, receiptId) => {
  const { file, receipt } = await getFinanceReceiptObject(entryId, receiptId)
  await file.delete()
  return receipt
}
const webAppDataKeys = new Set([...cloudDataKeys].filter((key) => !['zyro-users', 'zyro-activation-keys'].includes(key)))
const webAppWritableKeys = new Set([...webAppDataKeys].filter((key) => key !== 'zyro-audit-log'))
const webAppPermissions = {
  'zyro-products': ['produkte', 'mde'],
  'zyro-recipes': 'rezepturen',
  'zyro-lab-tests': 'rezepturen',
  'zyro-orders': 'bestellungen',
  'zyro-sales-documents': ['verkauf', 'mde', 'versand'],
  'zyro-suppliers': 'einkauf',
  'zyro-purchase-orders': 'einkauf',
  'zyro-finance-entries': 'finanzen',
  'zyro-payment-requests': 'zahlungen',
  'zyro-cost-calculations': 'kalkulation',
  'zyro-website-orders': 'bestellungen',
  'zyro-customers': 'kunden',
  'zyro-sales-target': 'analyse',
  'zyro-inventory': 'lager',
  'zyro-stock-movements': ['lager', 'mde'],
  'zyro-reports': 'dokumente',
  'zyro-machinebau': 'maschinenbau',
  'zyro-archive-documents': 'dokumente',
  'zyro-delete-requests': 'tickets',
}
const defaultWebAppPermissions = [
  'dashboard', 'tickets', 'telefon', 'dokumente', 'etiketten', 'produkte', 'rezepturen',
  'bestellungen', 'verkauf', 'kunden', 'analyse', 'lager', 'mde', 'versand', 'chargen', 'zahlungen', 'einkauf',
  'maschinenbau',
]
const webAppLoginRateLimit = async (request, username) => {
  const id = crypto.createHash('sha256').update(`${getClientRateLimitId(request)}:${username.toLowerCase()}`).digest('hex')
  const ref = db.collection('webAppLoginRateLimits').doc(id)
  const now = Date.now()
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const previous = snapshot.exists ? snapshot.data() : {}
    const activeWindow = Number(previous.windowStart || 0) > now - 15 * 60 * 1000
    const count = activeWindow ? Number(previous.count || 0) : 0
    if (count >= 10) throw new Error('Zu viele Anmeldeversuche. Bitte später erneut versuchen.')
    transaction.set(ref, { windowStart: activeWindow ? previous.windowStart : now, count: count + 1 })
  })
}

const readCloudAppData = async (key) => {
  const manifest = (await cloudManifestRef.get()).data()?.keys || {}
  const entry = manifest[key]
  if (!entry) return { revision: 0, value: null }
  const refs = Array.from({ length: entry.chunkCount }, (_, index) => cloudChunksRef.doc(cloudChunkId(key, index)))
  const snapshots = await db.getAll(...refs)
  const encoded = snapshots.map((snapshot) => snapshot.data()?.data || '').join('')
  const value = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'))
  return { revision: Number(entry.revision) || 0, value }
}

const publicWebAppUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role,
  permissions: user.role === 'admin' ? [] : Array.isArray(user.permissions) ? user.permissions : defaultWebAppPermissions,
  email: user.email || '',
  phone: user.phone || '',
  address: user.address || '',
  avatarDataUrl: user.avatarDataUrl || '',
})

const verifyWebAppPassword = (password, passwordHash) => {
  const [salt, expectedHash] = String(passwordHash || '').split(':')
  if (!salt || !expectedHash) return false
  const expected = Buffer.from(expectedHash, 'hex')
  const actual = crypto.scryptSync(password, salt, 64)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

const getWebAppActor = async (request) => {
  const authorization = String(request.get('authorization') || '')
  const sessionToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) throw new Error('Anmeldung erforderlich.')
  const sessionId = crypto.createHash('sha256').update(sessionToken).digest('hex')
  const sessionSnapshot = await db.collection('webAppSessions').doc(sessionId).get()
  const session = sessionSnapshot.data()
  if (!session || !session.expiresAt || session.expiresAt.toMillis() <= Date.now()) {
    throw new Error('Anmeldung abgelaufen. Bitte erneut anmelden.')
  }
  const { value: users } = await readCloudAppData('zyro-users')
  const actor = (Array.isArray(users) ? users : []).find((user) => String(user.id) === String(session.userId))
  if (!actor) throw new Error('Benutzerkonto nicht gefunden. Bitte erneut anmelden.')
  return actor
}

const webCallPresenceRef = db.collection('webAppCallPresence')
const webCallInboxRef = db.collection('webAppCallInboxes')
const webCallIdPattern = /^[A-Za-z0-9_-]{1,128}$/
const webCallClientIdPattern = /^[A-Fa-f0-9-]{36}$/
const webCallMessageLimit = 64 * 1024

const enqueueWebCallEvent = (transaction, userId, message) => {
  const ref = webCallInboxRef.doc(String(userId)).collection('messages').doc()
  transaction.set(ref, {
    message,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

const updateWebCallPresence = async (actor, clientId) => {
  if (!webCallClientIdPattern.test(clientId)) throw new Error('Telefonverbindung ungültig.')
  const ref = webCallPresenceRef.doc(String(actor.id))
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const previous = snapshot.data()
    const isRecent = previous?.seenAt?.toMillis?.() > Date.now() - 15 * 1000
    if (isRecent && previous.clientId !== clientId) throw new Error('Dieses Benutzerkonto ist bereits im Telefon angemeldet.')
    transaction.set(ref, {
      clientId,
      name: actor.name,
      role: actor.role,
      seenAt: admin.firestore.Timestamp.now(),
      activeCallId: isRecent ? previous.activeCallId || '' : '',
    })
  })
}

const getWebCallUsers = async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 15 * 1000)
  const [presenceSnapshot, userData] = await Promise.all([
    webCallPresenceRef.where('seenAt', '>=', cutoff).get(),
    readCloudAppData('zyro-users'),
  ])
  const users = new Map((Array.isArray(userData.value) ? userData.value : []).map((user) => [String(user.id), user]))
  return presenceSnapshot.docs
    .map((presence) => users.get(presence.id))
    .filter(Boolean)
    .map(({ id, name, role }) => ({ id: String(id), name, role }))
}

const clearWebCallPresence = (transaction, userId) => {
  const ref = webCallPresenceRef.doc(String(userId))
  transaction.set(ref, { activeCallId: '', seenAt: admin.firestore.Timestamp.now() }, { merge: true })
}

exports.webAppCalls = onRequest({
  region,
  invoker: 'public',
  cors: false,
  maxInstances: 10,
  timeoutSeconds: 30,
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Telefonzugriff nicht zulässig.' })

  try {
    const actor = await getWebAppActor(request)
    const action = String(request.body?.action || '')
    const clientId = String(request.body?.clientId || '')
    if (!webCallClientIdPattern.test(clientId)) return response.status(400).json({ error: 'Telefonverbindung ungültig.' })
    const actorId = String(actor.id)
    const presenceRef = webCallPresenceRef.doc(actorId)
    const presenceSnapshot = await presenceRef.get()
    if (!presenceSnapshot.exists || presenceSnapshot.data().clientId !== clientId) {
      if (action !== 'connect') return response.status(409).json({ error: 'Telefonverbindung wurde ersetzt. Bitte erneut verbinden.' })
    }

    if (action === 'connect') {
      await updateWebCallPresence(actor, clientId)
      return response.json({ users: await getWebCallUsers() })
    }

    if (action === 'poll') {
      await db.runTransaction(async (transaction) => {
        const currentPresence = await transaction.get(presenceRef)
        if (!currentPresence.exists || currentPresence.data().clientId !== clientId) {
          throw new Error('Telefonverbindung wurde ersetzt. Bitte erneut verbinden.')
        }
        transaction.set(presenceRef, { seenAt: admin.firestore.Timestamp.now() }, { merge: true })
      })
      const inboxRef = webCallInboxRef.doc(actorId).collection('messages')
      const messages = await inboxRef.orderBy('createdAt').limit(100).get()
      if (!messages.empty) {
        const batch = db.batch()
        messages.docs.forEach((message) => batch.delete(message.ref))
        await batch.commit()
      }
      return response.json({
        users: await getWebCallUsers(),
        messages: messages.docs.map((message) => message.data().message).filter(Boolean),
      })
    }

    if (action === 'disconnect') {
      const presence = presenceSnapshot.data()
      const activeCallId = String(presence?.activeCallId || '')
      await db.runTransaction(async (transaction) => {
        const currentPresence = await transaction.get(presenceRef)
        if (!currentPresence.exists || currentPresence.data().clientId !== clientId) return
        const callRef = activeCallId ? db.collection('webAppCalls').doc(activeCallId) : null
        const callSnapshot = callRef ? await transaction.get(callRef) : null
        const call = callSnapshot?.data()
        const otherId = call && (call.callerId === actorId ? call.targetId : call.callerId)
        if (otherId) await transaction.get(webCallPresenceRef.doc(String(otherId)))
        transaction.delete(presenceRef)
        if (!callRef || !callSnapshot?.exists || !['ringing', 'active'].includes(call.status)) return
        transaction.update(callRef, { status: 'ended', endedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueWebCallEvent(transaction, otherId, { type: 'call:ended', callId: activeCallId, reason: 'Verbindung getrennt.' })
        clearWebCallPresence(transaction, otherId)
      })
      return response.json({ disconnected: true })
    }

    if (action !== 'send') return response.status(400).json({ error: 'Telefonaktion ungültig.' })
    const message = request.body?.message
    const encodedMessage = JSON.stringify(message)
    if (!message || typeof message !== 'object' || Buffer.byteLength(encodedMessage) > webCallMessageLimit) {
      return response.status(400).json({ error: 'Telefonnachricht ungültig oder zu groß.' })
    }
    const callId = String(message.callId || '')
    if (!webCallIdPattern.test(callId)) return response.status(400).json({ error: 'Anrufkennung ungültig.' })
    const callRef = db.collection('webAppCalls').doc(callId)
    const targetId = String(message.targetUserId || '')

    if (message.type === 'call:invite') {
      if (!targetId || targetId === actorId) return response.status(400).json({ error: 'Anrufziel ungültig.' })
      const { value: cloudUsers } = await readCloudAppData('zyro-users')
      const target = (Array.isArray(cloudUsers) ? cloudUsers : []).find((user) => String(user.id) === targetId)
      if (!target) return response.status(404).json({ error: 'Benutzerkonto nicht gefunden.' })
      const targetPresenceRef = webCallPresenceRef.doc(targetId)
      const result = await db.runTransaction(async (transaction) => {
        const [callerPresence, targetPresence, existingCall] = await Promise.all([
          transaction.get(presenceRef),
          transaction.get(targetPresenceRef),
          transaction.get(callRef),
        ])
        if (existingCall.exists) return { error: 'Anrufkennung wird bereits verwendet.' }
        const now = Date.now()
        if (!callerPresence.exists || callerPresence.data().clientId !== clientId
          || callerPresence.data().activeCallId
          || !targetPresence.exists || !targetPresence.data().seenAt
          || targetPresence.data().seenAt.toMillis() < now - 15 * 1000
          || targetPresence.data().activeCallId) {
          return { error: 'Benutzer ist nicht verfügbar oder bereits in einem Gespräch.' }
        }
        transaction.create(callRef, {
          callerId: actorId,
          targetId,
          status: 'ringing',
          videoEnabled: Boolean(message.videoEnabled),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromMillis(now + 2 * 60 * 60 * 1000),
        })
        transaction.set(presenceRef, { activeCallId: callId }, { merge: true })
        transaction.set(targetPresenceRef, { activeCallId: callId }, { merge: true })
        enqueueWebCallEvent(transaction, targetId, {
          type: 'call:incoming',
          callId,
          caller: { id: actorId, name: actor.name },
          videoEnabled: Boolean(message.videoEnabled),
        })
        enqueueWebCallEvent(transaction, actorId, { type: 'call:ringing', callId, targetId })
        return { sent: true }
      })
      if (result.error) return response.json({ message: { type: 'call:unavailable', callId, message: result.error } })
      return response.json({ sent: true })
    }

    const result = await db.runTransaction(async (transaction) => {
      const callSnapshot = await transaction.get(callRef)
      if (!callSnapshot.exists) return { error: 'Anruf nicht gefunden.' }
      const call = callSnapshot.data()
      if (call.callerId !== actorId && call.targetId !== actorId) return { error: 'Kein Zugriff auf diesen Anruf.' }
      if (!['ringing', 'active'].includes(call.status)) return { error: 'Anruf wurde bereits beendet.' }
      const otherId = call.callerId === actorId ? call.targetId : call.callerId
      await Promise.all([
        transaction.get(presenceRef),
        transaction.get(webCallPresenceRef.doc(String(otherId))),
      ])

      if (message.type === 'call:accept' && call.targetId === actorId && call.status === 'ringing') {
        transaction.update(callRef, { status: 'active', acceptedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueWebCallEvent(transaction, call.callerId, { type: 'call:accepted', callId, targetId: actorId })
        enqueueWebCallEvent(transaction, actorId, { type: 'call:accepted', callId, targetId: actorId })
      } else if (message.type === 'call:reject' && call.targetId === actorId) {
        transaction.update(callRef, { status: 'rejected', endedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueWebCallEvent(transaction, call.callerId, { type: 'call:rejected', callId, reason: 'Anruf abgelehnt.' })
        clearWebCallPresence(transaction, call.callerId)
        clearWebCallPresence(transaction, actorId)
      } else if (message.type === 'call:signal' && message.data && call.status === 'active') {
        enqueueWebCallEvent(transaction, otherId, { type: 'call:signal', callId, data: message.data })
      } else if (message.type === 'call:end') {
        transaction.update(callRef, { status: 'ended', endedAt: admin.firestore.FieldValue.serverTimestamp() })
        enqueueWebCallEvent(transaction, otherId, { type: 'call:ended', callId, reason: 'Anruf beendet.' })
        clearWebCallPresence(transaction, actorId)
        clearWebCallPresence(transaction, otherId)
      } else {
        return { error: 'Telefonaktion für diesen Anruf nicht zulässig.' }
      }
      return { sent: true }
    })
    if (result.error) return response.status(409).json({ error: result.error })
    return response.json({ sent: true })
  } catch (error) {
    const status = error.message.includes('Anmeldung') || error.message.includes('Benutzerkonto') ? 401
      : error.message.includes('bereits im Telefon') || error.message.includes('Telefonverbindung wurde ersetzt') ? 409
        : 400
    console.error('Cloud-Telefon fehlgeschlagen:', error.message)
    return response.status(status).json({ error: error.message || 'Telefonanfrage fehlgeschlagen.' })
  }
})

const webAppRecordId = (key, record) => key === 'zyro-inventory' ? record?.item : record?.id

const validateWebAppWrite = (key, currentValue, nextValue, actor) => {
  if (!webAppWritableKeys.has(key) || !Array.isArray(nextValue)) throw new Error('Datensatz ungültig oder schreibgeschützt.')
  if (key === 'zyro-sales-target') {
    const permissions = Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions
    if (actor.role !== 'admin' && !permissions.includes('analyse')) throw new Error('Du hast keine Berechtigung, das Absatzziel zu ändern.')
    if (nextValue.length !== 1 || nextValue[0]?.id !== 'global'
      || !Number.isSafeInteger(nextValue[0]?.targetBottles)
      || nextValue[0].targetBottles < 0 || nextValue[0].targetBottles > 1000000000) {
      throw new Error('Das Absatzziel muss eine ganze Zahl zwischen 0 und 1.000.000.000 sein.')
    }
    return
  }
  if (key === 'zyro-elster-setup') {
    validateElsterSetupEntries(currentValue, nextValue, actor)
    return
  }
  if (key === 'zyro-company-details') {
    validateCompanyDetailsEntries(nextValue, actor)
    return
  }
  if (key === 'zyro-bottler-details') {
    validateBottlerDetailsEntries(nextValue, actor)
    return
  }
  if (key === 'zyro-finance-entries') {
    validateFinanceEntries(currentValue, nextValue, actor)
    return
  }
  if (key === 'zyro-suppliers') {
    validateSuppliers(currentValue, nextValue, actor)
    return
  }
  if (key === 'zyro-purchase-orders') {
    validatePurchaseOrders(currentValue, nextValue, actor)
    return
  }
  if (key === 'zyro-payment-settings') {
    if (actor.role !== 'admin') throw new Error('Das Zahlungskonto darf nur von einem Admin verwaltet werden.')
    validatePaymentSettings(nextValue)
    return nextValue
  }
  if (key === 'zyro-payment-requests') {
    return validatePaymentRequestUpdate(currentValue, nextValue, actor)
  }
  if (key === 'zyro-lab-tests') {
    const permissions = Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions
    if (actor.role !== 'admin' && !permissions.includes('rezepturen')) {
      throw new Error('Du hast keine Rezeptur-Berechtigung.')
    }
    return validateLabTestsUpdate(currentValue, nextValue, actor)
  }
  const requiredPermissions = Array.isArray(webAppPermissions[key]) ? webAppPermissions[key] : [webAppPermissions[key]]
  if (actor.role !== 'admin' && !requiredPermissions.some((permission) => (Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions).includes(permission))) {
    throw new Error('Du hast keine Berechtigung, diesen Bereich zu ändern.')
  }
  const current = Array.isArray(currentValue) ? currentValue : []
  const nextById = new Map(nextValue.map((record) => [String(webAppRecordId(key, record)), record]))
  const currentById = new Map(current.map((record) => [String(webAppRecordId(key, record)), record]))
  const actorPermissions = Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions
  if (actor.role !== 'admin' && current.some((record) => !nextById.has(String(webAppRecordId(key, record))))) {
    throw new Error('Datensätze dürfen nur von einem Admin gelöscht werden. Bitte eine Löschanfrage erstellen.')
  }

  if (actor.role !== 'admin' && actorPermissions.includes('mde') && key === 'zyro-products' && !actorPermissions.includes('produkte')) {
    if (nextValue.length !== current.length || current.some((product) => !nextById.has(String(product.id)))) {
      throw new Error('MDE-Benutzer dürfen keine Produkte anlegen oder entfernen.')
    }
    for (const product of nextValue) {
      const previous = currentById.get(String(product.id))
      const { availableBottles: _previousStock, ...previousDetails } = previous
      const { availableBottles, ...nextDetails } = product
      if (JSON.stringify(previousDetails) !== JSON.stringify(nextDetails)
        || !Number.isSafeInteger(availableBottles) || availableBottles < 0) {
        throw new Error('MDE-Benutzer dürfen nur einen gültigen Dosenbestand aktualisieren.')
      }
    }
  }

  if (actor.role !== 'admin' && actorPermissions.includes('mde') && key === 'zyro-sales-documents' && !actorPermissions.includes('verkauf')) {
    if (JSON.stringify(current) !== JSON.stringify(nextValue)) {
      throw new Error('MDE-Aufträge dürfen nur über die geprüfte Scanner-Cloudbuchung geändert werden.')
    }
  }

  if (actor.role !== 'admin' && actorPermissions.includes('versand')
    && !actorPermissions.includes('verkauf') && !actorPermissions.includes('mde') && !actorPermissions.includes('lager')
    && key === 'zyro-sales-documents' && JSON.stringify(current) !== JSON.stringify(nextValue)) {
    throw new Error('Versanddaten dürfen nur über die geprüfte Versand-Cloudbuchung geändert werden.')
  }

  if (actor.role !== 'admin' && key === 'zyro-stock-movements' && JSON.stringify(current) !== JSON.stringify(nextValue)) {
    throw new Error('Lagerbewegungen dürfen nur über eine geprüfte MDE-Cloudbuchung erstellt werden.')
  }

  if (actor.role !== 'admin' && actorPermissions.includes('mde') && key === 'zyro-products' && !actorPermissions.includes('produkte')
    && JSON.stringify(current) !== JSON.stringify(nextValue)) {
    throw new Error('MDE-Bestände dürfen nur über eine geprüfte Scanner-Cloudbuchung geändert werden.')
  }

  if (key === 'zyro-delete-requests') {
    for (const ticket of nextValue) {
      const previous = currentById.get(String(ticket.id))
      const oldMessages = Array.isArray(previous?.messages) ? previous.messages : []
      const messages = Array.isArray(ticket.messages) ? ticket.messages : []
      if (messages.length < oldMessages.length || !oldMessages.every((message, index) => JSON.stringify(message) === JSON.stringify(messages[index]))) {
        throw new Error('Vorhandene Ticketnachrichten dürfen nicht geändert oder entfernt werden.')
      }
      const details = ({ messages: _messages, ...rest }) => rest
      const detailsChanged = previous && JSON.stringify(details(previous)) !== JSON.stringify(details(ticket))
      if (detailsChanged && actor.role !== 'admin') {
        const { status: oldStatus, ...oldDetails } = previous || {}
        const { status: nextStatus, ...nextDetails } = ticket
        const canReopen = previous
          && ['freigegeben', 'abgelehnt', 'erledigt', 'in_bearbeitung', 'wartend'].includes(oldStatus)
          && nextStatus === 'offen'
          && (String(previous.requestedById) === String(actor.id) || String(previous.assignedToId || '') === String(actor.id))
          && JSON.stringify(oldDetails) === JSON.stringify(nextDetails)
          && messages.length > oldMessages.length
        if (!canReopen) throw new Error('Ticketstatus und Freigaben dürfen nur Admins ändern.')
      }
      if (!previous && (ticket.status !== 'offen' || !ticket.reason || !ticket.type || !ticket.targetName
        || String(ticket.requestedById) !== String(actor.id) || ticket.requestedBy !== actor.name || messages.length === 0)) {
        throw new Error('Neue Anfragen müssen vollständig und offen eingereicht werden.')
      }
      if (messages.slice(oldMessages.length).some((message) => !message.id
        || String(message.byId) !== String(actor.id)
        || message.by !== actor.name
        || message.role !== actor.role
        || typeof message.text !== 'string'
        || !message.text.trim()
        || message.text.length > 10000
        || Number.isNaN(Date.parse(message.createdAt)))) {
        throw new Error('Neue Ticketnachrichten müssen gültig sein und vom angemeldeten Benutzer stammen.')
      }
    }
  }

  if (key === 'zyro-sales-documents') {
    const allowedStatusChanges = {
      Entwurf: new Set(['Versendet', 'Storniert']),
      Versendet: new Set(['Bezahlt', 'Überfällig', 'Storniert']),
      Überfällig: new Set(['Bezahlt', 'Storniert']),
      Bezahlt: new Set(['Storniert']),
      Storniert: new Set(),
    }
    const invoiceNumbers = new Set()
    for (const invoice of nextValue.filter((record) => record.kind === 'rechnung')) {
      const number = String(invoice.number || '').trim()
      if (!number || invoiceNumbers.has(number)) throw new Error('Jede Rechnung benötigt eine eindeutige Rechnungsnummer.')
      invoiceNumbers.add(number)
      const previous = currentById.get(String(invoice.id))
      if ((!previous || previous.kind !== 'rechnung') && invoice.status !== 'Entwurf') {
        throw new Error('Neue Rechnungen müssen zuerst als Entwurf gespeichert werden.')
      }
      if (previous && previous.status !== 'Entwurf') {
        const oldFields = { ...previous }
        const nextFields = { ...invoice }
        delete oldFields.status
        delete nextFields.status
        delete oldFields.emailedAt
        delete nextFields.emailedAt
        delete oldFields.portalPublishedAt
        delete nextFields.portalPublishedAt
        if (JSON.stringify(oldFields) !== JSON.stringify(nextFields)) throw new Error('Ausgestellte Rechnungen dürfen nicht geändert werden.')
        if (invoice.status !== previous.status && !allowedStatusChanges[previous.status]?.has(invoice.status)) {
          throw new Error('Dieser Rechnungsstatuswechsel ist nicht zulässig.')
        }
      }
    }
    for (const invoice of current.filter((record) => record.kind === 'rechnung' && record.status !== 'Entwurf')) {
      if (!nextById.has(String(invoice.id)) && actor.role !== 'admin') {
        throw new Error(`Ausgestellte Rechnung ${invoice.number || ''} darf nur von einem Admin gelöscht werden.`)
      }
    }
  }
}

const buildWebAppAuditEntries = (key, previousValue, nextValue, actor, existingEntries) => {
  const recordId = (record) => String(key === 'zyro-inventory' ? record?.item : record?.id)
  const label = (record) => String(record?.name || record?.number || record?.subject || record?.item || record?.targetName || record?.product || record?.id || 'Datensatz').slice(0, 160)
  const previous = new Map((Array.isArray(previousValue) ? previousValue : []).map((record) => [recordId(record), record]))
  const next = new Map(nextValue.map((record) => [recordId(record), record]))
  const timestamp = new Date().toISOString()
  const additions = []
  for (const [id, record] of previous) {
    const updated = next.get(id)
    if (!updated) {
      additions.push({
        id: crypto.randomUUID(), timestamp, userId: String(actor.id), userName: actor.name, role: actor.role,
        collection: key, action: 'gelöscht', recordId: id, label: label(record),
        ...(key === 'zyro-sales-documents' ? { beforeRecord: record, afterRecord: null } : {}),
      })
    } else if (JSON.stringify(record) !== JSON.stringify(updated)) {
      additions.push({
        id: crypto.randomUUID(), timestamp, userId: String(actor.id), userName: actor.name, role: actor.role,
        collection: key, action: 'geändert', recordId: id, label: label(updated),
        ...(key === 'zyro-sales-documents' ? { beforeRecord: record, afterRecord: updated } : {}),
      })
    }
  }
  for (const [id, record] of next) {
    if (!previous.has(id)) {
      additions.push({
        id: crypto.randomUUID(), timestamp, userId: String(actor.id), userName: actor.name, role: actor.role,
        collection: key, action: 'erstellt', recordId: id, label: label(record),
        ...(key === 'zyro-sales-documents' ? { beforeRecord: null, afterRecord: record } : {}),
      })
    }
  }
  return [...(Array.isArray(existingEntries) ? existingEntries : []), ...additions]
}

const cloudPutWebAppData = async (key, value, baseRevision, actor) => {
  if (!Array.isArray(value)) {
    const error = new Error(`Gemeinsamer Datensatz „${key}“ muss als Liste gespeichert werden.`)
    error.code = 'INVALID_SHARED_DATA'
    throw error
  }
  return db.runTransaction(async (transaction) => {
    const manifestSnapshot = await transaction.get(cloudManifestRef)
    const manifest = manifestSnapshot.data() || {}
    const entry = manifest.keys?.[key]
    const revision = Number(entry?.revision) || 0
    if (revision !== baseRevision) return { conflict: true, revision }
    const refs = Array.from({ length: entry?.chunkCount || 0 }, (_, index) => cloudChunksRef.doc(cloudChunkId(key, index)))
    const auditEntry = manifest.keys?.['zyro-audit-log']
    const auditRefs = Array.from({ length: auditEntry?.chunkCount || 0 }, (_, index) => cloudChunksRef.doc(cloudChunkId('zyro-audit-log', index)))
    const snapshots = refs.length ? await transaction.getAll(...refs) : []
    const auditSnapshots = auditRefs.length ? await transaction.getAll(...auditRefs) : []
    const previousEncoded = snapshots.map((snapshot) => snapshot.data()?.data || '').join('')
    const currentValue = previousEncoded
      ? JSON.parse(zlib.gunzipSync(Buffer.from(previousEncoded, 'base64')).toString('utf8'))
      : null
    const storedValue = validateWebAppWrite(key, currentValue, value, actor) || value
    const serialized = JSON.stringify(storedValue)
    if (serialized.length > 8 * 1024 * 1024) throw new Error('Daten sind zu groß.')
    const compressed = zlib.gzipSync(Buffer.from(serialized, 'utf8')).toString('base64')
    const chunks = []
    for (let offset = 0; offset < compressed.length; offset += cloudChunkSize) chunks.push(compressed.slice(offset, offset + cloudChunkSize))
    if (chunks.length === 0) chunks.push('')
    const auditEncoded = auditSnapshots.map((snapshot) => snapshot.data()?.data || '').join('')
    const previousAudit = auditEncoded
      ? JSON.parse(zlib.gunzipSync(Buffer.from(auditEncoded, 'base64')).toString('utf8'))
      : []
    const nextAudit = buildWebAppAuditEntries(key, currentValue, storedValue, actor, previousAudit)
    const auditChanged = nextAudit.length !== (Array.isArray(previousAudit) ? previousAudit.length : 0)
    chunks.forEach((chunk, index) => transaction.set(cloudChunksRef.doc(cloudChunkId(key, index)), { data: chunk }))
    for (let index = chunks.length; index < (entry?.chunkCount || 0); index += 1) {
      transaction.delete(cloudChunksRef.doc(cloudChunkId(key, index)))
    }
    const nextRevision = revision + 1
    const nextKeys = {
      ...(manifest.keys || {}),
      [key]: { revision: nextRevision, chunkCount: chunks.length, size: compressed.length, updatedAt: Date.now() },
    }
    if (auditChanged) {
      const auditCompressed = zlib.gzipSync(Buffer.from(JSON.stringify(nextAudit), 'utf8')).toString('base64')
      const auditChunks = []
      for (let offset = 0; offset < auditCompressed.length; offset += cloudChunkSize) {
        auditChunks.push(auditCompressed.slice(offset, offset + cloudChunkSize))
      }
      if (auditChunks.length === 0) auditChunks.push('')
      auditChunks.forEach((chunk, index) => transaction.set(cloudChunksRef.doc(cloudChunkId('zyro-audit-log', index)), { data: chunk }))
      for (let index = auditChunks.length; index < (auditEntry?.chunkCount || 0); index += 1) {
        transaction.delete(cloudChunksRef.doc(cloudChunkId('zyro-audit-log', index)))
      }
      nextKeys['zyro-audit-log'] = {
        revision: (Number(auditEntry?.revision) || 0) + 1,
        chunkCount: auditChunks.length,
        size: auditCompressed.length,
        updatedAt: Date.now(),
      }
    }
    transaction.set(cloudManifestRef, {
      keys: nextKeys,
    })
    return { revision: nextRevision }
  })
}

exports.cloudData = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 60,
  memory: '512MiB',
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  const action = String(request.body?.action || request.get('x-zyro-action') || '')
  const key = String(request.body?.key || '')
  try {
    if (action === 'receipt-upload') {
      const receipt = await saveFinanceReceipt(request, { id: 'desktop-cloud-sync' })
      return response.json({ receipt })
    }
    if (action === 'receipt-get') {
      const { entryId, receiptId } = request.body || {}
      const result = await loadFinanceReceipt(String(entryId || ''), String(receiptId || ''))
      return response.json({ receipt: result.receipt, data: result.data.toString('base64') })
    }
    if (action === 'receipt-delete') {
      const { entryId, receiptId } = request.body || {}
      const receipt = await deleteFinanceReceipt(String(entryId || ''), String(receiptId || ''))
      return response.json({ receipt })
    }
    if (action === 'manifest') {
      const snapshot = await cloudManifestRef.get()
      const keys = snapshot.data()?.keys || {}
      return response.json({
        keys: Object.fromEntries(Object.entries(keys).map(([name, entry]) => [name, { revision: Number(entry.revision) || 0 }])),
      })
    }
    if (!cloudDataKeys.has(key)) return response.status(400).json({ error: 'Datenbereich ungültig.' })

    if (action === 'get') {
      const result = await db.runTransaction(async (transaction) => {
        const entry = (await transaction.get(cloudManifestRef)).data()?.keys?.[key]
        if (!entry) return { revision: 0, data: null }
        const refs = Array.from({ length: entry.chunkCount }, (_, index) => cloudChunksRef.doc(cloudChunkId(key, index)))
        const chunks = await transaction.getAll(...refs)
        return { revision: entry.revision, data: chunks.map((chunk) => chunk.data()?.data || '').join('') }
      })
      return response.json(result)
    }

    if (action === 'put') {
      const data = request.body?.data
      const baseRevision = Number(request.body?.baseRevision)
      if (typeof data !== 'string' || data.length > 8 * 1024 * 1024 || !Number.isInteger(baseRevision) || baseRevision < 0) {
        return response.status(400).json({ error: 'Daten ungültig oder zu groß.' })
      }
      const chunks = []
      for (let offset = 0; offset < data.length; offset += cloudChunkSize) chunks.push(data.slice(offset, offset + cloudChunkSize))
      if (chunks.length === 0) chunks.push('')
      const result = await db.runTransaction(async (transaction) => {
        const manifest = (await transaction.get(cloudManifestRef)).data() || {}
        const entry = manifest.keys?.[key]
        const currentRevision = Number(entry?.revision) || 0
        if (currentRevision !== baseRevision) return { conflict: true, revision: currentRevision }
        chunks.forEach((chunk, index) => transaction.set(cloudChunksRef.doc(cloudChunkId(key, index)), { data: chunk }))
        for (let index = chunks.length; index < (entry?.chunkCount || 0); index += 1) {
          transaction.delete(cloudChunksRef.doc(cloudChunkId(key, index)))
        }
        const revision = currentRevision + 1
        transaction.set(cloudManifestRef, {
          keys: { ...(manifest.keys || {}), [key]: { revision, chunkCount: chunks.length, size: data.length, updatedAt: Date.now() } },
        })
        return { revision }
      })
      if (result.conflict) return response.status(409).json({ error: 'Der Cloud-Stand hat sich geändert.', revision: result.revision })
      return response.json(result)
    }
    return response.status(400).json({ error: 'Aktion ungültig.' })
  } catch (error) {
    console.error('Cloud-Daten fehlgeschlagen:', error.message)
    return response.status(500).json({ error: 'Cloud-Daten konnten nicht verarbeitet werden.' })
  }
})

const mdeDataKeys = ['zyro-products', 'zyro-sales-documents', 'zyro-stock-movements', 'zyro-purchase-orders']
const mdeError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })

const runMdeCloudUpdate = async (keys, update) => db.runTransaction(async (transaction) => {
  const manifest = (await transaction.get(cloudManifestRef)).data() || {}
  const entries = manifest.keys || {}
  const refsByKey = Object.fromEntries(keys.map((key) => [
    key,
    Array.from({ length: Number(entries[key]?.chunkCount) || 0 }, (_, index) => cloudChunksRef.doc(cloudChunkId(key, index))),
  ]))
  const allRefs = keys.flatMap((key) => refsByKey[key])
  if (allRefs.length > 450) throw mdeError('Lagerdaten sind zu groß für eine sichere Cloud-Buchung.', 413)
  const snapshots = allRefs.length ? await transaction.getAll(...allRefs) : []
  let snapshotOffset = 0
  const values = {}
  for (const key of keys) {
    const refs = refsByKey[key]
    const keySnapshots = snapshots.slice(snapshotOffset, snapshotOffset + refs.length)
    snapshotOffset += refs.length
    if (!refs.length) {
      values[key] = []
      continue
    }
    const encoded = keySnapshots.map((snapshot) => snapshot.data()?.data || '').join('')
    try {
      values[key] = JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'))
    } catch (error) {
      throw mdeError(`Cloud-Daten für ${key} sind beschädigt: ${error.message}`, 500)
    }
    if (!Array.isArray(values[key])) throw mdeError(`Cloud-Daten für ${key} haben ein ungültiges Format.`, 500)
  }

  const result = update(values)
  const nextKeys = { ...entries }
  let writeCount = 1
  for (const key of keys) {
    const encoded = zlib.gzipSync(Buffer.from(JSON.stringify(values[key]), 'utf8')).toString('base64')
    const chunks = []
    for (let offset = 0; offset < encoded.length; offset += cloudChunkSize) chunks.push(encoded.slice(offset, offset + cloudChunkSize))
    if (chunks.length === 0) chunks.push('')
    writeCount += chunks.length + Math.max(0, (Number(entries[key]?.chunkCount) || 0) - chunks.length)
    if (writeCount > 450) throw mdeError('Lagerdaten sind zu groß für eine sichere Cloud-Buchung.', 413)
    chunks.forEach((chunk, index) => transaction.set(cloudChunksRef.doc(cloudChunkId(key, index)), { data: chunk }))
    for (let index = chunks.length; index < (Number(entries[key]?.chunkCount) || 0); index += 1) {
      transaction.delete(cloudChunksRef.doc(cloudChunkId(key, index)))
    }
    nextKeys[key] = {
      revision: (Number(entries[key]?.revision) || 0) + 1,
      chunkCount: chunks.length,
      size: encoded.length,
      updatedAt: Date.now(),
    }
  }
  transaction.set(cloudManifestRef, { keys: nextKeys })
  return result
})

const updatePackedNotification = async (orderId, transform) => runMdeCloudUpdate(['zyro-sales-documents'], ({ 'zyro-sales-documents': salesDocuments }) => {
  const document = salesDocuments.find((entry) => String(entry.id) === String(orderId))
  if (!document || document.kind !== 'kundenauftrag' || document.status !== 'Verpackt') {
    throw mdeError('Verpackter Kundenauftrag wurde in der Cloud nicht gefunden.', 404)
  }
  transform(document)
  return { salesDocuments, document }
})

const sendPackedOrderNotification = async (orderId) => {
  const claimed = await updatePackedNotification(orderId, (document) => {
    if (document.packedNotificationStatus === 'sent') return
    const previousAttempt = Date.parse(document.packedNotificationAttemptAt || '')
    if (document.packedNotificationStatus === 'sending' && Number.isFinite(previousAttempt) && Date.now() - previousAttempt < 10 * 60 * 1000) {
      throw mdeError('Die Kunden-E-Mail wird bereits verarbeitet. Bitte kurz warten.', 409)
    }
    if (!isValidEmailAddress(document.recipientEmail)) {
      throw mdeError('Im Kundenauftrag ist keine gültige Kunden-E-Mail-Adresse hinterlegt.', 400)
    }
    document.packedNotificationStatus = 'sending'
    document.packedNotificationAttemptAt = new Date().toISOString()
    document.packedNotificationError = ''
  })
  if (claimed.document.packedNotificationStatus === 'sent') {
    return { sent: true, salesDocuments: claimed.salesDocuments }
  }
  const document = claimed.document
  const items = Array.isArray(document.items) ? document.items : [{
    productName: document.productName || document.product || 'Artikel',
    quantity: document.quantity || 1,
  }]
  const rows = items.map((item) => `<li>${escapeEmailHtml(item.productName || item.description || 'Artikel')} · ${Number(item.quantity) || 0} Stück</li>`).join('')
  const orderNumber = escapeEmailHtml(document.number || document.id)
  try {
    await sendShopEmail({
      to: document.recipientEmail,
      subject: `Ihre Bestellung ${document.number || document.id} wurde verpackt · ZYRO`,
      text: `Guten Tag ${document.recipient || 'Kunde'},\n\nIhre Bestellung ${document.number || document.id} wurde verpackt und für den Versand vorbereitet.\n\nMit freundlichen Grüßen\nZYRO`,
      html: `<!doctype html><html lang="de"><body><h1>Ihre Bestellung ist verpackt</h1><p>Guten Tag ${escapeEmailHtml(document.recipient || 'Kunde')},</p><p>Ihre Bestellung <strong>${orderNumber}</strong> wurde verpackt und für den Versand vorbereitet.</p><ul>${rows}</ul><p>Mit freundlichen Grüßen<br>ZYRO</p></body></html>`,
    })
  } catch (error) {
    const failed = await updatePackedNotification(orderId, (current) => {
      current.packedNotificationStatus = 'failed'
      current.packedNotificationError = String(error.message || 'Mailversand fehlgeschlagen').slice(0, 500)
    })
    return {
      sent: false,
      error: error.message || 'Mailversand fehlgeschlagen.',
      salesDocuments: failed.salesDocuments,
    }
  }
  const updated = await updatePackedNotification(orderId, (current) => {
    current.packedNotificationStatus = 'sent'
    current.packedNotificationSentAt = new Date().toISOString()
    current.packedNotificationError = ''
  })
  return { sent: true, salesDocuments: updated.salesDocuments }
}

// Stellt die beim Verpacken erzeugte Rechnung im Kundenportal bereit und sendet sie per E-Mail (wiederholbar, ohne Doppelversand).
const deliverAutoInvoice = async (invoiceId, products) => {
  const outcome = { number: '', published: false, emailSent: false, error: '', salesDocuments: null }
  const setStatus = (patch) => runMdeCloudUpdate(['zyro-sales-documents'], ({ 'zyro-sales-documents': documents }) => {
    const invoice = documents.find((entry) => String(entry.id) === String(invoiceId))
    if (!invoice) throw mdeError('Rechnung wurde in der Cloud nicht gefunden.', 404)
    Object.assign(invoice, patch)
    return { salesDocuments: documents, invoice }
  })
  try {
    const current = await setStatus({})
    const invoice = current.invoice
    outcome.number = invoice.number
    outcome.salesDocuments = current.salesDocuments
    const email = normalizeCustomerEmail(invoice.recipientEmail)
    if (!email) {
      outcome.error = 'Keine gültige Kunden-E-Mail im Auftrag. Rechnung wurde erstellt, aber nicht gesendet.'
      outcome.salesDocuments = (await setStatus({ invoiceDeliveryError: outcome.error })).salesDocuments
      return outcome
    }
    const { value: savedCompanyDetails } = await readCloudAppData('zyro-company-details')
    const companyDetails = Array.isArray(savedCompanyDetails) && savedCompanyDetails.length
      ? validateCompanyDetailsEntries(savedCompanyDetails, { role: 'admin' })
      : defaultCompanyDetails
    const pdf = await buildInvoicePdf(invoice, Array.isArray(products) ? products : [], companyDetails)
    if (pdf.length <= 700 * 1024) {
      await db.collection('customerPortalInvoices').doc(`${customerEmailKey(email).slice(0, 24)}_${invoice.number}`).set({
        email,
        number: invoice.number,
        contentBase64: pdf.toString('base64'),
        publishedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      outcome.published = true
    }
    if (invoice.invoiceEmailSentAt) {
      outcome.emailSent = true
      return outcome
    }
    try {
      await sendShopEmail({
        to: email,
        subject: `Rechnung ${invoice.number} · ZYRO`,
        text: `Guten Tag ${invoice.recipient || ''},\n\nanbei erhalten Sie die Rechnung ${invoice.number} als PDF. Sie ist außerdem in Ihrem Kundenkonto abrufbar.\n\n${signatureText}`,
        html: `<p>Guten Tag ${escapeHtml(invoice.recipient || '')},</p><p>anbei erhalten Sie die Rechnung <strong>${escapeHtml(invoice.number)}</strong> als PDF. Sie ist außerdem in Ihrem Kundenkonto abrufbar.</p>${signatureHtml}`,
        attachment: { filename: `${invoice.number}.pdf`, content: pdf, contentType: 'application/pdf' },
      })
      outcome.emailSent = true
      outcome.salesDocuments = (await setStatus({
        status: 'Versendet',
        invoiceEmailSentAt: new Date().toISOString(),
        invoicePublishedAt: outcome.published ? new Date().toISOString() : '',
        invoiceDeliveryError: '',
      })).salesDocuments
    } catch (error) {
      outcome.error = 'Rechnung erstellt und im Kundenkonto bereitgestellt, aber die E-Mail konnte nicht gesendet werden.'
      console.error('Automatische Rechnungs-E-Mail fehlgeschlagen:', error.message)
      outcome.salesDocuments = (await setStatus({ invoiceDeliveryError: outcome.error })).salesDocuments
    }
  } catch (error) {
    console.error('Automatische Rechnung fehlgeschlagen:', error.message)
    outcome.error = error.message || 'Rechnung konnte nicht zugestellt werden.'
  }
  return outcome
}

const updateShipmentNotification = async (orderId, transform) => runMdeCloudUpdate(
  ['zyro-sales-documents'],
  ({ 'zyro-sales-documents': salesDocuments }) => {
    const document = salesDocuments.find((entry) => String(entry.id) === String(orderId))
    if (!document || document.kind !== 'kundenauftrag' || document.status !== 'Versendet') {
      throw mdeError('Versendeter Kundenauftrag wurde in der Cloud nicht gefunden.', 404)
    }
    transform(document)
    return { salesDocuments, document }
  },
)

const sendShippedOrderNotification = async (orderId) => {
  const claimed = await updateShipmentNotification(orderId, (document) => {
    if (document.shipmentNotificationStatus === 'sent') return
    const previousAttempt = Date.parse(document.shipmentNotificationAttemptAt || '')
    if (document.shipmentNotificationStatus === 'sending'
      && Number.isFinite(previousAttempt) && Date.now() - previousAttempt < 10 * 60 * 1000) {
      throw mdeError('Die Versand-E-Mail wird bereits verarbeitet. Bitte kurz warten.', 409)
    }
    if (!isValidEmailAddress(document.recipientEmail)) {
      throw mdeError('Im Kundenauftrag ist keine gültige Kunden-E-Mail-Adresse hinterlegt.', 400)
    }
    document.shipmentNotificationStatus = 'sending'
    document.shipmentNotificationAttemptAt = new Date().toISOString()
    document.shipmentNotificationError = ''
  })
  if (claimed.document.shipmentNotificationStatus === 'sent') {
    return { sent: true, salesDocuments: claimed.salesDocuments }
  }

  const document = claimed.document
  const orderNumber = document.number || document.id
  const trackingLink = `https://xn--zyro-getrnke-ocb.de/tracking/?token=${encodeURIComponent(document.trackingToken)}`
  const externalTrackingLink = document.trackingUrl
    || (document.carrier === 'DHL'
      ? `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${encodeURIComponent(document.trackingNumber)}`
      : document.carrier === 'DPD'
        ? `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(document.trackingNumber)}`
        : '')
  const escapedOrderNumber = escapeEmailHtml(orderNumber)
  const escapedCarrier = escapeEmailHtml(document.carrierName || document.carrier)
  const escapedTrackingNumber = escapeEmailHtml(document.trackingNumber)
  const escapedTrackingLink = escapeEmailHtml(trackingLink)
  const externalLinkMarkup = externalTrackingLink
    ? `<p><a href="${escapeEmailHtml(externalTrackingLink)}">Direkt beim Versanddienst verfolgen</a></p>`
    : ''
  try {
    await sendShopEmail({
      to: document.recipientEmail,
      subject: `Ihre Bestellung ${orderNumber} wurde versendet · ZYRO`,
      text: `Guten Tag ${document.recipient || 'Kunde'},\n\nIhre Bestellung ${orderNumber} wurde mit ${document.carrierName || document.carrier} versendet.\nSendungsnummer: ${document.trackingNumber}\n\nSendungsverfolgung: ${trackingLink}${externalTrackingLink ? `\nBeim Versanddienst verfolgen: ${externalTrackingLink}` : ''}\n\nMit freundlichen Grüßen\nZYRO`,
      html: `<!doctype html><html lang="de"><body><h1>Ihre Bestellung wurde versendet</h1><p>Guten Tag ${escapeEmailHtml(document.recipient || 'Kunde')},</p><p>Ihre Bestellung <strong>${escapedOrderNumber}</strong> wurde mit <strong>${escapedCarrier}</strong> versendet.</p><p>Sendungsnummer: <strong>${escapedTrackingNumber}</strong></p><p><a href="${escapedTrackingLink}">ZYRO-Sendungsverfolgung öffnen</a></p>${externalLinkMarkup}<p>Mit freundlichen Grüßen<br>ZYRO</p></body></html>`,
    })
  } catch (error) {
    const failed = await updateShipmentNotification(orderId, (current) => {
      current.shipmentNotificationStatus = 'failed'
      current.shipmentNotificationError = String(error.message || 'Mailversand fehlgeschlagen.').slice(0, 500)
    })
    return {
      sent: false,
      error: error.message || 'Mailversand fehlgeschlagen.',
      salesDocuments: failed.salesDocuments,
    }
  }
  const updated = await updateShipmentNotification(orderId, (current) => {
    current.shipmentNotificationStatus = 'sent'
    current.shipmentNotificationSentAt = new Date().toISOString()
    current.shipmentNotificationError = ''
  })
  return { sent: true, salesDocuments: updated.salesDocuments }
}

const escapeEmailHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]))

const updateDeliveryReviewState = (orderId, transform) => runMdeCloudUpdate(
  ['zyro-sales-documents'],
  ({ 'zyro-sales-documents': salesDocuments }) => {
    const document = salesDocuments.find((entry) => String(entry.id) === String(orderId))
    if (!document || document.kind !== 'kundenauftrag' || document.status !== 'Versendet') {
      throw mdeError('Versendeter Kundenauftrag wurde in der Cloud nicht gefunden.', 404)
    }
    transform(document)
    return { salesDocuments, document }
  },
)

const confirmOrderDelivery = async (orderId, source) => updateDeliveryReviewState(orderId, (document) => {
  const carrier = String(document.carrier || '').toUpperCase()
  if (source === 'DHL' && carrier !== 'DHL') throw mdeError('Automatische Zustellprüfung ist nur für DHL verfügbar.', 409)
  if (source === 'manual' && carrier === 'DHL') throw mdeError('DHL-Zustellungen werden automatisch geprüft.', 409)
  document.deliveryConfirmedAt ||= new Date().toISOString()
  document.deliveryConfirmationSource ||= source
})

const sendDeliveryReviewRequest = async (orderId, shopProducts) => {
  let deliveryToken = ''
  const claimed = await updateDeliveryReviewState(orderId, (document) => {
    if (['sent', 'submitted', 'skipped'].includes(document.reviewRequestStatus)) return
    const previousAttempt = Date.parse(document.reviewRequestAttemptAt || '')
    if (document.reviewRequestStatus === 'sending'
      && Number.isFinite(previousAttempt) && Date.now() - previousAttempt < 10 * 60 * 1000) {
      throw mdeError('Die Bewertungs-E-Mail wird bereits verarbeitet. Bitte kurz warten.', 409)
    }
    if (!document.deliveryConfirmedAt) throw mdeError('Die Zustellung wurde noch nicht bestätigt.', 409)
    if (!isValidEmailAddress(document.recipientEmail)) {
      document.reviewRequestStatus = 'failed'
      document.reviewRequestError = 'Im Kundenauftrag ist keine gültige Kunden-E-Mail-Adresse hinterlegt.'
      return
    }
    const reviewProducts = getReviewProducts(document, shopProducts)
    if (reviewProducts.length === 0) {
      document.reviewRequestStatus = 'skipped'
      document.reviewRequestError = 'Zu dieser Bestellung konnte kein Shop-Produkt für eine Bewertung zugeordnet werden.'
      return
    }
    deliveryToken = crypto.randomBytes(32).toString('hex')
    document.reviewProducts = reviewProducts
    document.reviewTokenHash = hashReviewToken(deliveryToken)
    document.reviewTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    document.reviewRequestStatus = 'sending'
    document.reviewRequestAttemptAt = new Date().toISOString()
    document.reviewRequestAttempts = Number(document.reviewRequestAttempts || 0) + 1
    document.reviewRequestError = ''
  })

  const document = claimed.document
  if (['sent', 'submitted', 'skipped', 'failed'].includes(document.reviewRequestStatus)) {
    return {
      sent: document.reviewRequestStatus === 'sent',
      status: document.reviewRequestStatus,
      error: document.reviewRequestError || '',
      salesDocuments: claimed.salesDocuments,
    }
  }
  const reviewUrl = `https://xn--zyro-getrnke-ocb.de/bewertung.html?token=${encodeURIComponent(deliveryToken)}`
  const orderNumber = document.number || document.id
  try {
    await sendShopEmail({
      to: document.recipientEmail,
      subject: `Wie war deine Bestellung ${orderNumber}? · ZYRO`,
      text: `Hallo!\n\nDeine Bestellung ${orderNumber} wurde zugestellt. Wie schmeckt dein ZYRO-Getränk? Teile deine Bewertung mit uns: ${reviewUrl}\n\nBewertungen werden vor der Veröffentlichung geprüft. Der persönliche Bewertungslink ist 90 Tage gültig.\n\nViele Grüße\nZYRO`,
      html: `<!doctype html><html lang="de"><body style="margin:0;background:#f3f6ed;font:16px/1.6 Arial,sans-serif;color:#14251d"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:20px"><p style="font-weight:700;letter-spacing:3px;color:#57752b">ZYRO · TASTE THE DIFFERENCE.</p><h1 style="font-size:30px">Dein Paket ist da! ✨</h1><p>Hallo!</p><p>Deine Bestellung <strong>${escapeEmailHtml(orderNumber)}</strong> wurde zugestellt. Jetzt sind wir neugierig: Wie schmeckt dein ZYRO-Getränk?</p><p style="margin:28px 0"><a href="${escapeEmailHtml(reviewUrl)}" style="display:inline-block;padding:14px 22px;background:#14251d;border-radius:12px;color:#d7f36a;text-decoration:none;font-weight:700">Jetzt Bewertung schreiben</a></p><p>Dein persönlicher Bewertungslink ist 90 Tage gültig. Bewertungen werden vor der Veröffentlichung geprüft.</p><p>Viele Grüße<br><strong>Dein ZYRO-Team</strong></p></main></body></html>`,
    })
  } catch (error) {
    const failed = await updateDeliveryReviewState(orderId, (current) => {
      current.reviewRequestStatus = 'failed'
      current.reviewRequestError = String(error.message || 'Mailversand fehlgeschlagen.').slice(0, 500)
    })
    return { sent: false, status: 'failed', error: error.message || 'Mailversand fehlgeschlagen.', salesDocuments: failed.salesDocuments }
  }
  const updated = await updateDeliveryReviewState(orderId, (current) => {
    current.reviewRequestStatus = 'sent'
    current.reviewRequestSentAt = new Date().toISOString()
    current.reviewRequestError = ''
  })
  return { sent: true, status: 'sent', salesDocuments: updated.salesDocuments }
}

const createStockMovement = ({ type, product, quantity, actor, note = '', referenceType = '', referenceId = '', referenceNumber = '' }) => ({
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  type,
  productId: product.id,
  productName: product.name || product.productName || 'Produkt',
  sku: product.sku || product.productSku || '',
  quantity,
  userId: String(actor.id),
  userName: actor.name || actor.username || 'Zyro-Benutzer',
  note,
  referenceType,
  referenceId: referenceId ? String(referenceId) : '',
  referenceNumber,
})

exports.webAppMde = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 60,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'MDE-Zugriff nicht zulässig.' })
  try {
    const actor = await getWebAppActor(request)
    const permissions = actor.role === 'admin' ? ['lager', 'mde', 'verkauf', 'versand'] : (Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions)
    const action = String(request.body?.action || '')
    if (['dpd-settings-status', 'dpd-settings-save', 'dpd-settings-delete'].includes(action) && actor.role !== 'admin') {
      return response.status(403).json({ error: 'DPD-Zugangsdaten dürfen nur von einem Admin verwaltet werden.' })
    }
    if (action === 'receive-purchase-order') {
      if (actor.role !== 'admin' && !permissions.includes('einkauf')) {
        return response.status(403).json({ error: 'Für Einkaufs-Wareneingänge brauchst du die Einkaufsberechtigung.' })
      }
    } else if (!permissions.includes('lager') && !permissions.includes('mde') && !permissions.includes('versand') && !permissions.includes('verkauf')) {
      return response.status(403).json({ error: 'Du hast keine Berechtigung für MDE-Buchungen.' })
    }
    if (action !== 'receive-purchase-order' && actor.role !== 'admin' && permissions.includes('verkauf') && !permissions.includes('lager') && !permissions.includes('mde') && !permissions.includes('versand') && action !== 'send-document') {
      return response.status(403).json({ error: 'Du hast keine Berechtigung für diese Verkaufsaktion.' })
    }
    if (actor.role !== 'admin' && permissions.includes('versand') && !permissions.includes('lager') && !permissions.includes('mde') && !permissions.includes('verkauf') && !['shipment', 'delivery-confirm', 'review-request', 'notify-shipment', 'notify'].includes(action)) {
      return response.status(403).json({ error: 'Du hast keine Berechtigung für diese MDE-Buchung.' })
    }

    if (action === 'send-document') {
      if (actor.role !== 'admin' && !permissions.includes('verkauf')) {
        return response.status(403).json({ error: 'Verkaufsbelege dürfen nur von Admins oder Verkaufsmitarbeitern versendet werden.' })
      }
      let document
      try {
        document = validateSalesDocumentEmail(request.body)
      } catch (error) {
        return response.status(400).json({ error: error.message || 'Belegdaten ungültig.' })
      }
      const { email, label, number, recipientName, pdf } = document
      try {
        await sendShopEmail({
          to: email,
          subject: `${label} ${number} · ZYRO`,
          text: `Guten Tag ${recipientName},\n\nanbei erhalten Sie die ${label} ${number} als PDF.\n\n${signatureText}`,
          html: `<p>Guten Tag ${escapeHtml(recipientName)},</p><p>anbei erhalten Sie die ${label} <strong>${escapeHtml(number)}</strong> als PDF.</p>${signatureHtml}`,
          attachment: { filename: `${number}.pdf`, content: pdf, contentType: 'application/pdf' },
        })
      } catch (error) {
        console.error('Verkaufsbeleg konnte nicht versendet werden:', { code: String(error.code || ''), message: error.message })
        return response.status(502).json({ error: describeSmtpFailure(error, 'Belegversand') })
      }
      return response.json({ sent: true })
    }

    if (action === 'dpd-settings-status') {
      const snapshot = await dpdConfigRef.get()
      const settings = snapshot.exists ? snapshot.data() : {}
      const credentials = settings.credentialsCiphertext ? decryptDpdCredentials(settings) : {}
      return response.json({
        configured: Boolean(settings.credentialsCiphertext),
        username: credentials.username || '',
        customerNumber: credentials.customerNumber || '',
        depotNumber: credentials.depotNumber || '',
      })
    }

    if (action === 'dpd-settings-save') {
      const username = String(request.body?.username || '').trim()
      const customerNumber = String(request.body?.customerNumber || '').trim()
      const depotNumber = String(request.body?.depotNumber || '').trim()
      const password = String(request.body?.password || '')
      if (!username || username.length > 254 || !customerNumber || customerNumber.length > 100
        || !depotNumber || depotNumber.length > 100 || password.length > 1024) {
        return response.status(400).json({ error: 'DPD-Webservice-Kennung, Kundennummer oder Depotnummer ungültig.' })
      }
      const existing = (await dpdConfigRef.get()).data() || {}
      const existingCredentials = existing.credentialsCiphertext ? decryptDpdCredentials(existing) : null
      if (!password && !existingCredentials?.password) {
        return response.status(400).json({ error: 'Bitte das DPD-Webservice-Passwort eintragen.' })
      }
      const encryptedCredentials = encryptDpdCredentials({
        username,
        customerNumber,
        depotNumber,
        password: password || existingCredentials.password,
      })
      await dpdConfigRef.set({
        ...encryptedCredentials,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return response.json({ configured: true, username, customerNumber, depotNumber })
    }

    if (action === 'dpd-settings-delete') {
      await dpdConfigRef.delete()
      return response.json({ configured: false })
    }

    if (action === 'receive') {
      const productId = String(request.body?.productId || '')
      const quantity = Number(request.body?.quantity)
      const note = String(request.body?.note || '').trim()
      if (!productId || productId.length > 200 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 || note.length > 250) {
        return response.status(400).json({ error: 'Wareneingangsdaten ungültig.' })
      }
      let lotInput
      try {
        lotInput = normalizeLotInput(request.body?.lot, request.body?.bestBefore)
      } catch (lotError) {
        return response.status(400).json({ error: lotError.message })
      }
      const result = await runMdeCloudUpdate(mdeDataKeys.filter((key) => key !== 'zyro-sales-documents'), (data) => {
        const product = data['zyro-products'].find((entry) => String(entry.id) === productId)
        if (!product) throw mdeError('Produkt wurde in der Cloud nicht gefunden.', 404)
        const currentStock = product.availableBottles
        if (currentStock !== undefined && (!Number.isSafeInteger(currentStock) || currentStock < 0)) {
          throw mdeError('Der erfasste Dosenbestand dieses Produkts ist ungültig.', 409)
        }
        const nextStock = (currentStock || 0) + quantity
        if (!Number.isSafeInteger(nextStock)) throw mdeError('Der neue Dosenbestand überschreitet den zulässigen Zahlenbereich.', 409)
        product.availableBottles = nextStock
        addLot(product, { ...lotInput, quantity })
        const lotNote = [lotInput.lot && `Charge ${lotInput.lot}`, lotInput.bestBefore && `MHD ${lotInput.bestBefore}`].filter(Boolean).join(' · ')
        data['zyro-stock-movements'].unshift(createStockMovement({
          type: 'Wareneingang',
          product,
          quantity,
          actor,
          note: [note, lotNote].filter(Boolean).join(' · '),
        }))
        return {
          products: data['zyro-products'],
          stockMovements: data['zyro-stock-movements'],
        }
      })
      return response.json(result)
    }

    if (action === 'receive-purchase-order') {
      const orderId = String(request.body?.orderId || '')
      const receiptId = String(request.body?.receiptId || '')
      if (!orderId || orderId.length > 100) return response.status(400).json({ error: 'Einkaufsauftrags-ID ungültig.' })
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(receiptId)) return response.status(400).json({ error: 'Wareneingangs-ID ungültig.' })
      const result = await runMdeCloudUpdate(['zyro-products', 'zyro-stock-movements', 'zyro-purchase-orders'], (data) => {
        const order = data['zyro-purchase-orders'].find((entry) => entry.id === orderId)
        const products = data['zyro-products']
        const receipt = createPurchaseReceipt(order, products, request.body, actor, normalizeLotInput, addLot)
        if (receipt.alreadyProcessed) {
          return {
            alreadyProcessed: true,
            order,
            products,
            stockMovements: data['zyro-stock-movements'],
          }
        }
        data['zyro-purchase-orders'] = data['zyro-purchase-orders'].map((entry) => entry.id === orderId ? receipt.order : entry)
        for (const movement of receipt.movements) {
          data['zyro-stock-movements'].unshift(createStockMovement({
            type: 'Wareneingang',
            product: movement.product,
            quantity: movement.quantity,
            actor,
            note: [request.body.note, movement.lot.lot && `Charge ${movement.lot.lot}`, movement.lot.bestBefore && `MHD ${movement.lot.bestBefore}`].filter(Boolean).join(' · ').slice(0, 250),
            referenceType: 'einkaufsauftrag',
            referenceId: order.id,
            referenceNumber: order.number,
          }))
        }
        return {
          alreadyProcessed: false,
          order: receipt.order,
          products,
          stockMovements: data['zyro-stock-movements'],
        }
      })
      return response.json(result)
    }

    if (action === 'accept') {
      const orderId = String(request.body?.orderId || '')
      if (!orderId || orderId.length > 200) return response.status(400).json({ error: 'Auftrags-ID ungültig.' })
      const result = await runMdeCloudUpdate(['zyro-sales-documents'], ({ 'zyro-sales-documents': salesDocuments }) => {
        const document = salesDocuments.find((entry) => String(entry.id) === orderId)
        acceptMdeOrder({ document, actor })
        return { salesDocuments, orderId: document.id }
      })
      return response.json(result)
    }

    if (action === 'scan') {
      const orderId = String(request.body?.orderId || '')
      const barcode = String(request.body?.barcode || '')
      if (!orderId || orderId.length > 200 || !barcode || barcode.length > 200) {
        return response.status(400).json({ error: 'Auftragsnummer oder Produktbarcode ungültig.' })
      }
      const result = await runMdeCloudUpdate(['zyro-products', 'zyro-sales-documents'], (data) => {
        const document = data['zyro-sales-documents'].find((entry) => String(entry.id) === orderId)
        const scan = recordMdeScan({ document, products: data['zyro-products'], barcode, actor })
        return {
          salesDocuments: data['zyro-sales-documents'],
          orderId: document.id,
          productName: scan.product.name || 'Produkt',
          scannedQuantity: scan.scannedQuantity,
          requiredQuantity: scan.requiredQuantity,
        }
      })
      return response.json(result)
    }

    if (action === 'pack') {
      const orderId = String(request.body?.orderId || '')
      if (!orderId || orderId.length > 200) return response.status(400).json({ error: 'Auftrags-ID ungültig.' })
      const result = await runMdeCloudUpdate(mdeDataKeys, (data) => {
        const document = data['zyro-sales-documents'].find((entry) => String(entry.id) === orderId)
        const packedLines = validateMdePacking({ document, products: data['zyro-products'], actorId: actor.id })
        const timestamp = new Date().toISOString()
        document.pickedLots = []
        for (const { product, quantity } of packedLines) {
          product.availableBottles -= quantity
          const picked = allocateFefo(product, quantity)
          for (const entry of picked) document.pickedLots.push({ productId: product.id, productName: product.name || '', ...entry })
          data['zyro-stock-movements'].unshift(createStockMovement({
            type: 'Warenausgang',
            product,
            quantity,
            actor,
            note: picked.map((entry) => `${entry.quantity}× ${entry.lot || 'ohne Charge'}${entry.bestBefore ? ` (MHD ${entry.bestBefore})` : ''}`).join(', '),
            referenceType: 'kundenauftrag',
            referenceId: document.id,
            referenceNumber: document.number || String(document.id),
          }))
        }
        document.status = 'Verpackt'
        document.packedAt = timestamp
        document.packedBy = actor.name || actor.username || 'Zyro-Benutzer'
        document.shippingLabelCreatedAt = timestamp
        document.shippingLabelCreatedBy = document.packedBy
        document.packedNotificationStatus = 'pending'
        document.packedNotificationError = ''
        const { invoice, created } = createInvoiceFromOrder({
          order: document,
          documents: data['zyro-sales-documents'],
          products: data['zyro-products'],
          responsibleName: document.packedBy,
        })
        if (created) data['zyro-sales-documents'].unshift(invoice)
        document.invoiceDocumentId = invoice.id
        document.invoiceNumber = invoice.number
        return {
          invoiceId: invoice.id,
          invoiceProducts: data['zyro-products'],
          products: data['zyro-products'],
          salesDocuments: data['zyro-sales-documents'],
          stockMovements: data['zyro-stock-movements'],
          orderId: document.id,
          orderNumber: document.number || String(document.id),
        }
      })
      try {
        const emailResult = await sendPackedOrderNotification(result.orderId)
        result.salesDocuments = emailResult.salesDocuments
        result.emailSent = emailResult.sent
        if (!emailResult.sent) result.emailError = emailResult.error
      } catch (error) {
        result.emailSent = false
        result.emailError = error.message || 'Mailversand fehlgeschlagen.'
      }
      const invoiceResult = await deliverAutoInvoice(result.invoiceId, result.invoiceProducts)
      result.invoiceNumber = invoiceResult.number
      result.invoiceEmailSent = invoiceResult.emailSent
      result.invoicePublished = invoiceResult.published
      if (invoiceResult.error) result.invoiceError = invoiceResult.error
      if (invoiceResult.salesDocuments) result.salesDocuments = invoiceResult.salesDocuments
      delete result.invoiceId
      delete result.invoiceProducts
      return response.json(result)
    }

    if (action === 'invoice') {
      const orderId = String(request.body?.orderId || '')
      if (!orderId || orderId.length > 200) return response.status(400).json({ error: 'Auftrags-ID ungültig.' })
      const { value: products } = await readCloudAppData('zyro-products')
      const { value: documents } = await readCloudAppData('zyro-sales-documents')
      const order = (Array.isArray(documents) ? documents : []).find((entry) => String(entry.id) === orderId)
      if (!order?.invoiceDocumentId) return response.status(404).json({ error: 'Zum Auftrag wurde noch keine Rechnung erstellt.' })
      const invoiceResult = await deliverAutoInvoice(order.invoiceDocumentId, Array.isArray(products) ? products : [])
      return response.json({
        invoiceNumber: invoiceResult.number,
        invoiceEmailSent: invoiceResult.emailSent,
        invoicePublished: invoiceResult.published,
        ...(invoiceResult.error ? { invoiceError: invoiceResult.error } : {}),
        salesDocuments: invoiceResult.salesDocuments,
      })
    }

    if (action === 'shipment') {
      const orderId = String(request.body?.orderId || '')
      const carrier = String(request.body?.carrier || '')
      const carrierName = String(request.body?.carrierName || '')
      const trackingNumber = String(request.body?.trackingNumber || '')
      const trackingUrl = String(request.body?.trackingUrl || '')
      if (!orderId || orderId.length > 200 || carrierName.length > 100 || trackingNumber.length > 120 || trackingUrl.length > 2000) {
        return response.status(400).json({ error: 'Versanddaten ungültig.' })
      }
      const result = await runMdeCloudUpdate(['zyro-sales-documents'], ({ 'zyro-sales-documents': salesDocuments }) => {
        const document = salesDocuments.find((entry) => String(entry.id) === orderId)
        validateShipment({ document, carrier, carrierName, trackingNumber, trackingUrl })
        return { salesDocuments, orderId: document.id }
      })
      try {
        const emailResult = await sendShippedOrderNotification(result.orderId)
        result.salesDocuments = emailResult.salesDocuments
        result.emailSent = emailResult.sent
        if (!emailResult.sent) result.emailError = emailResult.error
      } catch (error) {
        result.emailSent = false
        result.emailError = error.message || 'Versand-E-Mail konnte nicht verarbeitet werden.'
      }
      return response.json(result)
    }

    if (action === 'notify-shipment') {
      const orderId = String(request.body?.orderId || '')
      if (!orderId || orderId.length > 200) return response.status(400).json({ error: 'Auftrags-ID ungültig.' })
      const result = await sendShippedOrderNotification(orderId)
      return response.json({
        salesDocuments: result.salesDocuments,
        emailSent: result.sent,
        ...(result.sent ? {} : { emailError: result.error }),
      })
    }

    if (action === 'delivery-confirm' || action === 'review-request') {
      if (actor.role !== 'admin' && !permissions.includes('versand')) {
        return response.status(403).json({ error: 'Nur Admins oder Versandmitarbeiter dürfen eine Zustellung bestätigen.' })
      }
      const orderId = String(request.body?.orderId || '')
      if (!orderId || orderId.length > 200) return response.status(400).json({ error: 'Auftrags-ID ungültig.' })
      if (action === 'delivery-confirm') await confirmOrderDelivery(orderId, 'manual')
      const { products: shopProducts } = await readShopConfig()
      const reviewResult = await sendDeliveryReviewRequest(orderId, shopProducts)
      return response.json({
        salesDocuments: reviewResult.salesDocuments,
        reviewEmailSent: reviewResult.sent,
        ...(reviewResult.error ? { reviewEmailError: reviewResult.error } : {}),
        ...(reviewResult.status ? { reviewRequestStatus: reviewResult.status } : {}),
      })
    }

    if (action === 'reviews-list' || action === 'review-moderate') {
      if (actor.role !== 'admin') return response.status(403).json({ error: 'Bewertungen dürfen nur von einem Admin verwaltet werden.' })
      if (action === 'reviews-list') {
        const snapshot = await db.collection('publicProductReviews').where('status', '==', 'pending').limit(100).get()
        const reviews = snapshot.docs.map((entry) => {
          const review = entry.data()
          return {
            id: entry.id,
            ...review,
            createdAt: review.createdAt?.toDate?.().toISOString?.() || String(review.createdAt || ''),
          }
        })
          .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
        return response.json({ reviews })
      }
      const reviewId = String(request.body?.reviewId || '')
      const decision = String(request.body?.decision || '')
      if (!/^[a-f0-9]{64}$/.test(reviewId) || !['approve', 'reject'].includes(decision)) {
        return response.status(400).json({ error: 'Bewertungsentscheidung ungültig.' })
      }
      const reviewRef = db.collection('publicProductReviews').doc(reviewId)
      const result = await db.runTransaction(async (transaction) => {
        const reviewSnapshot = await transaction.get(reviewRef)
        if (!reviewSnapshot.exists) throw mdeError('Bewertung wurde nicht gefunden.', 404)
        const review = reviewSnapshot.data()
        if (review.status !== 'pending') throw mdeError('Diese Bewertung wurde bereits geprüft.', 409)
        if (decision === 'approve') {
          const statsRef = db.collection('publicProductReviewStats').doc(review.productId)
          const statsSnapshot = await transaction.get(statsRef)
          const current = statsSnapshot.exists ? statsSnapshot.data() : {}
          transaction.set(statsRef, {
            count: Number(current.count || 0) + 1,
            ratingSum: Number(current.ratingSum || 0) + Number(review.rating),
          })
        }
        transaction.update(reviewRef, {
          status: decision === 'approve' ? 'approved' : 'rejected',
          moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
          moderatedBy: String(actor.id || actor.username || 'admin').slice(0, 100),
        })
        return { status: decision === 'approve' ? 'approved' : 'rejected' }
      })
      return response.json(result)
    }

    if (action === 'notify') {
      const orderId = String(request.body?.orderId || '')
      if (!orderId || orderId.length > 200) return response.status(400).json({ error: 'Auftrags-ID ungültig.' })
      const result = await sendPackedOrderNotification(orderId)
      if (!result.sent) return response.status(502).json({ error: result.error })
      return response.json(result)
    }

    return response.status(400).json({ error: 'MDE-Aktion ungültig.' })
  } catch (error) {
    const status = error.statusCode || (error.message.includes('Anmeldung') || error.message.includes('Benutzerkonto') ? 401 : 500)
    if (status >= 500) console.error('MDE-Cloud-Buchung fehlgeschlagen:', error.message)
    return response.status(status).json({ error: error.message || 'MDE-Buchung fehlgeschlagen.' })
  }
})

const dhlStatusCache = new Map()

const fetchDhlStatus = async (trackingNumber) => {
  const number = String(trackingNumber || '').trim()
  if (!/^[A-Za-z0-9]{6,40}$/.test(number)) return null
  const cached = dhlStatusCache.get(number)
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value
  const config = await db.collection('privateShop').doc('dhl').get()
  const apiKey = String(config.data()?.apiKey || '').trim()
  if (!apiKey) return null
  let value = null
  try {
    const dhlResponse = await fetch(`https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(number)}&language=de`, {
      headers: { 'DHL-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (dhlResponse.ok) {
      const shipment = (await dhlResponse.json())?.shipments?.[0]
      if (shipment) {
        const place = (entry) => String(entry?.location?.address?.addressLocality || '').slice(0, 100)
        value = {
          status: String(shipment.status?.status || shipment.status?.description || '').slice(0, 200),
          description: String(shipment.status?.description || '').slice(0, 300),
          timestamp: String(shipment.status?.timestamp || ''),
          location: place(shipment.status),
          events: (Array.isArray(shipment.events) ? shipment.events : []).slice(0, 15).map((event) => ({
            timestamp: String(event.timestamp || ''),
            description: String(event.description || event.status || '').slice(0, 300),
            location: place(event),
          })),
        }
      }
    } else {
      console.warn('DHL-Statusabfrage abgelehnt:', dhlResponse.status)
    }
  } catch (error) {
    console.warn('DHL-Statusabfrage fehlgeschlagen:', error.message)
  }
  dhlStatusCache.set(number, { at: Date.now(), value })
  return value
}

exports.sendDeliveredReviewRequests = onSchedule({
  region,
  schedule: 'every 6 hours',
  timeZone: 'Europe/Berlin',
  maxInstances: 1,
  timeoutSeconds: 300,
}, async () => {
  const { value } = await readCloudAppData('zyro-sales-documents')
  const { products: shopProducts } = await readShopConfig()
  const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000
  const candidates = (Array.isArray(value) ? value : [])
    .filter((document) => {
      if (document.kind !== 'kundenauftrag' || document.status !== 'Versendet') return false
      const shippedAt = Date.parse(document.shippedAt || '')
      if (!Number.isFinite(shippedAt) || shippedAt < cutoff) return false
      if (document.deliveryConfirmedAt) {
        return !['sent', 'submitted', 'skipped', 'failed'].includes(document.reviewRequestStatus)
      }
      return String(document.carrier || '').toUpperCase() === 'DHL' && Boolean(document.trackingNumber)
    })
    .sort((left, right) => String(right.shippedAt || '').localeCompare(String(left.shippedAt || '')))
    .slice(0, 40)

  for (const order of candidates) {
    try {
      if (!order.deliveryConfirmedAt) {
        const status = await fetchDhlStatus(order.trackingNumber)
        if (!isDhlDelivered(status)) continue
        await confirmOrderDelivery(order.id, 'DHL')
      }
      const result = await sendDeliveryReviewRequest(order.id, shopProducts)
      if (!result.sent && result.status !== 'skipped') {
        console.warn('Bewertungs-E-Mail nach Zustellung konnte nicht versendet werden:', {
          orderNumber: order.number || order.id,
          status: result.status,
          error: result.error || '',
        })
      }
    } catch (error) {
      console.warn('Zustellprüfung für Bewertungs-E-Mail fehlgeschlagen:', {
        orderNumber: order.number || order.id,
        error: error.message,
      })
    }
  }
})

exports.publicShipmentTracking = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 20,
}, async (request, response) => {
  setCors(request, response)
  response.set('Cache-Control', 'no-store')
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Tracking-Anfrage nicht zulässig.' })
  const token = String(request.body?.token || '')
  if (!/^[a-f0-9]{64}$/.test(token)) return response.status(404).json({ error: 'Tracking-Link ungültig oder abgelaufen.' })

  try {
    const rateLimitId = crypto.createHash('sha256').update(getClientRateLimitId(request)).digest('hex')
    const rateLimitRef = db.collection('publicShipmentTrackingRateLimits').doc(rateLimitId)
    const now = Date.now()
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateLimitRef)
      const previous = snapshot.exists ? snapshot.data() : {}
      const activeWindow = Number(previous.windowStart || 0) > now - 15 * 60 * 1000
      const count = activeWindow ? Number(previous.count || 0) : 0
      if (count >= 30) throw mdeError('Zu viele Tracking-Abfragen. Bitte später erneut versuchen.', 429)
      transaction.set(rateLimitRef, { windowStart: activeWindow ? previous.windowStart : now, count: count + 1 })
    })
    const { value } = await readCloudAppData('zyro-sales-documents')
    const tracking = getPublicShipment({ documents: Array.isArray(value) ? value : [], token })
    if (!tracking) return response.status(404).json({ error: 'Tracking-Link ungültig oder abgelaufen.' })
    if (String(tracking.carrier).toUpperCase().startsWith('DHL')) tracking.carrierStatus = await fetchDhlStatus(tracking.trackingNumber)
    return response.json({ tracking })
  } catch (error) {
    if (error.statusCode === 429) return response.status(429).json({ error: error.message })
    console.error('Öffentliche Sendungsverfolgung fehlgeschlagen:', error.message)
    return response.status(500).json({ error: 'Sendungsverfolgung derzeit nicht verfügbar.' })
  }
})

exports.webAppLogin = onRequest({
  region,
  invoker: 'public',
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 30,
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Anmeldung nicht zulässig.' })
  const username = String(request.body?.username || '').trim()
  const password = String(request.body?.password || '')
  if (!username || username.length > 100 || !password || password.length > 1024) {
    return response.status(400).json({ error: 'Benutzername oder Passwort ungültig.' })
  }
  try {
    await webAppLoginRateLimit(request, username)
    const { value } = await readCloudAppData('zyro-users')
    const user = (Array.isArray(value) ? value : []).find((entry) => entry.username?.toLowerCase() === username.toLowerCase())
    if (!user || !verifyWebAppPassword(password, user.passwordHash)) {
      return response.status(401).json({ error: 'Benutzername oder Passwort falsch.' })
    }
    const sessionToken = crypto.randomBytes(32).toString('base64url')
    const sessionId = crypto.createHash('sha256').update(sessionToken).digest('hex')
    await db.collection('webAppSessions').doc(sessionId).create({
      userId: String(user.id),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    return response.json({ sessionToken, user: publicWebAppUser(user) })
  } catch (error) {
    if (error.message.startsWith('Zu viele Anmeldeversuche')) return response.status(429).json({ error: error.message })
    console.error('Web-App-Anmeldung fehlgeschlagen:', error.message)
    return response.status(503).json({ error: 'Anmeldung derzeit nicht möglich. Cloud-Sync am Haupt-PC prüfen.' })
  }
})

const updateCloudWebAppUsers = async (users, baseRevision) => {
  const serialized = JSON.stringify(users)
  const compressed = zlib.gzipSync(Buffer.from(serialized, 'utf8')).toString('base64')
  const chunks = []
  for (let offset = 0; offset < compressed.length; offset += cloudChunkSize) chunks.push(compressed.slice(offset, offset + cloudChunkSize))
  if (chunks.length === 0) chunks.push('')
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cloudManifestRef)
    const manifest = snapshot.data() || {}
    const entry = manifest.keys?.['zyro-users']
    const revision = Number(entry?.revision) || 0
    if (revision !== baseRevision) return { conflict: true, revision }
    chunks.forEach((chunk, index) => transaction.set(cloudChunksRef.doc(cloudChunkId('zyro-users', index)), { data: chunk }))
    for (let index = chunks.length; index < (entry?.chunkCount || 0); index += 1) {
      transaction.delete(cloudChunksRef.doc(cloudChunkId('zyro-users', index)))
    }
    const nextRevision = revision + 1
    transaction.set(cloudManifestRef, {
      keys: {
        ...(manifest.keys || {}),
        'zyro-users': { revision: nextRevision, chunkCount: chunks.length, size: compressed.length, updatedAt: Date.now() },
      },
    })
    return { revision: nextRevision }
  })
}

exports.webAppAuth = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 30,
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'GET' && request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Anmeldung nicht zulässig.' })
  try {
    const actor = await getWebAppActor(request)
    if (request.method === 'GET') {
      const { value } = await readCloudAppData('zyro-users')
      const users = (Array.isArray(value) ? value : []).map(publicWebAppUser)
      return response.json({ user: publicWebAppUser(actor), users })
    }

    const action = String(request.body?.action || '')
    if (action === 'logout') {
      const sessionToken = String(request.get('authorization') || '').slice(7)
      const sessionId = crypto.createHash('sha256').update(sessionToken).digest('hex')
      await db.collection('webAppSessions').doc(sessionId).delete()
      return response.json({ success: true })
    }
    const { revision, value } = await readCloudAppData('zyro-users')
    const users = Array.isArray(value) ? value : []
    let updatedUser
    const updatedUsers = users.map((user) => {
      if (String(user.id) !== String(actor.id)) return user
      if (action === 'profile') {
        const profile = request.body?.profile || {}
        const name = String(profile.name || '').trim()
        const rawEmail = String(profile.email || '').trim()
        const email = rawEmail ? normalizeEmailAddress(rawEmail) : ''
        const phone = String(profile.phone || '').trim()
        const address = String(profile.address || '').trim()
        const avatarDataUrl = String(profile.avatarDataUrl || '')
        if (!name || name.length > 100
          || phone.length > 50 || address.length > 300
          || (avatarDataUrl && (avatarDataUrl.length > 400000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatarDataUrl)))) {
          throw new Error('Profilangaben ungültig.')
        }
        updatedUser = { ...user, name, email, phone, address, avatarDataUrl }
      } else if (action === 'account') {
        const currentPassword = String(request.body?.currentPassword || '')
        const newPassword = String(request.body?.newPassword || '')
        const username = String(request.body?.username || '').trim()
        if (!verifyWebAppPassword(currentPassword, user.passwordHash)) throw new Error('Das aktuelle Passwort ist falsch.')
        if (!username || username.length > 100 || newPassword.length < 8 || newPassword.length > 1024) {
          throw new Error('Benutzername ungültig oder das neue Passwort ist zu kurz.')
        }
        if (users.some((candidate) => String(candidate.id) !== String(user.id) && candidate.username?.toLowerCase() === username.toLowerCase())) {
          throw new Error('Dieser Benutzername ist bereits vergeben.')
        }
        const salt = crypto.randomBytes(16).toString('hex')
        const passwordHash = crypto.scryptSync(newPassword, salt, 64).toString('hex')
        updatedUser = { ...user, username, passwordHash: `${salt}:${passwordHash}` }
      } else {
        throw new Error('Änderung nicht unterstützt.')
      }
      return updatedUser
    })
    if (!updatedUser) return response.status(404).json({ error: 'Benutzerkonto nicht gefunden.' })
    const result = await updateCloudWebAppUsers(updatedUsers, revision)
    if (result.conflict) return response.status(409).json({ error: 'Benutzerkonto wurde gleichzeitig geändert. Bitte erneut versuchen.' })
    return response.json({ user: publicWebAppUser(updatedUser), users: updatedUsers.map(publicWebAppUser) })
  } catch (error) {
    const status = error.message.includes('Anmeldung') ? 401 : error.message.includes('nicht gefunden') ? 404 : 400
    return response.status(status).json({ error: error.message })
  }
})

exports.webAppData = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 60,
  memory: '512MiB',
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Datenzugriff nicht zulässig.' })
  try {
    const actor = await getWebAppActor(request)
    const action = String(request.body?.action || '')
    if (action === 'manifest') {
      const snapshot = await cloudManifestRef.get()
      const keys = snapshot.data()?.keys || {}
      return response.json({
        keys: Object.fromEntries(Object.entries(keys).map(([key, entry]) => [key, { revision: Number(entry.revision) || 0 }])),
      })
    }

    const key = String(request.body?.key || '')
    if (!webAppDataKeys.has(key)) return response.status(400).json({ error: 'Datenbereich ungültig.' })
    if (['zyro-shop-settings', 'zyro-shop-discounts', 'zyro-company-details'].includes(key) && actor.role !== 'admin') {
      return response.status(403).json({ error: 'Diese Einstellungen dürfen nur von einem Admin verwaltet werden.' })
    }
    if (key === 'zyro-bottler-details' && action !== 'get' && actor.role !== 'admin') {
      return response.status(403).json({ error: 'Lohnabfüller-Daten dürfen nur von einem Admin verwaltet werden.' })
    }
    if (key === 'zyro-finance-entries' && actor.role !== 'admin'
      && !(Array.isArray(actor.permissions) && actor.permissions.includes('finanzen'))) {
      return response.status(403).json({ error: 'Du hast keine Finanzen-Berechtigung.' })
    }
    if (['zyro-suppliers', 'zyro-purchase-orders'].includes(key) && actor.role !== 'admin'
      && !(Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions).includes('einkauf')) {
      return response.status(403).json({ error: 'Für Einkaufsdaten brauchst du die Einkaufsberechtigung.' })
    }
    if (key === 'zyro-payment-settings' && actor.role !== 'admin') {
      return response.status(403).json({ error: 'Das Zahlungskonto darf nur von einem Admin verwaltet werden.' })
    }
    if (key === 'zyro-lab-tests' && actor.role !== 'admin'
      && !(Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions).includes('rezepturen')) {
      return response.status(403).json({ error: 'Du hast keine Rezeptur-Berechtigung.' })
    }
    if (key === 'zyro-elster-setup' && actor.role !== 'admin') {
      return response.status(403).json({ error: 'ELSTER-Einstellungen dürfen nur von einem Admin verwaltet werden.' })
    }
    if (key === 'zyro-cost-calculations' && actor.role !== 'admin') {
      return response.status(403).json({ error: 'Kalkulationen dürfen nur von einem Admin verwaltet werden.' })
    }
    if (key === 'zyro-sales-target' && actor.role !== 'admin'
      && !(Array.isArray(actor.permissions) && actor.permissions.includes('analyse'))) {
      return response.status(403).json({ error: 'Du hast keine Analyse-Berechtigung.' })
    }
    if (key === 'zyro-machinebau' && actor.role !== 'admin'
      && !(Array.isArray(actor.permissions) ? actor.permissions : defaultWebAppPermissions).includes('maschinenbau')) {
      return response.status(403).json({ error: 'Du hast keine Maschinenbau-Berechtigung.' })
    }
    if (key === 'zyro-hr-sensitive' && actor.role !== 'admin') {
      return response.status(403).json({ error: 'Geschützte Mitarbeiterdaten dürfen nur von Admins verwaltet werden.' })
    }
    if (action === 'get') {
      const result = await readCloudAppData(key)
      if (key === 'zyro-payment-requests' && actor.role !== 'admin') {
        result.value = (Array.isArray(result.value) ? result.value : [])
          .filter((entry) => String(entry.requesterId) === String(actor.id))
      }
      return response.json(result)
    }
    if (action !== 'put') return response.status(400).json({ error: 'Aktion ungültig.' })
    if (!webAppWritableKeys.has(key)) return response.status(403).json({ error: 'Dieser Datenbereich ist schreibgeschützt.' })
    if (key === 'zyro-payment-settings' && actor.role !== 'admin') {
      return response.status(403).json({ error: 'Das Zahlungskonto darf nur von einem Admin verwaltet werden.' })
    }
    const baseRevision = Number(request.body?.baseRevision)
    if (!Number.isInteger(baseRevision) || baseRevision < 0) return response.status(400).json({ error: 'Cloud-Revision ungültig.' })
    const result = await cloudPutWebAppData(key, request.body?.value, baseRevision, actor)
    if (result.conflict) return response.status(409).json({ error: 'Der Cloud-Stand hat sich geändert.', revision: result.revision })
    return response.json(result)
  } catch (error) {
    const status = error.message.includes('Anmeldung') || error.message.includes('Benutzerkonto') ? 401
      : error.message.includes('Berechtigung') ? 403
        : error.message.includes('Cloud-Stand') ? 409
          : 400
    if (status === 400) {
      console.warn('Web-App-Datensatz abgelehnt:', {
        key: String(request.body?.key || ''),
        action: String(request.body?.action || ''),
        error: error.message,
      })
    }
    return response.status(status).json({
      error: error.message,
      ...(error.code === 'INVALID_SHARED_DATA' ? { code: error.code } : {}),
    })
  }
})

exports.webAppFinanceReceipt = onRequest({
  region,
  invoker: 'public',
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 60,
  memory: '512MiB',
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Belegzugriff nicht zulässig.' })
  try {
    const actor = await getWebAppActor(request)
    if (actor.role !== 'admin'
      && !(Array.isArray(actor.permissions) && actor.permissions.includes('finanzen'))) {
      return response.status(403).json({ error: 'Du hast keine Finanzen-Berechtigung.' })
    }
    const action = String(request.get('x-zyro-action') || request.body?.action || '')
    if (action === 'upload') {
      const receipt = await saveFinanceReceipt(request, actor)
      return response.json({ receipt })
    }
    if (action === 'get') {
      const { entryId, receiptId } = request.body || {}
      const result = await loadFinanceReceipt(String(entryId || ''), String(receiptId || ''))
      return response.json({ receipt: result.receipt, data: result.data.toString('base64') })
    }
    if (action === 'delete') {
      if (actor.role !== 'admin') return response.status(403).json({ error: 'Belege dürfen nur von einem Admin gelöscht werden.' })
      const { entryId, receiptId } = request.body || {}
      const receipt = await deleteFinanceReceipt(String(entryId || ''), String(receiptId || ''))
      return response.json({ receipt })
    }
    return response.status(400).json({ error: 'Belegaktion ungültig.' })
  } catch (error) {
    const status = error.message.includes('Anmeldung') || error.message.includes('Benutzerkonto') ? 401
      : error.message.includes('Berechtigung') ? 403
        : 400
    console.error('Finanzbeleg fehlgeschlagen:', error.message)
    return response.status(status).json({ error: error.message || 'Beleg konnte nicht verarbeitet werden.' })
  }
})

const getAdminLoginRateLimitRef = (request, username) => {
  const key = crypto.createHash('sha256').update(`${getClientRateLimitId(request)}:${username.toLowerCase()}`).digest('hex')
  return db.collection('publicShopAdminRateLimits').doc(key)
}

const enforceAdminLoginRateLimit = async (ref) => {
  const snapshot = await ref.get()
  const windowStart = Number(snapshot.data()?.windowStart || 0)
  const count = windowStart > Date.now() - 15 * 60 * 1000 ? Number(snapshot.data()?.count || 0) : 0
  if (count >= 10) throw new Error('Zu viele Anmeldeversuche für dieses Konto. Bitte später erneut versuchen.')
}

const recordAdminLoginFailure = async (ref) => {
  const now = Date.now()
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const currentStart = Number(snapshot.data()?.windowStart || 0)
    const windowStart = currentStart > now - 15 * 60 * 1000 ? currentStart : now
    const count = currentStart > now - 15 * 60 * 1000 ? Number(snapshot.data()?.count || 0) : 0
    transaction.set(ref, { windowStart, count: count + 1 })
  })
}

exports.loginPublicShopAdmin = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 15,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  try {
    const username = String(request.body?.username || '').trim()
    const password = String(request.body?.password || '')
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username) || password.length > 256) {
      return response.status(401).json({ error: 'Benutzername oder Passwort falsch.' })
    }
    const rateLimitRef = getAdminLoginRateLimitRef(request, username)
    await enforceAdminLoginRateLimit(rateLimitRef)
    const snapshot = await db.collection('publicShop').doc('admin').get()
    const storedUsers = snapshot.exists && Array.isArray(snapshot.data().users) ? snapshot.data().users : []
    const stored = storedUsers.find((user) => user.usernameKey === username.toLowerCase())
    const [salt, expectedHex] = String(stored?.passwordHash || '').split(':')
    const providedHash = salt && password.length <= 256 ? crypto.scryptSync(password, salt, 64) : Buffer.alloc(0)
    const expectedHash = /^[a-f0-9]{128}$/i.test(expectedHex || '') ? Buffer.from(expectedHex, 'hex') : Buffer.alloc(64)
    const validPassword = providedHash.length === expectedHash.length && crypto.timingSafeEqual(providedHash, expectedHash)
    if (!stored || !validPassword) {
      await recordAdminLoginFailure(rateLimitRef)
      return response.status(401).json({ error: 'Benutzername oder Passwort falsch.' })
    }
    await rateLimitRef.delete()
    return response.json({ accessToken: createAdminSessionToken(stored.username) })
  } catch (error) {
    const status = /Zu viele Anmeldeversuche/.test(error.message) ? 429 : 500
    return response.status(status).json({ error: status === 429 ? error.message : 'Anmeldung derzeit nicht möglich.' })
  }
})

exports.syncPublicShopAdmin = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 15,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  const userId = String(request.body?.userId || '').trim()
  if (request.body?.disabled === true) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) return response.status(400).json({ error: 'Admin-Konto ungültig.' })
    const adminRef = db.collection('publicShop').doc('admin')
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(adminRef)
      const users = snapshot.exists && Array.isArray(snapshot.data().users) ? snapshot.data().users : []
      transaction.set(adminRef, {
        users: users.filter((user) => user.id !== userId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })
    return response.json({ success: true })
  }
  const username = String(request.body?.username || '').trim()
  const passwordHash = String(request.body?.passwordHash || '')
  const [salt, hash] = passwordHash.split(':')
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId) || !/^[A-Za-z0-9._-]{3,32}$/.test(username) || !/^[a-f0-9]{32}$/i.test(salt || '') || !/^[a-f0-9]{128}$/i.test(hash || '')) {
    return response.status(400).json({ error: 'Admin-Kontodaten ungültig.' })
  }
  const adminRef = db.collection('publicShop').doc('admin')
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(adminRef)
    const users = snapshot.exists && Array.isArray(snapshot.data().users) ? snapshot.data().users : []
    const updated = { id: userId, username, usernameKey: username.toLowerCase(), passwordHash }
    transaction.set(adminRef, {
      users: [...users.filter((user) => user.id !== userId && user.usernameKey !== updated.usernameKey), updated],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  })
  return response.json({ success: true })
})

exports.submitPublicOrder = onRequest({
  region,
  cors: false,
  maxInstances: 10,
  timeoutSeconds: 20,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)

  try {
    if (String(request.body?.website || '').trim()) return response.status(202).json({ accepted: true })
    const shop = await readShopConfig()
    const customerSession = await getCustomerSession(request)
    const customerProfile = customerSession
      ? (await db.collection('customerProfiles').doc(customerEmailKey(customerSession.email)).get()).data() || {}
      : {}
    if (customerSession && normalizeCustomerEmail(request.body?.email) !== customerSession.email) {
      return response.status(403).json({ error: 'Bei einer Bestellung mit Kundenkonto muss die Konto-E-Mail-Adresse verwendet werden.' })
    }
    const businessApproved = customerProfile.businessStatus === 'approved'
    if (request.body?.businessPricingActive === true
      && !businessApproved) {
      return response.status(409).json({ error: 'Deine Geschäftskundenkonditionen haben sich geändert. Bitte lade den Shop neu und prüfe den Warenkorb.' })
    }
    if (businessApproved && (!customerSession || normalizeCustomerEmail(request.body?.email) !== customerSession.email)) {
      return response.status(403).json({ error: 'Für Geschäftskundenkonditionen muss die Bestellung mit der angemeldeten Konto-E-Mail erfolgen.' })
    }
    let businessPrices = {}
    if (businessApproved) {
      if (request.body?.businessPricingActive !== true || !Object.hasOwn(request.body || {}, 'businessPrices')) {
        return response.status(409).json({ error: 'Deine Geschäftskundenpreise haben sich geändert. Bitte lade den Shop neu und prüfe den Warenkorb.' })
      }
      try {
        businessPrices = getCatalogBusinessPrices(shop.products, customerProfile.businessPrices || {})
        const submittedPrices = cleanBusinessPrices(shop.products, request.body.businessPrices)
        const stablePrices = (prices) => JSON.stringify(Object.entries(prices).sort(([left], [right]) => left.localeCompare(right)))
        if (stablePrices(submittedPrices) !== stablePrices(businessPrices)) {
          return response.status(409).json({ error: 'Deine Geschäftskundenpreise haben sich geändert. Bitte lade den Shop neu und prüfe den Warenkorb.' })
        }
      } catch {
        return response.status(409).json({ error: 'Deine Geschäftskundenpreise sind ungültig. Bitte lade den Shop neu und prüfe den Warenkorb.' })
      }
    }
    if (businessApproved && String(request.body?.discountCode || '').trim()) {
      return response.status(400).json({ error: 'Geschäftskundenkonditionen können nicht mit einem zusätzlichen Rabattcode kombiniert werden.' })
    }
    const pricedProducts = businessApproved
      ? applyBusinessPricing(shop.products, businessPrices)
      : shop.products
    const catalog = new Map(pricedProducts.map((product) => [product.id, product]))
    const availablePaymentMethods = [
      ...(shop.payment.accountHolder && shop.payment.iban ? ['vorkasse'] : []),
      ...((await getStripeStatus()).enabled ? ['stripe'] : []),
    ]
    let orderInput = request.body
    let businessTrayItems = []
    if (businessApproved) {
      try {
        businessTrayItems = normalizeBusinessTrayItems(request.body?.items)
      } catch (error) {
        return response.status(400).json({ error: error.message })
      }
      orderInput = { ...request.body, items: businessTrayItems }
    }
    const order = validatePublicOrder(orderInput, catalog, availablePaymentMethods)
    if (businessApproved) {
      order.items.forEach((item, index) => {
        item.trayCount = businessTrayItems[index].trayCount
      })
      order.company = String(customerProfile.company || order.company)
      order.name = String(customerProfile.name || order.name)
      order.phone = String(customerProfile.phone || '')
      order.contactRole = String(customerProfile.contactRole || '')
      order.billingCompany = String(customerProfile.billingCompany || '')
      order.billingAddress = String(customerProfile.billingAddress || '')
      order.billingPostalCode = String(customerProfile.billingPostalCode || '')
      order.billingCity = String(customerProfile.billingCity || '')
      order.billingEmail = String(customerProfile.billingEmail || customerSession.email)
      order.vatId = String(customerProfile.vatId || '')
      order.businessPricingApplied = true
      order.note = [order.note, customerProfile.deliveryNote]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 1000)
    }
    const discount = businessApproved
      ? { code: '', amountCents: 0 }
      : calculateDiscount(request.body?.discountCode, await readShopDiscountCodes(), order.totalPriceCents)
    const pricedOrder = calculateOrderPricing(order, catalog, shop.settings, discount, { businessCustomer: businessApproved })
    const isStripe = pricedOrder.paymentMethod === 'stripe'
    if (isStripe && getCheckoutAmountCents(pricedOrder, pricedOrder.shippingPriceCents) < 50) {
      return response.status(400).json({
        error: 'Stripe akzeptiert Zahlungen erst ab 0,50 €. Bitte den Rabattcode prüfen, mehr Artikel in den Warenkorb legen oder Vorkasse wählen.',
      })
    }
    await enforceRateLimit(request)
    const completed = await completePublicOrder({ order: pricedOrder, shop, paymentStatus: 'pending', skipEmail: isStripe })
    if (isStripe) {
      try {
        const stripe = await getStripeConfig()
        if (!stripe) throw new Error('Stripe ist nicht eingerichtet.')
        const params = buildCheckoutParams({
          order: pricedOrder,
          orderNumber: completed.orderNumber,
          orderId: completed.orderId,
          successUrl: `https://xn--zyro-getrnke-ocb.de/shop?paid=${encodeURIComponent(completed.orderNumber)}`,
          cancelUrl: 'https://xn--zyro-getrnke-ocb.de/shop?cancelled=1',
          shippingPriceCents: completed.shippingPriceCents,
        })
        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${stripe.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params,
        })
        const session = await stripeResponse.json()
        if (!stripeResponse.ok || !session.url) throw new Error(session?.error?.message || 'Stripe-Sitzung fehlgeschlagen.')
        return response.status(201).json({ accepted: true, orderNumber: completed.orderNumber, checkoutUrl: session.url })
      } catch (stripeError) {
        console.error('Stripe-Checkout fehlgeschlagen:', stripeError.message)
        await Promise.all([
          db.collection('publicOrders').doc(completed.orderId).delete(),
          db.collection('customerPortalOrders').doc(completed.orderId).delete(),
          runMdeCloudUpdate(['zyro-sales-documents'], (data) => {
            const list = data['zyro-sales-documents']
            const position = list.findIndex((entry) => entry.websiteOrderId === completed.orderId)
            if (position >= 0) list.splice(position, 1)
          }).catch(() => {}),
        ])
        return response.status(502).json({ error: 'Die Online-Zahlung ist gerade nicht verfügbar. Bitte Vorkasse wählen oder später erneut versuchen.' })
      }
    }
    return response.status(201).json({
      accepted: true,
      orderNumber: completed.orderNumber,
      paymentInfo: completed.paymentInfo,
      totalPriceCents: completed.totalPriceCents,
      shippingPriceCents: completed.shippingPriceCents,
      shippingWeightGrams: completed.shippingWeightGrams,
      shippingBillableWeightKg: completed.shippingBillableWeightKg,
      vatCents: completed.vatCents,
      confirmationEmailSent: completed.confirmationEmailSent,
    })
  } catch (error) {
    const status = /Zu viele Bestellanfragen/.test(error.message) ? 429 : 400
    return response.status(status).json({ error: error.message || 'Bestellanfrage konnte nicht angenommen werden.' })
  }
})

exports.listPublicOrders = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 20,
  secrets: [orderAdminToken],
}, async (request, response) => {
  if (request.method !== 'GET') return sendMethodError(response)
  if (!requireAdmin(request, response)) return

  try {
    const snapshot = await db.collection('publicOrders').orderBy('createdAt', 'desc').limit(100).get()
    const orders = snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .filter((order) => ['new', 'invoiced'].includes(order.status))
      .map((order) => ({ ...order, createdAt: order.createdAt?.toDate?.().toISOString() || '' }))
    return response.json({ orders })
  } catch {
    return response.status(500).json({ error: 'Bestellanfragen konnten nicht geladen werden.' })
  }
})

exports.listPublicInvoices = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 20,
  secrets: [orderAdminToken],
}, async (request, response) => {
  if (request.method !== 'GET') return sendMethodError(response)
  if (!requireAdmin(request, response)) return
  try {
    const snapshot = await db.collection('publicOrders').orderBy('createdAt', 'desc').limit(200).get()
    const invoices = snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .filter((order) => Boolean(order.invoiceNumber) && ['created', 'sent', 'email-failed'].includes(order.invoiceStatus))
      .map((order) => ({ ...order, createdAt: order.createdAt?.toDate?.().toISOString() || '' }))
    return response.json({ invoices })
  } catch {
    return response.status(500).json({ error: 'Automatische Rechnungen konnten nicht geladen werden.' })
  }
})

exports.markPublicOrderImported = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 20,
  secrets: [orderAdminToken],
}, async (request, response) => {
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireAdmin(request, response)) return
  const orderId = String(request.body?.orderId || '')
  if (!/^[A-Za-z0-9]{20}$/.test(orderId)) return response.status(400).json({ error: 'Bestell-ID ungültig.' })

  try {
    const ref = db.collection('publicOrders').doc(orderId)
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists || !['new', 'invoiced'].includes(snapshot.data().status)) return false
      const portalRef = db.collection('customerPortalOrders').doc(orderId)
      const portalSnapshot = await transaction.get(portalRef)
      if (!portalSnapshot.exists) {
        const order = snapshot.data()
        transaction.set(portalRef, {
          email: normalizeCustomerEmail(order.email),
          company: order.company || '',
          name: order.name || '',
          address: order.address || '',
          postalCode: order.postalCode || '',
          city: order.city || '',
          note: order.note || '',
          items: order.items || [],
          orderNumber: order.orderNumber || '',
          paymentMethod: order.paymentMethod || '',
          totalPriceCents: Number(order.totalPriceCents) || 0,
          shippingPriceCents: Number(order.shippingPriceCents) || 0,
          shippingWeightGrams: Number(order.shippingWeightGrams) || 0,
          shippingBillableWeightKg: Number(order.shippingBillableWeightKg) || 0,
          customerStatus: 'In Verkauf',
          portalCreatedAt: order.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        })
      }
      transaction.update(ref, {
        company: admin.firestore.FieldValue.delete(),
        name: admin.firestore.FieldValue.delete(),
        email: admin.firestore.FieldValue.delete(),
        address: admin.firestore.FieldValue.delete(),
        postalCode: admin.firestore.FieldValue.delete(),
        city: admin.firestore.FieldValue.delete(),
        note: admin.firestore.FieldValue.delete(),
        privacyConsent: admin.firestore.FieldValue.delete(),
        privacyNoticeAcknowledged: admin.firestore.FieldValue.delete(),
        privacyPolicyVersion: admin.firestore.FieldValue.delete(),
        items: admin.firestore.FieldValue.delete(),
        status: 'imported',
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
      return true
    })
    if (!result) return response.status(409).json({ error: 'Bestellung wurde bereits übernommen oder existiert nicht.' })
    await db.collection('customerPortalOrders').doc(orderId).set({
      customerStatus: 'In Verkauf',
      statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    return response.json({ success: true })
  } catch {
    return response.status(500).json({ error: 'Bestellung konnte nicht aktualisiert werden.' })
  }
})

exports.cleanupPublicOrderData = onSchedule({
  region,
  schedule: 'every day 03:00',
  timeZone: 'Europe/Berlin',
  maxInstances: 1,
}, async () => {
  const orderCutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 180 * 24 * 60 * 60 * 1000)
  const codeCutoff = admin.firestore.Timestamp.fromMillis(Date.now())
  const rateLimitCutoff = Date.now() - 24 * 60 * 60 * 1000
  const authRateLimitCutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000)

  for (const [collection, field, cutoff] of [
    ['publicOrders', 'createdAt', orderCutoff],
    ['customerPortalOrders', 'portalCreatedAt', orderCutoff],
    ['customerPortalCodes', 'expiresAt', codeCutoff],
    ['customerPortalAuthRateLimits', 'expiresAt', authRateLimitCutoff],
    ['publicOrderRateLimits', 'windowStart', rateLimitCutoff],
    ['publicShipmentTrackingRateLimits', 'windowStart', rateLimitCutoff],
    ['customerPortalCodeRateLimits', 'windowStart', rateLimitCutoff],
    ['publicShopAdminRateLimits', 'windowStart', rateLimitCutoff],
    ['webAppLoginRateLimits', 'windowStart', rateLimitCutoff],
    ['webAppSessions', 'expiresAt', admin.firestore.Timestamp.now()],
    ['webAppCallPresence', 'seenAt', admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 1000)],
    ['webAppCalls', 'expiresAt', admin.firestore.Timestamp.now()],
    ['brandContactRateLimits', 'windowStart', rateLimitCutoff],
  ]) {
    while (true) {
      const snapshot = await db.collection(collection).where(field, '<', cutoff).limit(400).get()
      if (snapshot.empty) break
      const batch = db.batch()
      snapshot.docs.forEach((document) => batch.delete(document.ref))
      await batch.commit()
      if (snapshot.size < 400) break
    }
  }
})

exports.getPublicShop = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 15,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'GET') return sendMethodError(response)
  const discountCode = String(request.query?.discountCode || '').trim()
  try {
    if (discountCode) {
      const subtotalCents = Number(request.query?.subtotalCents)
      const discount = calculateDiscount(discountCode, await readShopDiscountCodes(), subtotalCents)
      return response.json({ discount })
    }
    const [shop, stripeStatus, statsSnapshot, reviewsSnapshot] = await Promise.all([
      readShopConfig(),
      getStripeStatus(),
      db.collection('publicProductReviewStats').get(),
      db.collection('publicProductReviews').where('status', '==', 'approved').limit(200).get(),
    ])
    const customerSession = await getCustomerSession(request)
    const customerProfile = customerSession
      ? (await db.collection('customerProfiles').doc(customerEmailKey(customerSession.email)).get()).data() || {}
      : {}
    const businessApproved = customerProfile.businessStatus === 'approved'
    const businessPrices = businessApproved
      ? getCatalogBusinessPrices(shop.products, customerProfile.businessPrices || {})
      : {}
    const products = businessApproved
      ? applyBusinessPricing(shop.products, businessPrices)
      : shop.products
    const reviewStats = Object.fromEntries(statsSnapshot.docs.map((entry) => {
      const stats = entry.data()
      const count = Number(stats.count) || 0
      return [entry.id, { count, average: count ? Number(stats.ratingSum || 0) / count : 0 }]
    }))
    const reviews = reviewsSnapshot.docs.map((entry) => {
      const review = entry.data()
      return {
        id: entry.id,
        productId: String(review.productId || ''),
        productName: String(review.productName || ''),
        rating: Number(review.rating) || 0,
        comment: String(review.comment || ''),
        createdAt: review.createdAt?.toDate?.().toISOString?.() || '',
      }
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    return response.json({
      products: products.filter((product) => product.active),
      businessPricing: businessApproved
        ? { active: true, prices: businessPrices }
        : { active: false, prices: {} },
      reviewStats,
      reviews,
      settings: shop.settings,
      shippingReady: shop.products.filter((product) => product.active).length > 0
        && shop.products.filter((product) => product.active).every((product) => Number.isSafeInteger(product.unitWeightGrams) && product.unitWeightGrams > 0)
        && (shop.settings.shippingPricePerKgCents > 0 || shop.settings.shippingTiers?.length > 0),
      paymentMethods: [
        ...(shop.payment.accountHolder && shop.payment.iban ? ['vorkasse'] : []),
        ...(stripeStatus.enabled ? ['stripe'] : []),
        ...(shop.payment.paypalClientId ? ['paypal'] : []),
      ],
      paypalClientId: shop.payment.paypalClientId,
    })
  } catch (error) {
    if (discountCode) return response.status(400).json({ error: error.message || 'Rabattcode konnte nicht geprüft werden.' })
    return response.status(500).json({ error: 'Shop konnte nicht geladen werden.' })
  }
})

exports.customerProductReview = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 20,
}, async (request, response) => {
  setCors(request, response)
  response.set('Cache-Control', 'no-store')
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  const origin = String(request.get('origin') || '')
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Bewertungsanfrage nicht zulässig.' })

  const action = String(request.body?.action || '')
  const token = String(request.body?.token || '')
  if (!['details', 'submit'].includes(action) || !/^[a-f0-9]{64}$/.test(token)) {
    return response.status(400).json({ error: 'Bewertungslink ungültig.' })
  }
  try {
    const tokenHash = hashReviewToken(token)
    const { value } = await readCloudAppData('zyro-sales-documents')
    const document = (Array.isArray(value) ? value : []).find((entry) => entry.reviewTokenHash === tokenHash)
    const expiresAt = Date.parse(document?.reviewTokenExpiresAt || '')
    if (!document || !document.deliveryConfirmedAt || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return response.status(404).json({ error: 'Dieser Bewertungslink ist ungültig oder abgelaufen.' })
    }
    if (document.reviewRequestStatus === 'submitted') {
      return action === 'details'
        ? response.json({ alreadySubmitted: true })
        : response.status(409).json({ error: 'Für diese Bestellung wurde bereits eine Bewertung abgegeben.' })
    }
    if (document.reviewRequestStatus !== 'sent') {
      return response.status(404).json({ error: 'Dieser Bewertungslink ist ungültig oder abgelaufen.' })
    }
    const products = Array.isArray(document.reviewProducts) ? document.reviewProducts : []
    if (action === 'details') {
      return response.json({
        orderNumber: String(document.number || ''),
        products: products.map(({ id, name }) => ({ id: String(id), name: String(name) })),
      })
    }
    const review = validateReviewSubmission({
      productId: request.body?.productId,
      rating: request.body?.rating,
      comment: request.body?.comment,
      consent: request.body?.consent,
      products,
    })
    const selectedProduct = products.find((product) => product.id === review.productId)
    const reviewRef = db.collection('publicProductReviews').doc(tokenHash)
    const alreadyStored = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(reviewRef)
      const persistenceState = getReviewPersistenceState(existing.exists ? existing.data() : null, review)
      if (persistenceState === 'conflict') {
        throw mdeError('Für diese Bestellung wurde bereits eine Bewertung abgegeben.', 409)
      }
      if (persistenceState === 'existing') return true
      transaction.create(reviewRef, {
        productId: review.productId,
        productName: String(selectedProduct.name).slice(0, 100),
        orderNumber: String(document.number || '').slice(0, 80),
        rating: review.rating,
        comment: review.comment,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return false
    })
    await runMdeCloudUpdate(['zyro-sales-documents'], ({ 'zyro-sales-documents': salesDocuments }) => {
      const current = salesDocuments.find((entry) => entry.reviewTokenHash === tokenHash)
      if (!current || !['sent', 'submitted'].includes(current.reviewRequestStatus)) {
        throw mdeError('Diese Bewertung wurde bereits verarbeitet.', 409)
      }
      if (current.reviewRequestStatus !== 'submitted') {
        current.reviewRequestStatus = 'submitted'
        current.reviewSubmittedAt = new Date().toISOString()
      }
      return { salesDocuments }
    })
    return response.json({ submitted: true, pendingModeration: true, alreadySubmitted: alreadyStored })
  } catch (error) {
    if (error.statusCode === 409) return response.status(409).json({ error: error.message })
    if (/Bitte ein Produkt|Bitte eine Bewertung|Bewertungstext|Veröffentlichung/.test(error.message)) {
      return response.status(400).json({ error: error.message })
    }
    console.error('Kundenbewertung konnte nicht gespeichert werden:', error.message)
    return response.status(500).json({ error: 'Bewertung konnte nicht gespeichert werden. Bitte später erneut versuchen.' })
  }
})

exports.managePublicShop = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 60,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (!['GET', 'POST'].includes(request.method)) return sendMethodError(response)
  if (!requireAdmin(request, response)) return
  try {
    if (request.method === 'GET') {
      const [shop, mail] = await Promise.all([readShopConfig({ includeDesktop: false }), getMailSettings()])
      return response.json({ ...shop, mail })
    }
    if (request.body?.action === 'testMail') {
      const email = normalizeCustomerEmail(request.body.email)
      if (!email) return response.status(400).json({ error: 'Test-E-Mail-Adresse ungültig.' })
      if (request.body.mail) await saveMailSettings(request.body.mail)
      try {
        await sendShopEmail({
          to: email,
          subject: 'ZYRO SMTP-Testmail',
          text: 'Der SMTP-Mailversand für deinen ZYRO-Shop ist eingerichtet.',
          html: '<p>Der SMTP-Mailversand für deinen ZYRO-Shop ist eingerichtet.</p>',
        })
        return response.json({ success: true })
      } catch (error) {
        return response.status(502).json({ error: getSmtpTestFailureMessage(error) })
      }
    }
    const config = cleanShopConfig(request.body)
    const mail = await saveMailSettings(request.body?.mail)
    await db.collection('publicShop').doc('config').set(config)
    return response.json({ success: true, mail })
  } catch (error) {
    return response.status(400).json({ error: error.message || 'Shop-Einstellungen konnten nicht gespeichert werden.' })
  }
})

exports.manageBrandMail = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 60,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (!['GET', 'POST'].includes(request.method)) return sendMethodError(response)
  if (!requireAdmin(request, response)) return

  if (request.method === 'GET') {
    try {
      return response.json({ mail: await getMailSettings(), stripe: await getStripeStatus() })
    } catch (error) {
      console.error('SMTP-Einstellungen konnten nicht geladen werden:', error.message)
      return response.status(500).json({ error: 'SMTP-Einstellungen konnten nicht geladen werden.' })
    }
  }

  if (request.body?.action === 'saveStripe') {
    try {
      return response.json({ success: true, stripe: await saveStripeConfig(request.body) })
    } catch (error) {
      return response.status(400).json({ error: error.message || 'Stripe-Daten konnten nicht gespeichert werden.' })
    }
  }

  if (request.body?.action === 'testMail') {
    const email = normalizeCustomerEmail(request.body.email)
    if (!email) return response.status(400).json({ error: 'Test-E-Mail-Adresse ungültig.' })
    try {
      await saveMailSettings(request.body.mail)
    } catch (error) {
      return response.status(400).json({ error: error.message || 'SMTP-Einstellungen konnten nicht gespeichert werden.' })
    }
    try {
      await sendShopEmail({
        to: email,
        subject: 'ZYRO SMTP-Testmail',
        text: 'Der SMTP-Mailversand für das ZYRO-Kontaktformular ist eingerichtet.',
        html: '<p>Der SMTP-Mailversand für das ZYRO-Kontaktformular ist eingerichtet.</p>',
      })
      return response.json({ success: true, mail: await getMailSettings() })
    } catch (error) {
      return response.status(502).json({ error: getSmtpTestFailureMessage(error) })
    }
  }

  try {
    const mail = await saveMailSettings(request.body?.mail)
    return response.json({ success: true, mail })
  } catch (error) {
    return response.status(400).json({ error: error.message || 'SMTP-Einstellungen konnten nicht gespeichert werden.' })
  }
})

exports.manageMailbox = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 60,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireRootAdmin(request, response)) return
  if (Buffer.byteLength(JSON.stringify(request.body || {})) > 512 * 1024) {
    return response.status(413).json({ error: 'Die Postfachanfrage ist zu groß.' })
  }
  const mailbox = require('./mailbox.cjs')

  const readConfig = async () => {
    const snapshot = await mailboxConfigRef.get()
    if (!snapshot.exists || !snapshot.data()?.passwordCiphertext) return null
    const stored = snapshot.data()
    return { ...stored, password: decryptMailPassword(stored) }
  }
  const publicConfig = (config) => {
    if (!config) return { configured: false, ...mailbox.defaults, password: '' }
    const { password: _password, passwordCiphertext: _ciphertext, passwordIv: _iv, passwordTag: _tag, updatedAt: _updatedAt, ...settings } = config
    return { configured: true, ...settings, password: '' }
  }

  try {
    const action = String(request.body?.action || '')
    if (action === 'settings') return response.json(publicConfig(await readConfig()))
    if (action === 'remove') {
      await mailboxConfigRef.delete()
      return response.json({ configured: false })
    }
    if (action === 'save') {
      const input = request.body?.config
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return response.status(400).json({ error: 'Postfach-Einstellungen ungültig.' })
      }
      const previous = await readConfig()
      const config = mailbox.normalizeConfig({ ...input, password: input.password || previous?.password })
      await mailbox.testConnection(config)
      const { password, ...settings } = config
      await mailboxConfigRef.set({
        ...settings,
        ...encryptMailPassword(password),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return response.json({ configured: true, ...settings, password: '' })
    }

    const config = await readConfig()
    if (!config) return response.status(400).json({ error: 'Postfach ist noch nicht eingerichtet.' })
    if (action === 'list-folders') {
      const folders = await mailbox.listFolders(config)
      return response.json({ folders })
    }
    const folder = typeof request.body?.folder === 'string' ? request.body.folder.slice(0, 255) : 'inbox'
    if (action === 'list') {
      const result = await mailbox.listMessages(config, { folder, limit: request.body?.limit })
      return response.json(result)
    }
    if (action === 'read') {
      const result = await mailbox.readMessage(config, { folder, uid: request.body?.uid })
      return response.json(result)
    }
    if (action === 'delete') {
      const result = await mailbox.deleteMessage(config, { folder, uid: request.body?.uid })
      return response.json(result)
    }
    if (action === 'move') {
      const result = await mailbox.moveMessage(config, {
        folder,
        toFolder: String(request.body?.toFolder || '').slice(0, 255),
        uid: request.body?.uid,
      })
      return response.json(result)
    }
    if (action === 'send') {
      const result = await mailbox.sendMessage(config, request.body?.message || {})
      return response.json(result)
    }
    return response.status(400).json({ error: 'Postfach-Aktion ungültig.' })
  } catch (error) {
    console.error('Cloud-Postfach fehlgeschlagen:', error.message)
    const status = /Anmeldung abgelehnt/.test(error.message) ? 502 : 400
    return response.status(status).json({ error: error.message || 'Postfach konnte nicht verarbeitet werden.' })
  }
})

exports.stripeWebhook = onRequest({
  region,
  cors: false,
  maxInstances: 5,
  timeoutSeconds: 60,
  secrets: [orderAdminToken],
}, async (request, response) => {
  if (request.method !== 'POST') return sendMethodError(response)
  try {
    const stripe = await getStripeConfig()
    if (!stripe?.webhookSecret || !verifyStripeSignature(request.rawBody?.toString('utf8'), request.get('stripe-signature'), stripe.webhookSecret)) {
      return response.status(400).json({ error: 'Ungültige Signatur.' })
    }
    const event = request.body
    const session = event?.data?.object
    const orderId = String(session?.metadata?.orderId || '')
    const paid = event?.type === 'checkout.session.completed' && session?.payment_status === 'paid'
      || event?.type === 'checkout.session.async_payment_succeeded'
    if (!paid || !/^[A-Za-z0-9]{10,40}$/.test(orderId)) return response.json({ received: true })
    const orderRef = db.collection('publicOrders').doc(orderId)
    const snapshot = await orderRef.get()
    if (!snapshot.exists) return response.json({ received: true })
    const order = snapshot.data()
    if (order.paymentStatus === 'paid' && !order.confirmationEmailStatus) return response.json({ received: true })
    if (order.paymentStatus !== 'paid') {
      await Promise.all([
        orderRef.update({ paymentStatus: 'paid', stripeSessionId: String(session.id || '') }),
        db.collection('customerPortalOrders').doc(orderId).update({ paymentStatus: 'paid', customerStatus: 'Zahlung erhalten' }),
      ])
      await syncOrderToDesktop(orderId, order, 'paid')
    }
    if (order.confirmationEmailStatus === 'sent') return response.json({ received: true })
    try {
      const shop = await readShopConfig()
      const paymentInfo = { accountHolder: shop.payment.accountHolder, iban: shop.payment.iban, reference: order.orderNumber }
      const mail = buildOrderConfirmationEmail({ order: { ...order, paymentStatus: 'paid' }, orderNumber: order.orderNumber, paymentInfo })
      await sendShopEmail({ to: order.email, subject: `Bestellbestätigung ${order.orderNumber} · ZYRO`, ...mail })
    } catch (emailError) {
      console.error('Bestätigung nach Zahlung nicht versendet:', emailError.message)
      const emailStatus = {
        confirmationEmailStatus: 'failed',
        confirmationEmailError: String('Bestätigung nach Zahlung konnte nicht gesendet werden.').slice(0, 300),
        confirmationEmailAttempts: Number(order.confirmationEmailAttempts || 0) + 1,
      }
      await Promise.all([
        orderRef.set(emailStatus, { merge: true }),
        db.collection('customerPortalOrders').doc(orderId).set(emailStatus, { merge: true }),
      ]).catch((statusError) => console.error('Fehlerstatus für Bestellbestätigung konnte nicht gespeichert werden:', statusError.message))
      return response.status(500).json({ error: 'Bestellbestätigung konnte nicht gesendet werden.' })
    }
    const emailStatus = {
      confirmationEmailStatus: 'sent',
      confirmationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmationEmailError: '',
      confirmationEmailAttempts: Number(order.confirmationEmailAttempts || 0) + 1,
    }
    await orderRef.set(emailStatus, { merge: true })
    await db.collection('customerPortalOrders').doc(orderId).set(emailStatus, { merge: true })
    return response.json({ received: true })
  } catch (error) {
    console.error('Stripe-Webhook Fehler:', error.message)
    return response.status(500).json({ error: 'Webhook-Fehler.' })
  }
})

exports.sendPublicInvoiceEmail = onRequest({
  region,
  cors: false,
  maxInstances: 3,
  timeoutSeconds: 30,
  secrets: [orderAdminToken],
}, async (request, response) => {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method !== 'POST') return sendMethodError(response)
  if (!requireAdmin(request, response)) return
  const email = normalizeCustomerEmail(request.body?.email)
  const invoiceNumber = String(request.body?.invoiceNumber || '').trim()
  const documentKinds = { rechnung: 'Rechnung', angebot: 'Angebot', kundenauftrag: 'Auftragsbestätigung' }
  const documentKind = String(request.body?.kind || 'rechnung')
  const documentLabel = documentKinds[documentKind]
  if (!documentLabel) return response.status(400).json({ error: 'Dokumenttyp ungültig.' })
  const isInvoice = documentKind === 'rechnung'
  const pdfBase64 = String(request.body?.pdfBase64 || '')
  if (!email || !/^[A-Za-z0-9-]{1,40}$/.test(invoiceNumber) || pdfBase64.length > 7 * 1024 * 1024) {
    return response.status(400).json({ error: 'Empfänger, Dokumentnummer oder PDF ungültig.' })
  }
  const pdf = Buffer.from(pdfBase64, 'base64')
  if (pdf.length < 5 || pdf.length > 5 * 1024 * 1024 || pdf.subarray(0, 4).toString() !== '%PDF') {
    return response.status(400).json({ error: 'Die Datei ist kein gültiges PDF.' })
  }
  const portalOrderId = isInvoice ? String(request.body?.portalOrderId || '') : ''
  let portalOrderRef
  if (portalOrderId) {
    if (!/^[A-Za-z0-9]{20}$/.test(portalOrderId) || pdf.length > 700 * 1024) {
      return response.status(400).json({ error: 'Portal-Bestellung oder Rechnungsdatei ungültig.' })
    }
    portalOrderRef = db.collection('customerPortalOrders').doc(portalOrderId)
    const portalOrder = await portalOrderRef.get()
    if (!portalOrder.exists || portalOrder.data().email !== email) {
      return response.status(403).json({ error: 'Rechnung und Kundenbestellung gehören nicht zusammen.' })
    }
  }
  if (portalOrderRef) {
    await portalOrderRef.set({
      invoice: { number: invoiceNumber, contentBase64: pdf.toString('base64'), sentAt: admin.firestore.FieldValue.serverTimestamp() },
    }, { merge: true })
  }
  // Jede Rechnung ist im Kundenportal unter der Kunden-E-Mail abrufbar, auch ohne zugeordnete Shop-Bestellung.
  const portalInvoiceRef = isInvoice && pdf.length <= 700 * 1024
    ? db.collection('customerPortalInvoices').doc(`${customerEmailKey(email).slice(0, 24)}_${invoiceNumber}`)
    : null
  if (portalInvoiceRef) {
    await portalInvoiceRef.set({
      email,
      number: invoiceNumber,
      contentBase64: pdf.toString('base64'),
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
  if (request.body?.publishOnly === true) {
    if (!portalInvoiceRef) return response.status(400).json({ error: 'Nur Rechnungen bis 700 KB können im Kundenportal bereitgestellt werden.' })
    return response.json({ published: true })
  }
  try {
    const recipientName = String(request.body?.recipientName || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || email
    const inquirySubject = `${documentLabel} ${invoiceNumber}`
    const existing = await brandContactMessagesRef.where('documentNumber', '==', invoiceNumber).limit(1).get()
    const inquiryRef = existing.empty ? brandContactMessagesRef.doc() : existing.docs[0].ref
    const accessToken = existing.empty ? createInquiryAccessToken() : existing.docs[0].data().accessToken || createInquiryAccessToken()
    const replyLink = buildInquiryLink(inquiryRef.id, accessToken)
    await sendShopEmail({
      to: email,
      subject: `${documentLabel} ${invoiceNumber} · ZYRO`,
      replyTo: await getInquiryNotifyEmail(),
      text: `Guten Tag,\n\nanbei erhalten Sie ${isInvoice ? 'die' : 'das'} ${documentLabel} ${invoiceNumber} als PDF.\n\nRückfragen können Sie direkt hier stellen:\n${replyLink}\n\n${signatureText}`,
      html: `<p>Guten Tag,</p><p>anbei erhalten Sie ${isInvoice ? 'die' : 'das'} ${documentLabel} <strong>${escapeHtml(invoiceNumber)}</strong> als PDF.</p><p><a href="${escapeHtml(replyLink)}">Rückfragen oder Antwort senden</a></p>${signatureHtml}`,
      attachment: { filename: `${invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' },
    })
    const now = admin.firestore.Timestamp.now()
    const entry = { from: 'team', text: `${documentLabel} ${invoiceNumber} wurde per E-Mail gesendet (PDF im Anhang).`, at: now }
    if (existing.empty) {
      await inquiryRef.set({
        name: recipientName,
        email,
        subject: inquirySubject,
        message: entry.text,
        documentNumber: invoiceNumber,
        status: 'replied',
        createdAt: now,
        lastMessageAt: now,
        accessToken,
        thread: [entry],
      }).catch((error) => console.error('Anfrage-Verlauf zum Beleg nicht angelegt:', error.message))
    } else {
      const current = existing.docs[0].data()
      const thread = Array.isArray(current.thread) ? current.thread : buildInquiryThread(current).map((item) => ({
        from: item.from,
        text: item.text,
        at: item.at ? admin.firestore.Timestamp.fromDate(new Date(item.at)) : now,
      }))
      await inquiryRef.update({ thread: [...thread, entry], status: 'replied', lastMessageAt: now, accessToken })
        .catch((error) => console.error('Anfrage-Verlauf zum Beleg nicht aktualisiert:', error.message))
    }
    return response.json({ sent: true, portalLinked: Boolean(portalOrderRef) })
  } catch (error) {
    console.error('Rechnung konnte nicht versendet werden:', error.message)
    if (portalOrderRef) {
      await portalOrderRef.set({ invoice: admin.firestore.FieldValue.delete() }, { merge: true }).catch(() => {})
    }
    if (portalInvoiceRef) await portalInvoiceRef.delete().catch(() => {})
    return response.status(502).json({ error: describeSmtpFailure(error) })
  }
})
