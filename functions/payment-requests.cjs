const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const normalizeIban = (value) => String(value || '').replace(/\s+/g, '').toUpperCase()

const isValidIban = (value) => {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || iban.length < 15 || iban.length > 34) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const character of rearranged) {
    const digits = character >= 'A' && character <= 'Z'
      ? String(character.charCodeAt(0) - 55)
      : character
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

const isSafeText = (value, maxLength, required = false) => typeof value === 'string'
  && value.length <= maxLength
  && !Array.from(value).some((character) => {
    const code = character.codePointAt(0)
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)
  })
  && (!required || Boolean(value.trim()))

const validatePaymentSettings = (value) => {
  if (!Array.isArray(value) || value.length > 1) throw new Error('Zahlungskonto ungültig.')
  if (!value.length) return
  const [settings] = value
  if (settings?.id !== 'global'
    || !isSafeText(settings.accountName, 70, true)
    || !isValidIban(settings.iban)
    || (settings.bic && !/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/i.test(settings.bic))
    || Object.keys(settings).some((key) => !['id', 'accountName', 'iban', 'bic'].includes(key))) {
    throw new Error('Bitte Firmenname und gültige IBAN für das Zahlungskonto eintragen.')
  }
}

const validatePaymentRequest = (request) => {
  if (!request || typeof request !== 'object'
    || typeof request.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.id)
    || typeof request.requesterId !== 'string' || !request.requesterId.trim() || request.requesterId.length > 100
    || !isSafeText(request.requesterName, 100, true)
    || !isValidDate(String(request.createdAt || '').slice(0, 10))
    || !isSafeText(request.clientName, 120, true)
    || !isSafeText(request.recipientName, 70, true)
    || !isValidIban(request.recipientIban)
    || (request.recipientBic && !/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/i.test(request.recipientBic))
    || !Number.isSafeInteger(request.amountCents) || request.amountCents < 1 || request.amountCents > 100_000_000_000
    || !isSafeText(request.purpose, 140, true)
    || !isSafeText(request.reference || '', 70)
    || !isValidDate(request.requestedExecutionDate)
    || !['pending', 'approved', 'rejected', 'exported', 'paid'].includes(request.status)
    || Object.keys(request).some((key) => !paymentRequestFields.has(key))) {
    throw new Error('Zahlungsantrag ungültig. Bitte Empfänger, IBAN, Betrag und Verwendungszweck prüfen.')
  }
}

const immutableFields = [
  'id', 'requesterId', 'requesterName', 'createdAt', 'clientName', 'recipientName',
  'recipientIban', 'recipientBic', 'amountCents', 'purpose', 'reference', 'requestedExecutionDate',
]
const workflowFields = ['status', 'reviewedById', 'reviewedByName', 'reviewedAt', 'rejectionReason', 'exportedById', 'exportedByName', 'exportedAt', 'exportBatchId', 'paidById', 'paidByName', 'paidAt', 'paymentReference']
const paymentRequestFields = new Set([...immutableFields, ...workflowFields])

const validatePaymentRequestUpdate = (currentValue, nextValue, actor) => {
  if (!Array.isArray(nextValue) || nextValue.length > 10000 || !actor?.id || !actor.name) {
    throw new Error('Zahlungsanträge benötigen eine gültige Anmeldung und Liste.')
  }
  const current = Array.isArray(currentValue) ? currentValue : []
  const currentById = new Map(current.map((request) => [String(request.id), request]))
  const nextById = new Map()
  for (const request of nextValue) {
    validatePaymentRequest(request)
    if (nextById.has(request.id)) throw new Error('Zahlungsantrag ist doppelt vorhanden.')
    nextById.set(request.id, request)
  }
  if (current.some((request) => !nextById.has(String(request.id))) && actor.role === 'admin') {
    throw new Error('Zahlungsanträge dürfen nicht gelöscht werden.')
  }

  if (actor.role !== 'admin') {
    const owned = nextValue.filter((request) => request.requesterId === String(actor.id))
    if (owned.length !== nextValue.length) throw new Error('Du darfst nur eigene Zahlungsanträge einreichen.')
    for (const request of owned) {
      const previous = currentById.get(request.id)
      if (!previous) {
        if (request.status !== 'pending' || request.requesterName !== actor.name
          || request.reviewedAt || request.exportedAt || request.paidAt) {
          throw new Error('Neue Zahlungsanträge müssen offen und von dir eingereicht werden.')
        }
      } else if (JSON.stringify(previous) !== JSON.stringify(request)) {
        throw new Error('Eingereichte Zahlungsanträge können nur von einem Admin bearbeitet werden.')
      }
    }
    if (current.some((request) => request.requesterId === String(actor.id) && !nextById.has(String(request.id)))) {
      throw new Error('Eigene Zahlungsanträge dürfen nicht gelöscht werden.')
    }
    return [...current.filter((request) => request.requesterId !== String(actor.id)), ...owned]
  }

  for (const request of nextValue) {
    const previous = currentById.get(request.id)
    if (!previous) {
      if (request.requesterId !== String(actor.id) || request.requesterName !== actor.name || request.status !== 'pending') {
        throw new Error('Neue Zahlungsanträge müssen offen und vom angemeldeten Benutzer eingereicht werden.')
      }
      continue
    }
    if (immutableFields.some((field) => previous[field] !== request[field])) {
      throw new Error('Empfänger, Betrag und Auftraggeber können nach Einreichung nicht geändert werden.')
    }
    const changedWorkflowFields = workflowFields.filter((field) => previous[field] !== request[field])
    if (changedWorkflowFields.length === 0) continue
    const transition = `${previous.status}->${request.status}`
    const allowedChanges = {
      'pending->approved': ['status', 'reviewedById', 'reviewedByName', 'reviewedAt'],
      'pending->rejected': ['status', 'reviewedById', 'reviewedByName', 'reviewedAt', 'rejectionReason'],
      'approved->exported': ['status', 'exportedById', 'exportedByName', 'exportedAt', 'exportBatchId'],
      'exported->paid': ['status', 'paidById', 'paidByName', 'paidAt', 'paymentReference'],
    }[transition]
    if (!allowedChanges || changedWorkflowFields.some((field) => !allowedChanges.includes(field))) {
      throw new Error('Dieser Statuswechsel enthält unzulässige Änderungen.')
    }
    if (transition === 'pending->approved') {
      if (request.requesterId === String(actor.id) || request.reviewedById !== String(actor.id)
        || request.reviewedByName !== actor.name || !Number.isFinite(Date.parse(request.reviewedAt))
        || request.rejectionReason) throw new Error('Ein Admin darf eigene Zahlungsanträge nicht genehmigen.')
    } else if (transition === 'pending->rejected') {
      if (request.reviewedById !== String(actor.id) || request.reviewedByName !== actor.name
        || !Number.isFinite(Date.parse(request.reviewedAt)) || !isSafeText(request.rejectionReason, 500, true)) {
        throw new Error('Für die Ablehnung ist ein Grund erforderlich.')
      }
    } else if (transition === 'approved->exported') {
      if (request.exportedById !== String(actor.id) || request.exportedByName !== actor.name
        || !Number.isFinite(Date.parse(request.exportedAt))
        || typeof request.exportBatchId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(request.exportBatchId)) {
        throw new Error('SEPA-Exportdaten ungültig.')
      }
    } else if (transition === 'exported->paid') {
      if (request.paidById !== String(actor.id) || request.paidByName !== actor.name
        || !isValidDate(request.paidAt) || !isSafeText(request.paymentReference || '', 100)) {
        throw new Error('Angaben zur ausgeführten Überweisung ungültig.')
      }
    } else {
      throw new Error('Dieser Statuswechsel für den Zahlungsantrag ist nicht zulässig.')
    }
  }
  return nextValue
}

const xmlEscape = (value) => String(value || '').replace(/[<>&'"]/g, (character) => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
}[character]))

const formatCents = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`

const buildSepaXml = ({ settings, requests, createdAt = new Date() }) => {
  validatePaymentSettings([settings])
  if (!Array.isArray(requests) || !requests.length) throw new Error('Keine freigegebenen Zahlungsanträge für den SEPA-Export ausgewählt.')
  requests.forEach((request) => {
    validatePaymentRequest(request)
    if (request.status !== 'approved') throw new Error('Nur freigegebene Zahlungsanträge dürfen exportiert werden.')
  })

  const groups = new Map()
  const today = createdAt.toISOString().slice(0, 10)
  requests.forEach((request) => {
    const executionDate = request.requestedExecutionDate < today ? today : request.requestedExecutionDate
    const group = groups.get(executionDate) || []
    group.push(request)
    groups.set(executionDate, group)
  })
  const totalCents = requests.reduce((sum, request) => sum + request.amountCents, 0)
  const messageId = `ZYRO-${createdAt.toISOString().replace(/\D/g, '').slice(0, 20)}`
  const debtorAgent = settings.bic
    ? `<BIC>${xmlEscape(settings.bic.toUpperCase())}</BIC>`
    : '<Othr><Id>NOTPROVIDED</Id></Othr>'
  const paymentInfos = [...groups.entries()].map(([executionDate, group], groupIndex) => {
    const groupCents = group.reduce((sum, request) => sum + request.amountCents, 0)
    const transactions = group.map((request) => {
      const endToEndId = request.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35) || 'NOTPROVIDED'
      const remittance = [request.purpose, request.reference].filter(Boolean).join(' · ').slice(0, 140)
      const creditorAgent = request.recipientBic && /^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/i.test(request.recipientBic)
        ? `<BIC>${xmlEscape(request.recipientBic.toUpperCase())}</BIC>`
        : '<Othr><Id>NOTPROVIDED</Id></Othr>'
      return `<CdtTrfTxInf><PmtId><EndToEndId>${xmlEscape(endToEndId)}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${formatCents(request.amountCents)}</InstdAmt></Amt><CdtrAgt><FinInstnId>${creditorAgent}</FinInstnId></CdtrAgt><Cdtr><Nm>${xmlEscape(request.recipientName)}</Nm></Cdtr><CdtrAcct><Id><IBAN>${xmlEscape(normalizeIban(request.recipientIban))}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${xmlEscape(remittance)}</Ustrd></RmtInf></CdtTrfTxInf>`
    }).join('')
    const paymentInfoId = `${messageId}-${groupIndex + 1}`
    return `<PmtInf><PmtInfId>${paymentInfoId}</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${group.length}</NbOfTxs><CtrlSum>${formatCents(groupCents)}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${executionDate}</ReqdExctnDt><Dbtr><Nm>${xmlEscape(settings.accountName)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${xmlEscape(normalizeIban(settings.iban))}</IBAN></Id></DbtrAcct><DbtrAgt><FinInstnId>${debtorAgent}</FinInstnId></DbtrAgt><ChrgBr>SLEV</ChrgBr>${transactions}</PmtInf>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn><GrpHdr><MsgId>${messageId}</MsgId><CreDtTm>${createdAt.toISOString()}</CreDtTm><NbOfTxs>${requests.length}</NbOfTxs><CtrlSum>${formatCents(totalCents)}</CtrlSum><InitgPty><Nm>${xmlEscape(settings.accountName)}</Nm></InitgPty></GrpHdr>${paymentInfos}</CstmrCdtTrfInitn></Document>`
}

module.exports = {
  normalizeIban,
  isValidIban,
  validatePaymentSettings,
  validatePaymentRequest,
  validatePaymentRequestUpdate,
  buildSepaXml,
}
