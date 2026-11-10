import { useState } from 'react'

// Paywise-Mahnservice: Rechnung ins automatische Mahnwesen geben (inkl. PDF) und den Mahnstatus anzeigen.
const addressDraft = (value) => {
  const lines = String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  let postalCode = ''
  let city = ''
  const cityLineIndex = lines.findIndex((line) => /^\d{5}\s+\S/.test(line))
  if (cityLineIndex >= 0) {
    const match = lines.splice(cityLineIndex, 1)[0].match(/^(\d{5})\s+(.+)$/)
    postalCode = match?.[1] || ''
    city = match?.[2] || ''
  }
  return { street: lines.join(', '), postalCode, city }
}

const createForm = (invoice, customer) => {
  const address = addressDraft(invoice.recipientAddress || customer?.address)
  return {
    type: 'company',
    name: invoice.recipient || customer?.name || '',
    email: invoice.recipientEmail || customer?.email || '',
    street: address.street,
    postalCode: address.postalCode,
    city: address.city,
    country: 'DE',
    confirmed: false,
  }
}

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('de-DE')
}

const euro = (value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0))

function PaywiseMahnservice({ invoice, customer, amount, sessionToken }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const openDialog = async () => {
    setOpen(true)
    setMessage('')
    setForm(createForm(invoice, customer))
    setState(null)
    setBusy(true)
    try {
      setState(await window.zyroPaywise.mahnserviceGet(invoice.id, sessionToken))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (busy) return
    setOpen(false)
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const { confirmed, ...debtor } = form
      const result = await window.zyroPaywise.mahnserviceSubmit({ invoiceId: invoice.id, ...debtor }, sessionToken)
      setState(result)
      setMessage(result.alreadySubmitted
        ? 'Diese Rechnung ist bereits im Paywise-Mahnservice.'
        : result.dunningState === 'pending'
          ? 'Rechnung inkl. PDF übermittelt und freigegeben. Paywise mahnt, sobald dein Mahnlauf im Paywise-Portal aktiviert ist.'
          : 'Rechnung inkl. PDF übermittelt und freigegeben – Paywise übernimmt jetzt das Mahnwesen.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button type="button" className="secondary-button small" onClick={openDialog}>Paywise-Mahnservice</button>
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="paywise-inkasso-modal" role="dialog" aria-modal="true" aria-labelledby="paywise-mahnservice-title" onClick={(event) => event.stopPropagation()}>
        <header className="customer-profile-header">
          <div>
            <p className="eyebrow">Paywise · Mahnservice</p>
            <h2 id="paywise-mahnservice-title">{state?.submitted ? 'Mahnstatus' : 'Rechnung in den Mahnservice geben'}</h2>
            <span>Rechnung {invoice.number} · {euro(amount)} · fällig {formatDate(invoice.dueDate)}</span>
          </div>
          <button type="button" className="secondary-button small" onClick={close} disabled={busy}>Schließen</button>
        </header>

        {busy && !state && <p className="paywise-connection" role="status">Mahnservice-Status wird geladen …</p>}

        {state?.submitted ? (
          <div className="paywise-result">
            <p><strong>{state.dunningStateLabel || state.dunningState || 'Freigegeben'}</strong></p>
            {state.currentLevel !== null && state.currentLevel !== undefined && <p>Aktuelle Mahnstufe: <strong>{state.currentLevel}</strong></p>}
            {state.nextActionDate && <p>Nächster Schritt am: <strong>{formatDate(state.nextActionDate)}</strong></p>}
            {state.balance !== null && state.balance !== undefined && <p>Offener Betrag bei Paywise: <strong>{euro(state.balance)}</strong></p>}
            {state.hasDocument && <p>Rechnungs-PDF liegt bei Paywise vor.</p>}
            {state.notices?.length > 0 && (
              <ul>
                {state.notices.map((notice, index) => (
                  <li key={index}>
                    Stufe {notice.level ?? '–'}{notice.sentAt ? ` · ${formatDate(notice.sentAt)}` : ''}{notice.channel ? ` · ${notice.channel}` : ''}{notice.fee ? ` · Gebühr ${euro(notice.fee)}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {message && <p className="form-message" role="status">{message}</p>}
            <p className="meta">Wird die Rechnung hier auf „Bezahlt“ gesetzt, meldet ZYRO die Zahlung automatisch an Paywise und der Mahnlauf stoppt. Bleibt sie unbezahlt, übergibt Paywise sie nach der letzten Mahnstufe selbst ans Inkasso.</p>
            <button type="button" className="primary-button" onClick={close}>Fertig</button>
          </div>
        ) : form && (!busy || (state && !state.submitted)) ? (
          <>
            <p className="paywise-legal-notice">
              Die Rechnung {invoice.number} wird mit Kundendaten und PDF an Paywise übermittelt und für den Mahnlauf freigegeben. Paywise verschickt danach in deinem Namen Zahlungserinnerungen und Mahnungen nach dem im Paywise-Portal eingerichteten Mahnlauf.
            </p>
            <form className="paywise-inkasso-form" onSubmit={submit}>
              <label>
                Kundenart
                <select value={form.type} onChange={(event) => change('type', event.target.value)}>
                  <option value="company">Unternehmen</option>
                  <option value="person">Privatperson</option>
                </select>
              </label>
              <label>
                Name / Firma
                <input maxLength={255} required value={form.name} onChange={(event) => change('name', event.target.value)} />
              </label>
              <label className="full-width">
                E-Mail für Mahnungen
                <input type="email" maxLength={254} required value={form.email} onChange={(event) => change('email', event.target.value)} />
              </label>
              <label className="full-width">
                Straße und Hausnummer
                <input maxLength={255} required value={form.street} onChange={(event) => change('street', event.target.value)} />
              </label>
              <label>
                Postleitzahl
                <input maxLength={20} required value={form.postalCode} onChange={(event) => change('postalCode', event.target.value)} />
              </label>
              <label>
                Ort
                <input maxLength={100} required value={form.city} onChange={(event) => change('city', event.target.value)} />
              </label>
              <label>
                Land (ISO-2)
                <input maxLength={2} minLength={2} required value={form.country} onChange={(event) => change('country', event.target.value.toUpperCase())} />
              </label>
              <label className="full-width paywise-confirmation">
                <input type="checkbox" required checked={form.confirmed} onChange={(event) => change('confirmed', event.target.checked)} />
                Ich bestätige, dass die Rechnung korrekt ist und Paywise den Kunden in unserem Namen mahnen darf.
              </label>
              {message && <p className="paywise-feedback full-width" role="status">{message}</p>}
              <div className="customer-letter-actions full-width">
                <button type="button" className="secondary-button" onClick={close} disabled={busy}>Abbrechen</button>
                <button type="submit" className="primary-button" disabled={busy}>
                  {busy ? 'Wird an Paywise übermittelt …' : 'An Mahnservice übergeben'}
                </button>
              </div>
            </form>
          </>
        ) : (
          message && <p className="paywise-feedback" role="status">{message}</p>
        )}
      </section>
    </div>
  )
}

export default PaywiseMahnservice
