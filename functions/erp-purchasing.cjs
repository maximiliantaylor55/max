const isDate = (value, optional = false) => {
  if (optional && value === '') return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const validateSuppliers = (currentValue, nextValue, actor) => {
  if (!Array.isArray(nextValue)) throw new Error('Lieferanten müssen als Liste gespeichert werden.')
  if (actor && actor.role !== 'admin' && !actor.permissions?.includes('einkauf')) {
    throw new Error('Für Lieferantendaten brauchst du die Einkaufsberechtigung.')
  }
  const current = Array.isArray(currentValue) ? currentValue : []
  const ids = new Set()
  for (const supplier of nextValue) {
    if (!supplier || typeof supplier.id !== 'string' || !supplier.id.trim() || supplier.id.length > 100
      || ids.has(supplier.id)
      || typeof supplier.name !== 'string' || !supplier.name.trim() || supplier.name.length > 160
      || typeof supplier.street !== 'string' || supplier.street.length > 180
      || typeof supplier.postalCode !== 'string' || supplier.postalCode.length > 20
      || typeof supplier.city !== 'string' || supplier.city.length > 100
      || typeof supplier.country !== 'string' || supplier.country.length > 80
      || typeof supplier.email !== 'string' || supplier.email.length > 254
      || typeof supplier.phone !== 'string' || supplier.phone.length > 50
      || typeof supplier.taxId !== 'string' || supplier.taxId.length > 40) {
      throw new Error('Lieferant ungültig. Bitte Name und Kontaktdaten prüfen.')
    }
    ids.add(supplier.id)
  }
  if (actor?.role !== 'admin' && current.some((supplier) => !ids.has(supplier.id))) {
    throw new Error('Lieferanten dürfen nur von einem Admin gelöscht werden.')
  }
}

const validatePurchaseOrders = (currentValue, nextValue, actor) => {
  if (!Array.isArray(nextValue)) throw new Error('Einkaufsaufträge müssen als Liste gespeichert werden.')
  if (actor && actor.role !== 'admin' && !actor.permissions?.includes('einkauf')) {
    throw new Error('Für Einkaufsaufträge brauchst du die Einkaufsberechtigung.')
  }
  const current = Array.isArray(currentValue) ? currentValue : []
  const currentById = new Map(current.map((order) => [String(order.id), order]))
  const ids = new Set()
  const numbers = new Set()
  for (const order of nextValue) {
    if (!order || typeof order.id !== 'string' || !order.id.trim() || order.id.length > 100
      || ids.has(order.id)
      || typeof order.number !== 'string' || !/^EK-\d{4}-\d{4,}$/.test(order.number)
      || typeof order.supplierId !== 'string' || !order.supplierId.trim()
      || typeof order.supplierName !== 'string' || !order.supplierName.trim() || order.supplierName.length > 160
      || !isDate(order.orderDate)
      || !isDate(order.expectedDate, true)
      || !['ordered', 'partial', 'received', 'cancelled'].includes(order.status)
      || ![0, 7, 19].includes(order.vatRate)
      || !Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > 100
      || typeof order.invoiceNumber !== 'string' || order.invoiceNumber.length > 80
      || !isDate(order.invoiceDate, true)
      || !isDate(order.dueDate, true)
      || !isDate(order.paidAt, true)
      || typeof order.note !== 'string' || order.note.length > 500) {
      throw new Error('Einkaufsauftrag ungültig. Bitte Lieferant, Termine, Positionen und Status prüfen.')
    }
    if (numbers.has(order.number)) throw new Error('Einkaufsauftragsnummer ist bereits vergeben.')
    numbers.add(order.number)
    ids.add(order.id)
    const lineIds = new Set()
    for (const line of order.lines) {
      if (!line || typeof line.id !== 'string' || !line.id.trim() || line.id.length > 100
        || lineIds.has(line.id)
        || typeof line.productId !== 'string' || !line.productId.trim() || line.productId.length > 100
        || typeof line.productName !== 'string' || !line.productName.trim() || line.productName.length > 160
        || typeof line.sku !== 'string' || line.sku.length > 80
        || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1_000_000
        || !Number.isSafeInteger(line.unitCostCents) || line.unitCostCents < 0 || line.unitCostCents > 100_000_000_000
        || !Number.isSafeInteger(line.receivedQuantity) || line.receivedQuantity < 0 || line.receivedQuantity > line.quantity) {
        throw new Error('Einkaufsposition ungültig. Bitte Produkt, Menge und Nettopreis prüfen.')
      }
      lineIds.add(line.id)
    }
    if (!Array.isArray(order.receipts) || order.receipts.length > 1000) throw new Error('Wareneingangsverlauf ungültig.')
    if (order.status === 'received' && order.lines.some((line) => line.receivedQuantity !== line.quantity)) {
      throw new Error('Ein Einkaufsauftrag kann erst nach vollständigem Wareneingang abgeschlossen werden.')
    }
    if (order.status === 'cancelled' && order.lines.some((line) => line.receivedQuantity > 0)) {
      throw new Error('Ein teilweise oder vollständig gelieferter Auftrag kann nicht storniert werden.')
    }
    const totalOrdered = order.lines.reduce((sum, line) => sum + line.quantity, 0)
    const totalReceived = order.lines.reduce((sum, line) => sum + line.receivedQuantity, 0)
    if ((totalReceived === 0 && !['ordered', 'cancelled'].includes(order.status))
      || (totalReceived > 0 && totalReceived < totalOrdered && order.status !== 'partial')
      || (totalReceived === totalOrdered && order.status !== 'received')) {
      throw new Error('Einkaufsstatus passt nicht zu den gebuchten Wareneingängen.')
    }
    const previous = currentById.get(order.id)
    if (previous) {
      if (previous.status === 'cancelled' && order.status !== 'cancelled') {
        throw new Error('Stornierte Einkaufsaufträge können nicht wieder geöffnet werden.')
      }
      if (previous.status !== order.status
        && !(previous.status === 'ordered' && order.status === 'cancelled')) {
        throw new Error('Einkaufsstatus kann nur durch den geprüften Wareneingang geändert werden.')
      }
      if ((previous.invoiceNumber && previous.invoiceNumber !== order.invoiceNumber)
        || (previous.invoiceDate && previous.invoiceDate !== order.invoiceDate)) {
        throw new Error('Eingangsrechnungsnummer und -datum dürfen nach dem Erfassen nicht geändert werden.')
      }
      const previousLines = new Map(previous.lines.map((line) => [line.id, line]))
      if (previous.lines.some((line) => line.receivedQuantity > 0 && !lineIds.has(line.id))) {
        throw new Error('Positionen mit gebuchtem Wareneingang dürfen nicht entfernt werden.')
      }
      for (const line of order.lines) {
        const previousLine = previousLines.get(line.id)
        if (!previousLine && line.receivedQuantity !== 0) {
          throw new Error('Wareneingänge dürfen ausschließlich über die geprüfte Cloud-Buchung erfasst werden.')
        }
        if (previousLine && (line.receivedQuantity !== previousLine.receivedQuantity
          || line.productId !== previousLine.productId
          || line.quantity !== previousLine.quantity
          || line.unitCostCents !== previousLine.unitCostCents)) {
          throw new Error('Gebuchte Wareneingänge sowie Produkt und Preis dürfen nicht rückwirkend geändert werden.')
        }
      }
      if ((previous.receipts || []).some((receipt) => {
        const nextReceipt = order.receipts.find((next) => next.id === receipt.id)
        return !nextReceipt || JSON.stringify(receipt) !== JSON.stringify(nextReceipt)
      }) || order.receipts.length !== (previous.receipts || []).length
        || ((previous.receipts || []).length > 0
          && (previous.number !== order.number || previous.supplierId !== order.supplierId
            || previous.supplierName !== order.supplierName))) {
        throw new Error('Wareneingänge dürfen ausschließlich über die geprüfte Cloud-Buchung erfasst werden.')
      }
    } else if (order.status !== 'ordered' || order.receipts.length > 0
      || order.lines.some((line) => line.receivedQuantity !== 0)) {
      throw new Error('Neue Einkaufsaufträge müssen offen und ohne Wareneingang angelegt werden.')
    }
  }
  if (actor?.role !== 'admin' && current.some((order) => !ids.has(String(order.id)))) {
    throw new Error('Einkaufsaufträge dürfen nur von einem Admin gelöscht werden.')
  }
}

const createPurchaseReceipt = (order, products, input, actor, normalizeLotInput, addLot) => {
  const receiptId = String(input?.receiptId || '')
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(receiptId)) throw new Error('Wareneingangs-ID ungültig.')
  if (!order || !['ordered', 'partial'].includes(order.status)) throw new Error('Einkaufsauftrag ist nicht mehr offen.')
  const receipts = Array.isArray(order.receipts) ? order.receipts : []
  if (receipts.some((receipt) => receipt.id === receiptId)) return { alreadyProcessed: true, order }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > order.lines.length) {
    throw new Error('Wareneingangspositionen ungültig.')
  }
  const received = new Map()
  for (const item of input.items) {
    if (!item || typeof item !== 'object') throw new Error('Wareneingangsposition ungültig.')
    const line = order.lines.find((candidate) => candidate.id === item.lineId)
    const quantity = Number(item.quantity)
    if (!line || received.has(line.id) || !Number.isSafeInteger(quantity) || quantity < 1
      || quantity > line.quantity - line.receivedQuantity) {
      throw new Error('Wareneingangsmenge ungültig oder größer als die offene Bestellmenge.')
    }
    received.set(line.id, { line, quantity, lot: normalizeLotInput(item.lot, item.bestBefore) })
  }
  const nextOrder = {
    ...order,
    lines: order.lines.map((line) => {
      const receipt = received.get(line.id)
      return receipt ? { ...line, receivedQuantity: line.receivedQuantity + receipt.quantity } : line
    }),
    receipts: [...receipts, {
      id: receiptId,
      timestamp: new Date().toISOString(),
      userId: String(actor.id),
      userName: actor.name || actor.username || 'ZYRO',
      items: [...received.values()].map(({ line, quantity, lot }) => ({
        lineId: line.id,
        productId: line.productId,
        quantity,
        lot: lot.lot,
        bestBefore: lot.bestBefore,
      })),
    }],
  }
  const isComplete = nextOrder.lines.every((line) => line.receivedQuantity === line.quantity)
  nextOrder.status = isComplete ? 'received' : 'partial'

  const movements = []
  for (const { line, quantity, lot } of received.values()) {
    const product = products.find((entry) => String(entry.id) === line.productId)
    if (!product) throw new Error(`Produkt „${line.productName}“ wurde nicht im Bestand gefunden.`)
    if (product.availableBottles !== undefined
      && (!Number.isSafeInteger(product.availableBottles) || product.availableBottles < 0)) {
      throw new Error(`Der vorhandene Bestand von „${line.productName}“ ist ungültig.`)
    }
    const nextStock = (product.availableBottles || 0) + quantity
    if (!Number.isSafeInteger(nextStock) || nextStock > 1_000_000_000) throw new Error('Der neue Lagerbestand überschreitet den zulässigen Bereich.')
    product.availableBottles = nextStock
    addLot(product, { ...lot, quantity })
    movements.push({
      product,
      quantity,
      lot,
    })
  }
  return { alreadyProcessed: false, order: nextOrder, movements }
}

module.exports = { createPurchaseReceipt, validatePurchaseOrders, validateSuppliers }
