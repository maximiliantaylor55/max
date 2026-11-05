const test = require('node:test')
const assert = require('node:assert/strict')
const { createPurchaseReceipt, validatePurchaseOrders, validateSuppliers } = require('./erp-purchasing.cjs')

const supplier = {
  id: 'supplier-1',
  name: 'Flaschenhandel GmbH',
  street: 'Musterstraße 1',
  postalCode: '57078',
  city: 'Siegen',
  country: 'Deutschland',
  email: 'einkauf@example.test',
  phone: '',
  taxId: '',
}
const purchaseOrder = {
  id: 'purchase-1',
  number: 'EK-2026-0001',
  supplierId: supplier.id,
  supplierName: supplier.name,
  orderDate: '2026-10-28',
  expectedDate: '',
  status: 'ordered',
  vatRate: 19,
  invoiceNumber: '',
  invoiceDate: '',
  dueDate: '',
  paidAt: '',
  note: '',
  lines: [{
    id: 'line-1',
    productId: 'product-1',
    productName: 'ZYRO Pfirsich',
    sku: 'ZYR-PF',
    quantity: 24,
    unitCostCents: 500,
    receivedQuantity: 0,
  }],
  receipts: [],
}
const normalizeLot = (lot = '', bestBefore = '') => ({ lot, bestBefore })
const addLot = (product, lot) => {
  if (!lot.lot && !lot.bestBefore) return
  product.lots = [...(product.lots || []), { ...lot }]
}
const actor = { id: 'user-1', name: 'Einkauf', permissions: ['einkauf'] }

test('validates supplier master data and protects supplier deletion', () => {
  assert.doesNotThrow(() => validateSuppliers([], [supplier], actor))
  assert.throws(() => validateSuppliers([supplier], [], actor), /nur von einem Admin gelöscht/)
  assert.throws(() => validateSuppliers([], [supplier], { id: 'user-2', permissions: ['lager'] }), /Einkaufsberechtigung/)
})

test('validates purchase order lines, quantities and invoice fields', () => {
  assert.doesNotThrow(() => validatePurchaseOrders([], [purchaseOrder], actor))
  assert.throws(() => validatePurchaseOrders([], [{ ...purchaseOrder, lines: [{ ...purchaseOrder.lines[0], quantity: 0 }] }], actor), /Einkaufsposition/)
  assert.throws(() => validatePurchaseOrders([], [{ ...purchaseOrder, invoiceDate: '2026-02-30' }], actor), /Einkaufsauftrag/)
})

test('posts partial receipts to stock and preserves received quantity', () => {
  const products = [{ id: 'product-1', name: 'ZYRO Pfirsich', availableBottles: 10, lots: [] }]
  const result = createPurchaseReceipt(purchaseOrder, products, {
    receiptId: 'receipt-1',
    items: [{ lineId: 'line-1', quantity: 10, lot: 'LOT-1', bestBefore: '2027-10-01' }],
  }, actor, normalizeLot, addLot)
  assert.equal(result.order.status, 'partial')
  assert.equal(result.order.lines[0].receivedQuantity, 10)
  assert.equal(products[0].availableBottles, 20)
  assert.equal(products[0].lots[0].quantity, 10)
  assert.throws(() => validatePurchaseOrders([purchaseOrder], [result.order], actor), /geprüften Wareneingang|geprüfte Cloud-Buchung/)
})

test('prevents duplicate receipts and over-receiving ordered stock', () => {
  const alreadyReceived = {
    ...purchaseOrder,
    status: 'partial',
    lines: [{ ...purchaseOrder.lines[0], receivedQuantity: 10 }],
    receipts: [{ id: 'receipt-1', items: [] }],
  }
  const products = [{ id: 'product-1', name: 'ZYRO Pfirsich', availableBottles: 20 }]
  const duplicate = createPurchaseReceipt(alreadyReceived, products, {
    receiptId: 'receipt-1',
    items: [{ lineId: 'line-1', quantity: 5 }],
  }, actor, normalizeLot, addLot)
  assert.equal(duplicate.alreadyProcessed, true)
  assert.equal(products[0].availableBottles, 20)
  assert.throws(() => createPurchaseReceipt(alreadyReceived, products, {
    receiptId: 'receipt-2',
    items: [{ lineId: 'line-1', quantity: 15 }],
  }, actor, normalizeLot, addLot), /größer als die offene Bestellmenge/)
})

test('prevents reducing posted receipt quantities or editing their unit prices', () => {
  const existing = {
    ...purchaseOrder,
    status: 'partial',
    lines: [{ ...purchaseOrder.lines[0], receivedQuantity: 10 }],
    receipts: [{ id: 'receipt-1', items: [] }],
  }
  assert.throws(() => validatePurchaseOrders([existing], [{
    ...existing,
    lines: [{ ...existing.lines[0], receivedQuantity: 0 }],
  }], actor), /status passt|dürfen nicht rückwirkend geändert/i)
  assert.throws(() => validatePurchaseOrders([existing], [{
    ...existing,
    lines: [{ ...existing.lines[0], unitCostCents: 501 }],
  }], actor), /dürfen nicht rückwirkend geändert/)
})

test('prevents direct receipt forgery, receipt insertion, and status changes', () => {
  assert.throws(() => validatePurchaseOrders([purchaseOrder], [{
    ...purchaseOrder,
    lines: [{ ...purchaseOrder.lines[0], receivedQuantity: 1 }],
    status: 'partial',
  }], actor), /geprüften Wareneingang|geprüfte Cloud-Buchung/)
  assert.throws(() => validatePurchaseOrders([purchaseOrder], [{
    ...purchaseOrder,
    receipts: [{ id: 'fake-receipt', items: [] }],
  }], actor), /geprüfte Cloud-Buchung/)
  assert.throws(() => validatePurchaseOrders([purchaseOrder], [{
    ...purchaseOrder,
    status: 'received',
    lines: [{ ...purchaseOrder.lines[0], receivedQuantity: 24 }],
  }], actor), /geprüften Wareneingang|geprüfte Cloud-Buchung/)
})
