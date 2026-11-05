const maxOfferAttachmentBytes = 10 * 1024 * 1024
const supportedOfferTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])

const validateOfferAttachment = (fileName, contentType, input) => {
  const name = String(fileName || '').trim()
  const mimeType = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (!name || name.length > 180) throw new Error('Der Dateiname des Angebots ist ungültig.')
  if (!supportedOfferTypes.has(mimeType)) throw new Error('Bitte ein PDF-, PNG-, JPG- oder WEBP-Angebot hochladen.')
  const inputLength = Buffer.isBuffer(input) ? input.length : ArrayBuffer.isView(input) ? input.byteLength : 0
  if (!inputLength || inputLength > maxOfferAttachmentBytes) throw new Error('Das Angebot darf nicht leer sein und höchstens 10 MB groß sein.')
  const data = Buffer.from(input)

  const validSignature = mimeType === 'application/pdf'
    ? data.subarray(0, 5).toString('ascii') === '%PDF-'
    : mimeType === 'image/png'
      ? data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : mimeType === 'image/jpeg'
        ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
        : data.subarray(0, 4).toString('ascii') === 'RIFF'
          && data.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!validSignature) throw new Error('Der Dateiinhalt passt nicht zum ausgewählten Angebotstyp.')
  return { fileName: name, mimeType, data }
}

module.exports = { maxOfferAttachmentBytes, validateOfferAttachment }
