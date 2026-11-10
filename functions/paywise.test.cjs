const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildPaywiseDebtorPayload,
  buildPaywiseOrderPayload,
  calculateInvoicePayableTotal,
  callPaywiseApi,
  getPaywiseApiBaseUrl,
  normalizePaywiseSubmission,
} = require('./paywise.cjs')

const daysFromToday = (offset) => {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

const baseSubmission = {
  actingAs: 'business',
  identityType: 'organization',
  organizationName: 'Getränkehandel GmbH',
  street: 'Musterstraße 1',
  postalCode: '57078',
  city: 'Siegen',
  country: 'DE',
  claimTypeCode: 'H43',
  legalDescription: 'Lieferung von Getränken gemäß Rechnung',
  documentDate: daysFromToday(-30),
  dueDate: daysFromToday(-14),
  delayDate: daysFromToday(-13),
  creditorObligationFulfilled: true,
  claimUndisputed: true,
  fullAmountOutstanding: true,
}

test('normalizes business submission and builds Paywise resources', () => {
  const submission = normalizePaywiseSubmission(baseSubmission)
  assert.deepEqual(buildPaywiseDebtorPayload(submission, 'ZYRO-1'), {
    your_reference: 'ZYRO-1',
    acting_as: 'business',
    organization: { name: 'Getränkehandel GmbH' },
    addresses: [{
      street: 'Musterstraße 1',
      postal_code: '57078',
      city: 'Siegen',
      country: 'DE',
      primary: true,
    }],
  })

  const order = buildPaywiseOrderPayload({
    debtorId: 'debtor-1',
    invoice: { id: '1', number: 'RE-2026-0001', documentDate: daysFromToday(-30), items: [{ productName: 'Limonade' }] },
    submission,
    amount: 119,
  })
  assert.equal(order.debtor_id, 'debtor-1')
  assert.equal(order.claims[0].type, 'receivable')
  assert.equal(order.claims[0].principal_amount.value, '119.00')
  assert.equal(order.claims[0].legal_basis.claim_type_code, 'H43')
  assert.equal(order.claims[0].is_disputed, false)
})

test('requires a valid debtor, catalog code, dates, and explicit confirmations', () => {
  assert.throws(() => normalizePaywiseSubmission({ ...baseSubmission, postalCode: '5707' }), /Postleitzahl/)
  assert.throws(() => normalizePaywiseSubmission({ ...baseSubmission, claimTypeCode: 'H47' }), /Rechtsgrund/)
  assert.throws(() => normalizePaywiseSubmission({ ...baseSubmission, dueDate: daysFromToday(1) }), /Verzugsdatum/)
  assert.throws(() => normalizePaywiseSubmission({ ...baseSubmission, creditorObligationFulfilled: false }), /ausdrücklich bestätigen/)
})

test('requires a natural person identity for consumers', () => {
  assert.throws(() => normalizePaywiseSubmission({
    ...baseSubmission,
    actingAs: 'consumer',
    identityType: 'person',
  }), /Vorname/)
  const consumer = normalizePaywiseSubmission({
    ...baseSubmission,
    actingAs: 'consumer',
    identityType: 'person',
    firstName: 'Erika',
    lastName: 'Musterfrau',
  })
  assert.deepEqual(buildPaywiseDebtorPayload(consumer, 'ZYRO-2').person, {
    first_name: 'Erika',
    last_name: 'Musterfrau',
  })
})

test('calculates invoice total including bottle deposits', () => {
  const total = calculateInvoicePayableTotal({
    items: [{ productId: 'p1', quantity: 24, unitPrice: 1 }],
    vatRate: 19,
  }, [{ id: 'p1', depositPerUnit: 0.25 }])
  assert.equal(total, 34.56)
})

test('selects sandbox only for sandbox credentials and sends idempotency keys', async () => {
  assert.equal(getPaywiseApiBaseUrl('pw_sbx_test'), 'https://api-sandbox.paywise.de')
  assert.equal(getPaywiseApiBaseUrl('pw_live_test'), 'https://api.paywise.de')
  let request
  await callPaywiseApi('pw_sbx_test', '/v2/orders/', {
    method: 'POST',
    body: { value: 1 },
    idempotencyKey: 'stable-command',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true, json: async () => ({ id: 'order-1' }) }
    },
  })
  assert.equal(request.url, 'https://api-sandbox.paywise.de/v2/orders/')
  assert.equal(request.options.headers.Authorization, 'Bearer pw_sbx_test')
  assert.equal(request.options.headers['Idempotency-Key'], 'stable-command')
  assert.equal(request.options.body, '{"value":1}')
})

test('verifies Paywise webhook signatures over the raw body', () => {
  const { verifyPaywiseWebhookSignature } = require('./paywise.cjs')
  const crypto = require('node:crypto')
  const body = Buffer.from('{"event":"payment.reported","data":{"claim":"x"}}')
  const signature = `sha256=${crypto.createHmac('sha256', 'geheim').update(body).digest('hex')}`
  assert.equal(verifyPaywiseWebhookSignature(body, signature, 'geheim'), true)
  assert.equal(verifyPaywiseWebhookSignature(body, signature, 'falsch'), false)
  assert.equal(verifyPaywiseWebhookSignature(Buffer.from(`${body} `), signature, 'geheim'), false)
  assert.equal(verifyPaywiseWebhookSignature(body, signature.slice(7), 'geheim'), false)
  assert.equal(verifyPaywiseWebhookSignature(body, signature, ''), false)
})

test('collects ids from webhook data to match submissions', () => {
  const { collectPaywiseIds } = require('./paywise.cjs')
  const ids = collectPaywiseIds({ order: { id: 'AAAAAAAA-1111-2222-3333-444444444444' }, claims: [{ id: 'bbbbbbbb-1111-2222-3333-444444444444', note: 'x' }] })
  assert.deepEqual([...ids].sort(), ['aaaaaaaa-1111-2222-3333-444444444444', 'bbbbbbbb-1111-2222-3333-444444444444'])
})

const {
  buildPaywiseInvoiceDocumentPayload,
  waitForPaywiseDocument,
} = require('./paywise.cjs')

test('Rechnungs-PDF wird als Paywise-Beleg vom Typ invoice aufbereitet', () => {
  const pdf = Buffer.from('%PDF-1.4\n%test')
  const payload = buildPaywiseInvoiceDocumentPayload('RE-2026/0042', pdf)
  assert.equal(payload.type, 'invoice')
  assert.equal(payload.filename, 'Rechnung-RE-2026-0042.pdf')
  assert.equal(Buffer.from(payload.base64, 'base64').toString(), pdf.toString())
})

test('ungültige oder zu große Rechnungs-PDF wird abgewiesen', () => {
  assert.throws(() => buildPaywiseInvoiceDocumentPayload('RE-1', Buffer.from('kein pdf')), /ungültig/)
  const big = Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(10 * 1024 * 1024)])
  assert.throws(() => buildPaywiseInvoiceDocumentPayload('RE-1', big), /10 MB/)
})

test('Beleg-Prüfung wartet bis ready', async () => {
  const states = ['pending', 'pending', 'ready']
  const paths = []
  const document = await waitForPaywiseDocument('pw_sbx_x', 'c1', 'd1', {
    call: async (_key, path) => { paths.push(path); return { status: states.shift() } },
    sleep: async () => {},
  })
  assert.equal(document.status, 'ready')
  assert.deepEqual(paths, Array(3).fill('/v2/claims/c1/documents/d1/'))
})

test('abgelehnter Beleg meldet den Grund und wird zum Ersatz markiert', async () => {
  await assert.rejects(
    waitForPaywiseDocument('k', 'c', 'd', { call: async () => ({ status: 'failed', failure_reason: 'encrypted' }), sleep: async () => {} }),
    (error) => error.paywiseDocumentRejected === true && /verschlüsselt/.test(error.message),
  )
})

test('noch laufende Prüfung bricht ohne Doppelauftrag ab', async () => {
  await assert.rejects(
    waitForPaywiseDocument('k', 'c', 'd', { call: async () => ({ status: 'pending' }), sleep: async () => {}, maxAttempts: 3 }),
    /erneut/,
  )
})

const {
  buildMahnserviceDebtorPayload,
  buildMahnserviceInvoicePayload,
  normalizeMahnserviceDebtor,
  uploadPaywisePdf,
} = require('./paywise.cjs')

test('Mahnservice-Schuldner wird geprüft und im Paywise-Format aufgebaut', () => {
  const debtor = normalizeMahnserviceDebtor({
    type: 'company', name: 'Getränke Müller GmbH', email: 'Info@Mueller.de',
    street: 'Hauptstr. 1', postalCode: '57072', city: 'Siegen', country: 'de',
  })
  assert.deepEqual(buildMahnserviceDebtorPayload(debtor, 'K-17'), {
    name: 'Getränke Müller GmbH', type: 'company', email: 'info@mueller.de', customer_number: 'K-17',
    address: { street: 'Hauptstr. 1', zip_code: '57072', city: 'Siegen', country: 'DE' },
  })
  assert.throws(() => normalizeMahnserviceDebtor({ type: 'company', name: 'X', street: 'a', postalCode: '57072', city: 'b' }), /E-Mail/)
  assert.throws(() => normalizeMahnserviceDebtor({ name: 'X' }), /Unternehmen oder eine Privatperson/)
})

test('Mahnservice-Rechnung nutzt Rechnungsnummer als Idempotenzschlüssel und Betrag als String', () => {
  const payload = buildMahnserviceInvoicePayload({
    invoice: { id: 'abc', number: 'RE-2026-0007', documentDate: '2026-10-01', dueDate: '2026-10-15' },
    amount: 119.5,
    debtorId: '11111111-1111-4111-8111-111111111111',
  })
  assert.deepEqual(payload, {
    invoice_number: 'RE-2026-0007', amount: '119.50', currency: 'EUR', due_date: '2026-10-15',
    document_date: '2026-10-01', your_reference: 'ZYRO-abc', debtor: '11111111-1111-4111-8111-111111111111',
  })
})

test('PDF-Upload geht als multipart mit Feld file an die Sandbox', async () => {
  let captured
  const result = await uploadPaywisePdf('pw_sbx_test', '/mahnservice/v1/invoices/i1/documents/', Buffer.from('%PDF-1.4 x'), 'Rechnung-1.pdf', {
    fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, json: async () => ({ id: 'd1', status: 'pending' }) } },
  })
  assert.equal(result.id, 'd1')
  assert.equal(captured.url, 'https://api-sandbox.paywise.de/mahnservice/v1/invoices/i1/documents/')
  assert.ok(captured.options.body instanceof FormData)
  assert.equal(captured.options.body.get('file').name, 'Rechnung-1.pdf')
})
