const PDFDocument = require('pdfkit')
const { defaultCompanyDetails, normalizeCompanyDetails } = require('./company-details.cjs')

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100
const euro = (value) => `${round2(value).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const germanDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE') : '')

const getItems = (document) => (Array.isArray(document.items) && document.items.length ? document.items : [{
  productName: document.productName || 'Artikel',
  productSku: document.productSku || '',
  description: document.description || '',
  quantity: document.quantity || 1,
  unitPrice: document.unitPrice || 0,
}])

const calculateInvoiceTotals = (document, products = []) => {
  const items = getItems(document)
  const vatRate = Number(document.vatRate) || 0
  const itemsNet = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0)
  const webNet = Number(document.websiteInvoiceTotals?.netTotal)
  const webTax = Number(document.websiteInvoiceTotals?.taxTotal)
  const webGross = Number(document.websiteInvoiceTotals?.grossTotal)
  const hasWebTotals = [webNet, webTax, webGross].every(Number.isFinite)
  const netTotal = hasWebTotals ? webNet : itemsNet
  const taxTotal = hasWebTotals ? webTax : netTotal * vatRate / 100
  const grossTotal = hasWebTotals ? webGross : netTotal + taxTotal
  const depositTotal = items.reduce((sum, item) => {
    const product = products.find((entry) => String(entry.id) === String(item.productId))
      || products.find((entry) => item.productSku && entry.sku === item.productSku)
    return sum + (Number(item.quantity) || 0) * (Number(product?.depositPerUnit) || 0)
  }, 0)
  return {
    itemsNet: round2(itemsNet),
    extraNet: round2(Math.max(0, netTotal - itemsNet)),
    netTotal: round2(netTotal),
    taxTotal: round2(taxTotal),
    grossTotal: round2(grossTotal),
    depositTotal: round2(depositTotal),
    payableTotal: round2(grossTotal + depositTotal),
    vatRate,
  }
}

// Erzeugt aus einem Kundenauftrag eine Rechnung; pro Auftrag höchstens eine.
const createInvoiceFromOrder = ({ order, documents, responsibleName = 'Scanner', today = new Date() }) => {
  if (order.invoiceDocumentId) {
    const existing = documents.find((entry) => String(entry.id) === String(order.invoiceDocumentId))
    if (existing) return { invoice: existing, created: false }
  }
  const documentDate = today.toISOString().slice(0, 10)
  const year = documentDate.slice(0, 4)
  const lastNumber = documents
    .filter((entry) => entry.kind === 'rechnung')
    .reduce((highest, entry) => Math.max(highest, Number(String(entry.number || '').split('-').at(-1)) || 0), 0)
  const number = `RE-${year}-${String(lastNumber + 1).padStart(4, '0')}`
  const due = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const paid = order.paymentStatus === 'paid'
  const invoice = {
    id: `inv-${order.id}`,
    kind: 'rechnung',
    number,
    relatedOrderId: order.relatedOrderId || '',
    sourceOrderId: String(order.id),
    customerId: order.customerId || '',
    lotNumber: '',
    recipient: order.billingRecipient || order.recipient || '',
    recipientEmail: order.billingEmail || order.recipientEmail || '',
    recipientAddress: order.billingAddress || order.recipientAddress || '',
    recipientVatId: order.customerVatId || '',
    items: getItems(order).map((item) => ({ ...item })),
    productId: order.productId ?? '',
    productName: order.productName ?? '',
    productSku: order.productSku ?? '',
    productCategory: order.productCategory ?? '',
    productVolume: order.productVolume ?? '',
    description: order.description || '',
    quantity: order.quantity ?? 1,
    unitPrice: order.unitPrice ?? 0,
    paymentReference: number,
    paymentMethod: order.paymentMethod || 'Vorkasse',
    paymentStatus: paid ? 'paid' : 'pending',
    shippingMethod: order.shippingMethod || '',
    responsibleName,
    vatRate: Number(order.vatRate) || 19,
    documentDate,
    dueDate: due,
    notes: `Automatisch beim Verpacken erstellt zu Auftrag ${order.number || order.id}${paid ? ' · BEZAHLT' : ''}`,
    ...(order.websiteInvoiceTotals ? { websiteInvoiceTotals: order.websiteInvoiceTotals } : {}),
    source: 'auto-pack',
    status: 'Offen',
  }
  return { invoice, created: true }
}

const buildInvoicePdf = (invoice, products = [], companyInput = defaultCompanyDetails) => new Promise((resolve, reject) => {
  const company = normalizeCompanyDetails(companyInput)
  const accentColor = {
    zyro: '#9c562f',
    modern: '#156b83',
    classic: '#283b52',
  }[company.documentLayout] || '#9c562f'
  const totals = calculateInvoiceTotals(invoice, products)
  const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Rechnung ${invoice.number}`, Author: company.name } })
  const chunks = []
  pdf.on('data', (chunk) => chunks.push(chunk))
  pdf.on('end', () => resolve(Buffer.concat(chunks)))
  pdf.on('error', reject)

  pdf.font('Helvetica-Bold').fontSize(20).fillColor(accentColor).text('ZYRO', 48, 48)
  pdf.font('Helvetica').fontSize(8).fillColor('#343a3b').text(company.name.toUpperCase())
  pdf.moveTo(48, 84).lineTo(547, 84).strokeColor(accentColor).lineWidth(2).stroke()
  pdf.fontSize(9).fillColor('#4b5354').text(`${company.name} · ${company.street} · ${company.postalCode} ${company.city} · ${company.country}`, 48, 96)
  pdf.font('Helvetica-Bold').fontSize(11).fillColor('#202628').text(invoice.recipient || '', 48, 118)
  pdf.font('Helvetica').fontSize(10).text(invoice.recipientAddress || '', { width: 240 })
  if (invoice.recipientVatId) {
    pdf.font('Helvetica').fontSize(9).text(`USt-IdNr.: ${invoice.recipientVatId}`, { width: 240 })
  }

  pdf.font('Helvetica-Bold').fontSize(22).fillColor(accentColor).text('Rechnung', 330, 48, { width: 217, align: 'right' })
  pdf.font('Helvetica').fontSize(10).fillColor('#202628')
  pdf.text(`Rechnungsnummer: ${invoice.number}`, 330, 82, { width: 217, align: 'right' })
  pdf.text(`Rechnungsdatum: ${germanDate(invoice.documentDate)}`, { width: 217, align: 'right' })
  if (invoice.dueDate) pdf.text(`Fällig am: ${germanDate(invoice.dueDate)}`, { width: 217, align: 'right' })
  pdf.text(`Zahlungsart: ${invoice.paymentMethod || ''}`, { width: 217, align: 'right' })

  let y = 215
  const drawRow = (cells, bold = false) => {
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(bold ? accentColor : '#202628')
    const positions = [48, 80, 300, 360, 450]
    const widths = [28, 215, 55, 85, 97]
    const heights = cells.map((cell, index) => pdf.heightOfString(String(cell), { width: widths[index] }))
    const rowHeight = Math.max(...heights) + 6
    if (y + rowHeight > 740) {
      pdf.addPage()
      y = 60
    }
    cells.forEach((cell, index) => pdf.text(String(cell), positions[index], y, { width: widths[index], align: index >= 2 ? 'right' : 'left' }))
    y += rowHeight
    pdf.moveTo(48, y - 2).lineTo(547, y - 2).strokeColor('#d4d9d9').lineWidth(0.5).stroke()
  }
  drawRow(['Pos.', 'Beschreibung', 'Menge', 'Einzel (netto)', 'Netto'], true)
  getItems(invoice).forEach((item, index) => {
    const quantity = Number(item.quantity) || 0
    const unit = Number(item.unitPrice) || 0
    drawRow([index + 1, item.description || item.productName || 'Artikel', quantity, euro(unit), euro(quantity * unit)])
  })
  if (totals.extraNet > 0) drawRow(['', 'Versand und weitere Positionen', '', '', euro(totals.extraNet)])

  if (y > 650) {
    pdf.addPage()
    y = 60
  }
  y += 10
  const totalLine = (label, value, bold = false) => {
    pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fillColor('#202628')
    pdf.text(label, 330, y, { width: 120 })
    pdf.text(euro(value), 450, y, { width: 97, align: 'right' })
    y += bold ? 18 : 15
  }
  totalLine('Nettobetrag', totals.netTotal)
  totalLine(`Umsatzsteuer ${totals.vatRate} %`, totals.taxTotal)
  totalLine('Rechnungsbetrag brutto', totals.grossTotal, true)
  if (totals.depositTotal > 0) {
    totalLine('Pfand (nicht steuerbar)', totals.depositTotal)
    totalLine('Zu zahlen', totals.payableTotal, true)
  }
  if (invoice.paymentStatus === 'paid') {
    pdf.font('Helvetica-Bold').fontSize(10).fillColor('#2e7d32').text('Der Betrag wurde bereits bezahlt.', 48, y + 6)
  } else {
    pdf.font('Helvetica').fontSize(10).fillColor('#202628')
      .text(`Bitte überweisen Sie ${euro(totals.payableTotal)} unter Angabe von „${invoice.paymentReference || invoice.number}“${company.iban ? ` auf IBAN ${company.iban}.` : '.'}`, 48, y + 6, { width: 499 })
  }

  const legalDetails = [
    company.managingDirectors && `Geschäftsführer: ${company.managingDirectors}`,
    company.legalForm && `Rechtsform: ${company.legalForm}`,
    company.registeredOffice && `Sitz: ${company.registeredOffice}`,
    company.commercialRegister && `Handelsregister: ${company.commercialRegister}`,
    company.registrationCourt && `Registergericht: ${company.registrationCourt}`,
  ].filter(Boolean).join(' · ')
  pdf.font('Helvetica').fontSize(7).fillColor('#53595a')
    .text([
      `${company.name} · ${company.street}, ${company.postalCode} ${company.city}, ${company.country}`,
      [company.email, company.phone, company.website].filter(Boolean).join(' · '),
      [company.taxNumber && `Steuernummer ${company.taxNumber}`, company.vatId && `USt-IdNr. ${company.vatId}`, company.iban && `IBAN ${company.iban}`].filter(Boolean).join(' · '),
      legalDetails,
    ].filter(Boolean).join('\n'), 48, 728, { width: 499, align: 'center', lineGap: 2 })
  pdf.end()
})

module.exports = { buildInvoicePdf, calculateInvoiceTotals, createInvoiceFromOrder }
