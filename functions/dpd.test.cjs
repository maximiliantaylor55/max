const test = require('node:test')
const assert = require('node:assert/strict')
const { buildStoreOrdersXml, createDpdLabel, parseShippingAddress, senderFromCompany, splitStreet } = require('./dpd.cjs')

test('reads German multi-line delivery addresses for DPD', () => {
  const address = parseShippingAddress({ recipient: 'EDEKA Meyer', address: 'Janina Meyer\nHauptstraße 12a\n57072 Siegen', email: 'a@b.de' })
  assert.deepEqual(address, { name1: 'EDEKA Meyer', name2: 'Janina Meyer', street: 'Hauptstraße', houseNo: '12a', country: 'DE', zipCode: '57072', city: 'Siegen', email: 'a@b.de' })
  assert.equal(parseShippingAddress({ recipient: 'X', address: 'Ring 4\n1010 Wien\nÖsterreich' }).country, 'AT')
  assert.deepEqual(splitStreet('Birlenbacherstr 59'), { street: 'Birlenbacherstr', houseNo: '59' })
  assert.deepEqual(splitStreet('Am Markt 3-5'), { street: 'Am Markt', houseNo: '3-5' })
  assert.throws(() => parseShippingAddress({ recipient: 'X', address: 'nur eine Zeile' }), /Lieferadresse/)
})

test('builds an escaped storeOrders request with weight in decagrams', () => {
  const sender = senderFromCompany({ name: 'Liberty Street Food GmbH', street: 'Birlenbacherstr 59', postalCode: '57078', city: 'Siegen', country: 'Deutschland' }, '123')
  const xml = buildStoreOrdersXml({ username: 'u', authToken: 't', depot: '163', sender, recipient: { name1: 'A & B', street: 'S', country: 'DE', zipCode: '1', city: 'C' }, weightKg: 12.5, reference: 'KA-2026-0001' })
  assert.match(xml, /<weight>1250<\/weight>/)
  assert.match(xml, /<sendingDepot>0163<\/sendingDepot>/)
  assert.match(xml, /<name1>A &amp; B<\/name1>/)
  assert.match(xml, /<product>CL<\/product>/)
})

test('logs in, creates a label and returns the parcel number', async () => {
  const pdf = Buffer.from('%PDF-1.4 test').toString('base64')
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push(url)
    const body = url.includes('Login')
      ? '<soap:Envelope><soap:Body><getAuthResponse><return><delisId>u</delisId><authToken>TOKEN</authToken><depot>0163</depot></return></getAuthResponse></soap:Body></soap:Envelope>'
      : `<soap:Envelope><soap:Body><storeOrdersResponse><orderResult><output><format>PDF</format><content>${pdf}</content></output><shipmentResponses><parcelInformation><parcelLabelNumber>01234567890123</parcelLabelNumber></parcelInformation></shipmentResponses></orderResult></storeOrdersResponse></soap:Body></soap:Envelope>`
    assert.match(options.body, url.includes('Login') ? /getAuth/ : /authToken>TOKEN/)
    return { ok: true, status: 200, text: async () => body }
  }
  const result = await createDpdLabel({
    credentials: { username: 'u', password: 'p', customerNumber: '1', depotNumber: '163' },
    company: { name: 'ZYRO', street: 'Birlenbacherstr 59', postalCode: '57078', city: 'Siegen' },
    recipient: { name1: 'Kunde', street: 'Weg', houseNo: '1', country: 'DE', zipCode: '12345', city: 'Ort' },
    weightKg: 13,
    fetchImpl,
  })
  assert.equal(result.parcelLabelNumber, '01234567890123')
  assert.equal(Buffer.from(result.labelPdfBase64, 'base64').toString(), '%PDF-1.4 test')
  assert.equal(calls.length, 2)
})

test('reports DPD faults in German', async () => {
  const fetchImpl = async (url) => ({ ok: url.includes('Login'), status: 500, text: async () => url.includes('Login')
    ? '<Envelope><authToken>T2</authToken><depot>0163</depot></Envelope>'
    : '<soap:Envelope><soap:Body><storeOrdersResponse><faults><message>Postleitzahl ungültig</message></faults></storeOrdersResponse></soap:Body></soap:Envelope>' })
  await assert.rejects(createDpdLabel({
    credentials: { username: 'u2', password: 'p' },
    company: { street: 'Birlenbacherstr 59', postalCode: '57078', city: 'Siegen' },
    recipient: { name1: 'K', street: 'W', country: 'DE', zipCode: '0', city: 'O' },
    weightKg: 1,
    fetchImpl,
  }), /Postleitzahl ungültig/)
})

test('detects a delivered DPD parcel from the public tracking feed', async () => {
  const { trackDpdParcel } = require('./dpd.cjs')
  const fetchImpl = async (url) => ({ ok: true, json: async () => ({ parcellifecycleResponse: { parcelLifeCycleData: { statusInfo: [
    { status: 'ACCEPTED', label: 'Übernommen', statusHasBeenReached: true, isCurrentStatus: false },
    { status: 'DELIVERED', label: 'Zugestellt', statusHasBeenReached: true, isCurrentStatus: true, location: 'Siegen' },
  ] } } }) })
  const status = await trackDpdParcel({ parcelLabelNumber: '01234567890123', fetchImpl })
  assert.equal(status.delivered, true)
  assert.equal(status.description, 'Zugestellt')
  const open = await trackDpdParcel({ parcelLabelNumber: '01234567890123', fetchImpl: async () => ({ ok: true, json: async () => ({ parcellifecycleResponse: { parcelLifeCycleData: { statusInfo: [
    { status: 'OUT_FOR_DELIVERY', label: 'In Zustellung', statusHasBeenReached: true, isCurrentStatus: true },
    { status: 'DELIVERED', label: 'Zugestellt', statusHasBeenReached: false, isCurrentStatus: false },
  ] } } }) }) })
  assert.equal(open.delivered, false)
})
