import { useEffect, useState } from 'react'

const claimTypes = [
  ['H01', 'Anzeigen in Zeitungen u.a.'],
  ['H02', 'Ärztliche oder zahnärztliche Leistung'],
  ['H03', 'Bürgschaft'],
  ['H04', 'Darlehensrückzahlung'],
  ['H05', 'Dienstleistungsvertrag'],
  ['H06', 'Frachtkosten'],
  ['H07', 'Geschäftsbesorgung durch Selbständige'],
  ['H08', 'Handwerkerleistung'],
  ['H09', 'Heimunterbringung'],
  ['H10', 'Hotelkosten'],
  ['H11', 'Kaufvertrag'],
  ['H12', 'Kontokorrentabrechnung'],
  ['H13', 'Krankenhauskosten-Pflege/Behandlung'],
  ['H14', 'Lagerkosten'],
  ['H15', 'Leasing/Mietkauf'],
  ['H16', 'Lehrgangs-/Unterrichtskosten'],
  ['H17', 'Miete für Geschäftsraum einschl. Nebenkosten'],
  ['H18', 'Miete für Kraftfahrzeug'],
  ['H19', 'Miete für Wohnraum einschl. Nebenkosten'],
  ['H20', 'Mietnebenkosten - auch Renovierungskosten-'],
  ['H21', 'Miete'],
  ['H22', 'Mitgliedsbeitrag'],
  ['H23', 'Pacht'],
  ['H24', 'Rechtsanwalts-/Rechtsbeistandshonorar'],
  ['H25', 'Rentenrückstände'],
  ['H26', 'Reparaturleistung'],
  ['H27', 'Rückgriff aus Versicherungsvertrag wegen Unfall/Vorfall'],
  ['H28', 'Schadenersatz aus Vertrag'],
  ['H29', 'Schadenersatz aus Unfall/Vorfall'],
  ['H30', 'Scheck/Wechsel'],
  ['H31', 'Scheck-/Wechselprovision (1/3 %)'],
  ['H32', 'Scheck-/Wechselunkosten - Spesen/Protest-'],
  ['H33', 'Schuldanerkenntnis'],
  ['H34', 'Speditionskosten'],
  ['H35', 'Tilgungs-/Zinsraten'],
  ['H36', 'Überziehung des Bankkontos'],
  ['H37', 'Ungerechtfertigte Bereicherung'],
  ['H38', 'Unterhaltsrückstände'],
  ['H39', 'Vergleich, außergerichtlicher'],
  ['H40', 'Vermittlungs-/Maklerprovision'],
  ['H41', 'Versicherungsprämie/-beitrag'],
  ['H42', 'Versorgungsleistung - Strom, Wasser, Gas, Wärme-'],
  ['H43', 'Warenlieferung/-en'],
  ['H44', 'Werkvertrag/Werklieferungsvertrag'],
  ['H45', 'Zeitungs-/Zeitschriftenbezug'],
  ['H46', 'Zinsrückstände/Verzugszinsen'],
  ['H61', 'Wahlleistungen bei stationärer Behandlung'],
  ['H70', 'Kindertagesstättenbeitrag'],
  ['H75', 'Reisevertrag'],
  ['H76', 'Telekommunikationsleistungen'],
  ['H77', 'Krankentransportkosten'],
  ['H78', 'Tierärztliche Leistung'],
  ['H79', 'Verpflegungskosten'],
  ['H80', 'Rückgriff aus Bürgschaft oder Garantie'],
  ['H90', 'Wohngeld/Hausgeld für Wohnungseigentümergemeinschaft'],
  ['H95', 'Beiträge zur privaten Pflegeversicherung'],
]

const addressDraft = (value) => {
  const lines = String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  let postalCode = ''
  let city = ''
  const cityLineIndex = lines.findIndex((line) => /^\d{5}\s+\S/.test(line))
  if (cityLineIndex >= 0) {
    const cityLine = lines.splice(cityLineIndex, 1)[0]
    const match = cityLine.match(/^(\d{5})\s+(.+)$/)
    postalCode = match?.[1] || ''
    city = match?.[2] || ''
  }
  return { street: lines.join(', '), postalCode, city }
}

const createForm = (invoice, customer) => {
  const address = addressDraft(invoice.recipientAddress || customer?.address)
  return {
    actingAs: 'business',
    identityType: 'organization',
    organizationName: invoice.recipient || customer?.name || '',
    firstName: '',
    lastName: '',
    salutation: '',
    street: address.street,
    postalCode: address.postalCode,
    city: address.city,
    country: 'DE',
    claimTypeCode: '',
    legalDescription: (invoice.items || [])
      .map((item) => item.description || item.productName || item.customName || '')
      .filter(Boolean)
      .join('; ')
      .slice(0, 2000),
    delayDate: '',
    creditorObligationFulfilled: false,
    claimUndisputed: false,
    fullAmountOutstanding: false,
    productionConfirmed: false,
  }
}

function PaywiseInkasso({ invoice, customer, amount, sessionToken }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(null)
  const [connection, setConnection] = useState(null)
  const [connectionError, setConnectionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) return undefined
    let active = true
    if (!window.zyroPaywise?.status) return undefined
    window.zyroPaywise.status(sessionToken)
      .then((status) => {
        if (active) setConnection(status)
      })
      .catch((error) => {
        if (active) setConnectionError(error.message)
      })
    return () => { active = false }
  }, [open])

  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const close = () => {
    if (busy) return
    setOpen(false)
    setForm(null)
  }

  const openDialog = () => {
    setForm(createForm(invoice, customer))
    setConnection(null)
    setConnectionError('')
    setMessage('')
    setResult(null)
    setOpen(true)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="secondary-button small"
        onClick={openDialog}
      >
        An Paywise übergeben
      </button>
    )
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!window.zyroPaywise?.submit) {
      setMessage('Die Paywise-Anbindung ist in dieser App-Ansicht nicht verfügbar.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const submitted = await window.zyroPaywise.submit({ invoiceId: invoice.id, ...form }, sessionToken)
      setResult(submitted)
      setMessage(submitted.alreadySubmitted
        ? 'Diese Rechnung wurde bereits an Paywise übergeben; es wurde kein zweiter Auftrag angelegt.'
        : 'Inkassoauftrag inklusive Rechnungs-PDF wurde an Paywise übermittelt und zur Prüfung eingereicht.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="paywise-inkasso-modal" role="dialog" aria-modal="true" aria-labelledby="paywise-inkasso-title" onClick={(event) => event.stopPropagation()}>
        <header className="customer-profile-header">
          <div>
            <p className="eyebrow">Paywise · Forderungsmanagement</p>
            <h2 id="paywise-inkasso-title">Inkassoübergabe prüfen</h2>
            <span>Rechnung {invoice.number} · {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount)}</span>
          </div>
          <button type="button" className="secondary-button small" onClick={close} disabled={busy}>Schließen</button>
        </header>
        {result ? (
          <div className="paywise-result">
            <p className="form-message" role="status">{message}</p>
            <p>Paywise-Auftrag: <strong>{result.orderId || 'bereits übergeben'}</strong></p>
            {result.claimId && <p>Forderungs-ID: <strong>{result.claimId}</strong></p>}
            {result.documentAttached && <p>Rechnung {invoice.number} als PDF angehängt</p>}
            <p className="meta">Der Auftrag wurde zur Prüfung eingereicht. Das ist noch keine Annahme durch Paywise.</p>
            <button type="button" className="primary-button" onClick={close}>Fertig</button>
          </div>
        ) : (
          <>
            <div className="paywise-connection" role="status">
              {connection
                ? `Paywise verbunden · ${connection.environment === 'sandbox' ? 'Sandbox' : 'Produktion'} · Unternehmen ${connection.company}`
                : connectionError
                  ? `Paywise-Verbindung fehlgeschlagen: ${connectionError}`
                  : 'Paywise-Verbindung wird geprüft …'}
            </div>
            <p className="paywise-legal-notice">
              Die Übergabe übermittelt Schuldner- und Forderungsdaten sowie die Rechnung {invoice.number} als PDF direkt an Paywise. Nach dem Absenden wird der Auftrag dort zur Prüfung eingereicht und kann nicht mehr bearbeitet werden.
            </p>
            <form className="paywise-inkasso-form" onSubmit={submit}>
              <label>
                Schuldnerart
                <select value={form.actingAs} onChange={(event) => change('actingAs', event.target.value)}>
                  <option value="business">Unternehmen / geschäftliche Forderung</option>
                  <option value="consumer">Privatperson / private Forderung</option>
                </select>
              </label>
              {form.actingAs === 'business' && (
                <label>
                  Schuldneridentität
                  <select value={form.identityType} onChange={(event) => change('identityType', event.target.value)}>
                    <option value="organization">Unternehmen / Organisation</option>
                    <option value="person">Einzelunternehmer (Person)</option>
                  </select>
                </label>
              )}
              {form.identityType === 'organization' && form.actingAs === 'business' ? (
                <label className="full-width">
                  Tatsächlicher Vertragspartner (Firma)
                  <input maxLength={200} required value={form.organizationName} onChange={(event) => change('organizationName', event.target.value)} />
                </label>
              ) : (
                <>
                  <label>
                    Anrede (optional)
                    <select value={form.salutation} onChange={(event) => change('salutation', event.target.value)}>
                      <option value="">Keine Angabe</option>
                      <option value="mr">Herr</option>
                      <option value="ms">Frau</option>
                      <option value="mx">Divers</option>
                    </select>
                  </label>
                  <label>
                    Vorname
                    <input maxLength={100} required value={form.firstName} onChange={(event) => change('firstName', event.target.value)} />
                  </label>
                  <label>
                    Nachname
                    <input maxLength={100} required value={form.lastName} onChange={(event) => change('lastName', event.target.value)} />
                  </label>
                </>
              )}
              <label className="full-width">
                Straße und Hausnummer
                <input maxLength={180} required value={form.street} onChange={(event) => change('street', event.target.value)} />
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
              <label>
                Rechtsgrund der Forderung
                <select required value={form.claimTypeCode} onChange={(event) => change('claimTypeCode', event.target.value)}>
                  <option value="">Tatsächlichen Rechtsgrund auswählen …</option>
                  {claimTypes.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
                </select>
              </label>
              <label className="full-width">
                Beschreibung des Vertrags / Geschäfts
                <textarea maxLength={2000} required rows={2} value={form.legalDescription} onChange={(event) => change('legalDescription', event.target.value)} />
              </label>
              <label>
                Rechnungsdatum
                <input type="date" readOnly value={invoice.documentDate || ''} />
              </label>
              <label>
                Fälligkeitsdatum
                <input type="date" readOnly value={invoice.dueDate || ''} />
              </label>
              <label>
                Verzugsdatum
                <input type="date" required min={invoice.dueDate || undefined} value={form.delayDate} onChange={(event) => change('delayDate', event.target.value)} />
              </label>
              <label className="full-width paywise-confirmation">
                <input type="checkbox" required checked={form.creditorObligationFulfilled} onChange={(event) => change('creditorObligationFulfilled', event.target.checked)} />
                Ich bestätige, dass unsere vertraglichen Leistungen vollständig erbracht wurden.
              </label>
              <label className="full-width paywise-confirmation">
                <input type="checkbox" required checked={form.claimUndisputed} onChange={(event) => change('claimUndisputed', event.target.checked)} />
                Ich bestätige, dass mir kein Widerspruch gegen diese Forderung bekannt ist.
              </label>
              <label className="full-width paywise-confirmation">
                <input type="checkbox" required checked={form.fullAmountOutstanding} onChange={(event) => change('fullAmountOutstanding', event.target.checked)} />
                Ich bestätige, dass der gesamte angezeigte Rechnungsbetrag noch offen ist.
              </label>
              {connection?.environment === 'production' && (
                <label className="full-width paywise-confirmation paywise-production-confirmation">
                  <input type="checkbox" required checked={form.productionConfirmed} onChange={(event) => change('productionConfirmed', event.target.checked)} />
                  Ich bestätige, dass dies eine echte Inkassoübergabe in der Paywise-Produktion ist.
                </label>
              )}
              {message && <p className="paywise-feedback full-width" role="status">{message}</p>}
              <div className="customer-letter-actions full-width">
                <button type="button" className="secondary-button" onClick={close} disabled={busy}>Abbrechen</button>
                <button type="submit" className="danger-button" disabled={busy || !connection}>
                  {busy ? 'Rechnung wird an Paywise übermittelt …' : 'Inkassoauftrag verbindlich einreichen'}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  )
}

export default PaywiseInkasso
