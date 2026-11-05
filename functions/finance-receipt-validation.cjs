const maxFinanceReceiptBytes = 10 * 1024 * 1024
const financeReceiptTypes = new Set(['application/pdf', 'image/jpeg', 'image/png'])

const validateFinanceReceiptUpload = ({ entryId, fileName, contentType, size }) => {
  if (typeof entryId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(entryId)) {
    throw new Error('Finanzbuchung für diesen Beleg ungültig.')
  }
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 240
    || /[\\/\0]/.test(fileName)) {
    throw new Error('Dateiname für den Beleg ungültig.')
  }
  if (!financeReceiptTypes.has(contentType)) {
    throw new Error('Erlaubt sind nur PDF-, JPG- und PNG-Belege.')
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > maxFinanceReceiptBytes) {
    throw new Error('Ein Beleg darf höchstens 10 MB groß sein.')
  }
  return { entryId, fileName: fileName.trim(), contentType, size }
}

const validateFinanceReceiptContent = (contentType, data) => {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data || [])
  const signatures = {
    'application/pdf': buffer.subarray(0, 5).toString('ascii') === '%PDF-',
    'image/jpeg': buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    'image/png': buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  }
  if (!signatures[contentType]) throw new Error('Der Dateiinhalt passt nicht zum angegebenen Belegformat.')
  return buffer
}

const validateFinanceReceiptMetadata = (attachments) => {
  if (attachments === undefined) return
  if (!Array.isArray(attachments) || attachments.length > 5) {
    throw new Error('Pro Finanzbuchung sind höchstens fünf Belege zulässig.')
  }
  const ids = new Set()
  for (const attachment of attachments) {
    if (!attachment || typeof attachment.id !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(attachment.id) || ids.has(attachment.id)
      || typeof attachment.fileName !== 'string' || !attachment.fileName.trim() || attachment.fileName.length > 240
      || !financeReceiptTypes.has(attachment.contentType)
      || !Number.isSafeInteger(attachment.size) || attachment.size < 1 || attachment.size > maxFinanceReceiptBytes
      || typeof attachment.uploadedAt !== 'string' || Number.isNaN(Date.parse(attachment.uploadedAt))) {
      throw new Error('Belegangabe ungültig. Bitte Beleg erneut hochladen.')
    }
    ids.add(attachment.id)
  }
}

module.exports = {
  financeReceiptTypes,
  maxFinanceReceiptBytes,
  validateFinanceReceiptContent,
  validateFinanceReceiptMetadata,
  validateFinanceReceiptUpload,
}
