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
    orderNumber: order.number || '',
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
    paymentMethod: order.paymentMethod === 'paypal'
      ? 'PayPal'
      : order.paymentMethod === 'stripe' ? 'Online (Stripe)' : order.paymentMethod || 'Vorkasse',
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

const formatIban = (iban) => String(iban || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()

// Zerlegt die Positionsbeschreibung in Artikelname und eine ruhige Detailzeile.
const describeItem = (item) => {
  const name = String(item.productName || '').trim()
  const parts = String(item.description || '').split('·').map((part) => part.trim()).filter(Boolean)
  const title = name || parts[0] || 'Artikel'
  const details = parts.filter((part) => part !== title && part !== item.productSku)
  if (item.productSku) details.unshift(`Art.-Nr. ${item.productSku}`)
  return { title, details: [...new Set(details)].join(' · ') }
}

const buildInvoicePdf = (invoice, products = [], companyInput = defaultCompanyDetails) => new Promise((resolve, reject) => {
  const company = normalizeCompanyDetails(companyInput)
  const accent = {
    zyro: '#7a4528',
    modern: '#156b83',
    classic: '#283b52',
  }[company.documentLayout] || '#7a4528'
  const ink = '#1f1a16'
  const muted = '#6f655c'
  const line = '#e4ddd4'
  const tint = '#f6f1ea'
  const totals = calculateInvoiceTotals(invoice, products)
  const pdf = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 40, left: 56, right: 56 }, bufferPages: true, info: { Title: `Rechnung ${invoice.number}`, Author: company.name } })
  const chunks = []
  pdf.on('data', (chunk) => chunks.push(chunk))
  pdf.on('end', () => resolve(Buffer.concat(chunks)))
  pdf.on('error', reject)

  const left = 56
  const right = 539
  const width = right - left
  const contentBottom = 728
  const orderNumber = invoice.orderNumber || (String(invoice.notes || '').match(/Auftrag\s+(\S+)/) || [])[1] || ''

  const text = (value, x, y, options = {}, style = {}) => {
    pdf.font(style.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(style.size || 9).fillColor(style.color || ink)
    pdf.text(String(value ?? ''), x, y, { lineBreak: options.width !== undefined, ...options })
  }

  // Kopf: Marke links, Absender rechts
  text('ZYRO', left, 48, {}, { bold: true, size: 26, color: accent })
  text(company.name, left, 80, {}, { size: 8, color: muted })
  const headerLines = [company.name, company.street, `${company.postalCode} ${company.city}`, company.email, company.website.replace(/^https?:\/\//, '')].filter(Boolean)
  headerLines.forEach((entry, index) => text(entry, 339, 50 + index * 11, { width: 200, align: 'right' }, { size: 8, bold: index === 0, color: index === 0 ? ink : muted }))
  pdf.moveTo(left, 112).lineTo(right, 112).lineWidth(1.5).strokeColor(accent).stroke()

  // Anschriftfeld (DIN 5008) und Rechnungsdaten
  text(`${company.name} · ${company.street} · ${company.postalCode} ${company.city}`, left, 132, { width: 250 }, { size: 6.5, color: muted })
  pdf.moveTo(left, 142).lineTo(left + 250, 142).lineWidth(0.4).strokeColor(line).stroke()
  text(invoice.recipient || '', left, 150, { width: 250 }, { bold: true, size: 10.5 })
  text(invoice.recipientAddress || '', left, pdf.y + 2, { width: 250, lineGap: 1.5 }, { size: 10 })

  const meta = [
    ['Rechnungsnummer', invoice.number],
    ['Rechnungsdatum', germanDate(invoice.documentDate)],
    invoice.dueDate && invoice.paymentStatus !== 'paid' ? ['Zahlbar bis', germanDate(invoice.dueDate)] : null,
    orderNumber ? ['Auftrag', orderNumber] : null,
    ['Zahlungsart', invoice.paymentMethod || '–'],
    invoice.recipientVatId ? ['Ihre USt-IdNr.', invoice.recipientVatId] : null,
  ].filter(Boolean)
  const metaX = 345
  const metaY = 132
  pdf.roundedRect(metaX - 10, metaY - 8, right - metaX + 10, meta.length * 16 + 12, 6).fillColor(tint).fill()
  meta.forEach(([label, value], index) => {
    const y = metaY + index * 16
    text(label, metaX, y, { width: 90 }, { size: 8.5, color: muted })
    text(value, metaX + 90, y, { width: right - metaX - 98, align: 'right' }, { size: 8.5, bold: index === 0 })
  })

  // Titel
  let y = Math.max(pdf.y, metaY + meta.length * 16 + 10) + 34
  y = Math.max(y, 268)
  text(`Rechnung ${invoice.number}`, left, y, {}, { bold: true, size: 17 })
  y += 26
  text(invoice.paymentStatus === 'paid'
    ? 'Vielen Dank für Ihre Bestellung. Wir stellen Ihnen folgende Leistungen in Rechnung – der Betrag ist bereits bezahlt.'
    : 'Vielen Dank für Ihre Bestellung. Wir stellen Ihnen folgende Leistungen in Rechnung:', left, y, { width }, { size: 9.5, color: muted })
  y = pdf.y + 16

  // Positionstabelle
  const columns = [
    { key: 'pos', label: 'Pos.', x: left + 8, width: 24, align: 'left' },
    { key: 'item', label: 'Artikel', x: left + 36, width: 222, align: 'left' },
    { key: 'qty', label: 'Menge', x: left + 262, width: 46, align: 'right' },
    { key: 'unit', label: 'Einzelpreis', x: left + 312, width: 70, align: 'right' },
    { key: 'vat', label: 'USt.', x: left + 386, width: 30, align: 'right' },
    { key: 'sum', label: 'Gesamt', x: left + 420, width: width - 428, align: 'right' },
  ]
  const drawTableHeader = () => {
    pdf.rect(left, y, width, 22).fillColor(accent).fill()
    columns.forEach((column) => text(column.label, column.x, y + 7, { width: column.width, align: column.align }, { bold: true, size: 8.5, color: '#ffffff' }))
    y += 22
  }
  const ensureSpace = (height, repeatHeader = false) => {
    if (y + height <= contentBottom) return
    pdf.addPage()
    y = 60
    if (repeatHeader) drawTableHeader()
  }
  drawTableHeader()
  const rows = getItems(invoice).map((item, index) => {
    const quantity = Number(item.quantity) || 0
    const unit = Number(item.unitPrice) || 0
    return { index: index + 1, ...describeItem(item), quantity, unit, sum: quantity * unit }
  })
  // Hat der Beleg schon eine Versandposition, bleibt nur ein möglicher Rundungsrest übrig.
  const hasShippingLine = getItems(invoice).some((item) => item?.isShipping === true || String(item?.productCategory || '').trim().toLowerCase() === 'versand')
  if (totals.extraNet > (hasShippingLine ? 0.05 : 0)) rows.push({ index: rows.length + 1, title: hasShippingLine ? 'Sonstiges' : 'Versand', details: hasShippingLine ? '' : invoice.shippingMethod || '', quantity: 1, unit: totals.extraNet, sum: totals.extraNet })
  rows.forEach((row, rowIndex) => {
    pdf.font('Helvetica-Bold').fontSize(9.5)
    const titleHeight = pdf.heightOfString(row.title, { width: columns[1].width })
    pdf.font('Helvetica').fontSize(7.5)
    const detailHeight = row.details ? pdf.heightOfString(row.details, { width: columns[1].width }) + 2 : 0
    const rowHeight = Math.max(titleHeight + detailHeight, 12) + 14
    ensureSpace(rowHeight, true)
    if (rowIndex % 2 === 1) pdf.rect(left, y, width, rowHeight).fillColor(tint).fill()
    const top = y + 7
    text(row.index, columns[0].x, top, { width: columns[0].width }, { size: 9, color: muted })
    text(row.title, columns[1].x, top, { width: columns[1].width }, { bold: true, size: 9.5 })
    if (row.details) text(row.details, columns[1].x, top + titleHeight + 2, { width: columns[1].width }, { size: 7.5, color: muted })
    text(row.quantity.toLocaleString('de-DE'), columns[2].x, top, { width: columns[2].width, align: 'right' }, { size: 9.5 })
    text(euro(row.unit), columns[3].x, top, { width: columns[3].width, align: 'right' }, { size: 9.5 })
    text(`${totals.vatRate} %`, columns[4].x, top, { width: columns[4].width, align: 'right' }, { size: 9, color: muted })
    text(euro(row.sum), columns[5].x, top, { width: columns[5].width, align: 'right' }, { bold: true, size: 9.5 })
    y += rowHeight
    pdf.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(line).stroke()
  })
  text('Alle Einzelpreise netto zzgl. Umsatzsteuer.', left, y + 6, { width }, { size: 7.5, color: muted })
  y += 26

  // Summenblock
  const totalRows = [
    ['Summe netto', totals.netTotal],
    [`Umsatzsteuer ${totals.vatRate} %`, totals.taxTotal],
    ['Gesamtbetrag brutto', totals.grossTotal, 'bold'],
    totals.depositTotal > 0 ? ['zzgl. Pfand (nicht steuerbar)', totals.depositTotal] : null,
  ].filter(Boolean)
  ensureSpace(totalRows.length * 17 + 46)
  const totalsX = 315
  totalRows.forEach(([label, value, style]) => {
    if (style === 'bold') {
      pdf.moveTo(totalsX, y - 3).lineTo(right, y - 3).lineWidth(0.6).strokeColor(line).stroke()
      y += 2
    }
    text(label, totalsX, y, { width: 150 }, { size: 9.5, bold: style === 'bold', color: style === 'bold' ? ink : muted })
    text(euro(value), right - 80, y, { width: 80, align: 'right' }, { size: 9.5, bold: style === 'bold' })
    y += 17
  })
  y += 4
  pdf.roundedRect(totalsX - 8, y, right - totalsX + 8, 30, 6).fillColor(accent).fill()
  text(invoice.paymentStatus === 'paid' ? 'Bezahlt' : 'Zu zahlen', totalsX, y + 10, { width: 120 }, { bold: true, size: 11, color: '#ffffff' })
  text(euro(totals.payableTotal), right - 120, y + 10, { width: 112, align: 'right' }, { bold: true, size: 11, color: '#ffffff' })
  y += 48

  // Zahlungshinweis
  ensureSpace(80)
  if (invoice.paymentStatus === 'paid') {
    pdf.roundedRect(left, y, width, 34, 6).fillColor('#eaf4ea').fill()
    text(`Der Rechnungsbetrag wurde bereits${invoice.paymentMethod ? ` per ${invoice.paymentMethod}` : ''} bezahlt. Vielen Dank!`, left + 14, y + 12, { width: width - 28 }, { bold: true, size: 9.5, color: '#2e6b33' })
    y += 50
  } else {
    const bank = [
      ['Empfänger', company.name],
      company.iban ? ['IBAN', formatIban(company.iban)] : null,
      ['Verwendungszweck', invoice.paymentReference || invoice.number],
      ['Betrag', euro(totals.payableTotal)],
      invoice.dueDate ? ['Zahlbar bis', germanDate(invoice.dueDate)] : null,
    ].filter(Boolean)
    const boxHeight = 30 + bank.length * 14
    pdf.roundedRect(left, y, width, boxHeight, 6).lineWidth(0.8).strokeColor(line).stroke()
    text('Bitte überweisen Sie den Betrag auf folgendes Konto:', left + 14, y + 10, { width: width - 28 }, { bold: true, size: 9.5 })
    bank.forEach(([label, value], index) => {
      text(label, left + 14, y + 28 + index * 14, { width: 110 }, { size: 9, color: muted })
      text(value, left + 130, y + 28 + index * 14, { width: width - 144 }, { size: 9, bold: label === 'IBAN' || label === 'Verwendungszweck' })
    })
    y += boxHeight + 16
  }

  // Fußzeile auf jeder Seite
  const footerColumns = [
    [company.name, company.street, `${company.postalCode} ${company.city}`, [company.legalForm, company.registeredOffice && `Sitz ${company.registeredOffice}`].filter(Boolean).join(' · ')],
    [company.managingDirectors && `Geschäftsführer: ${company.managingDirectors}`, [company.registrationCourt, company.commercialRegister].filter(Boolean).join(' · '), company.email, company.website.replace(/^https?:\/\//, '')],
    [company.iban && `IBAN ${formatIban(company.iban)}`, company.taxNumber && `St.-Nr. ${company.taxNumber}`, company.vatId && `USt-IdNr. ${company.vatId}`, company.phone && `Tel. ${company.phone}`],
  ].map((lines) => lines.filter(Boolean))
  const footerX = [0, 145, 352]
  const footerWidths = [138, 200, width - 352]
  const range = pdf.bufferedPageRange()
  for (let page = range.start; page < range.start + range.count; page += 1) {
    pdf.switchToPage(page)
    pdf.page.margins.bottom = 0
    const footerY = 752
    pdf.moveTo(left, footerY - 8).lineTo(right, footerY - 8).lineWidth(0.5).strokeColor(line).stroke()
    footerColumns.forEach((lines, index) => {
      let lineY = footerY
      lines.forEach((entry, lineIndex) => {
        pdf.font(lineIndex === 0 && index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor(muted)
        pdf.text(entry, left + footerX[index], lineY, { width: footerWidths[index], lineGap: 0.5 })
        lineY = pdf.y + 0.5
      })
    })
    pdf.font('Helvetica').fontSize(7).fillColor(muted)
      .text(`Seite ${page - range.start + 1} von ${range.count}`, left, 812, { width, align: 'right', lineBreak: false })
  }
  pdf.end()
})

module.exports = { buildInvoicePdf, calculateInvoiceTotals, createInvoiceFromOrder }
