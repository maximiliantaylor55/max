import { useState } from 'react'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const createLetterForm = () => ({
  id: '',
  customerName: '',
  recipientName: '',
  contactName: '',
  recipientAddress: '',
  subject: '',
  body: '',
  date: today(),
})

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]))

const formatDate = (value) => {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('de-DE').format(new Date(year, month - 1, day))
}

function CustomerLetters({ customers, companyDetails, letters, onLettersChange }) {
  const [form, setForm] = useState(createLetterForm)
  const [message, setMessage] = useState('')

  const updateForm = (changes) => {
    setForm((current) => ({ ...current, ...changes }))
    setMessage('')
  }

  const selectCustomer = (name) => {
    const customer = customers.find((entry) => entry.name === name)
    updateForm({
      customerName: name,
      recipientName: name,
      contactName: customer?.contactName || '',
      recipientAddress: customer?.address || '',
    })
  }

  const saveLetter = () => {
    if (!form.recipientName.trim() || !form.recipientAddress.trim() || !form.body.trim()) {
      setMessage('Bitte Empfänger, Anschrift und Brieftext ausfüllen.')
      return
    }

    const letter = {
      ...form,
      id: form.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      recipientName: form.recipientName.trim(),
      contactName: form.contactName.trim(),
      recipientAddress: form.recipientAddress.trim(),
      subject: form.subject.trim(),
      body: form.body.trim(),
      updatedAt: new Date().toISOString(),
    }
    onLettersChange(form.id
      ? letters.map((entry) => entry.id === letter.id ? letter : entry)
      : [letter, ...letters])
    setForm(letter)
    setMessage('Brief wurde gespeichert.')
  }

  const loadLetter = (letter) => {
    setForm({ ...createLetterForm(), ...letter })
    setMessage('')
  }

  const deleteLetter = (letter) => {
    if (!window.confirm(`Brief an „${letter.recipientName}“ löschen?`)) return
    onLettersChange(letters.filter((entry) => entry.id !== letter.id))
    if (form.id === letter.id) setForm(createLetterForm())
    setMessage('Brief wurde gelöscht.')
  }

  const printLetter = () => {
    if (!form.recipientName.trim() || !form.recipientAddress.trim() || !form.body.trim()) {
      setMessage('Zum Drucken bitte Empfänger, Anschrift und Brieftext ausfüllen.')
      return
    }

    const senderName = escapeHtml(companyDetails.name)
    const senderStreet = escapeHtml(companyDetails.street)
    const senderCity = escapeHtml([companyDetails.postalCode, companyDetails.city].filter(Boolean).join(' '))
    const recipientLines = [
      form.recipientName,
      form.contactName,
      ...form.recipientAddress.split(/\r?\n/),
    ].filter((line) => String(line || '').trim())
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setMessage('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese App erlauben.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(`<!doctype html>
      <html lang="de">
        <head>
          <meta charset="utf-8">
          <title>${escapeHtml(form.subject || 'Brief')} – ${escapeHtml(form.recipientName)}</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; color: #111; font: 11pt Arial, Helvetica, sans-serif; }
            .page { position: relative; width: 210mm; min-height: 297mm; padding: 25mm 20mm 20mm; }
            .sender { position: absolute; top: 26mm; left: 20mm; width: 85mm; overflow: hidden; white-space: nowrap; border-bottom: 0.2mm solid #555; padding-bottom: 1mm; font-size: 8pt; }
            .recipient { position: absolute; top: 45mm; left: 20mm; width: 85mm; height: 45mm; display: flex; flex-direction: column; justify-content: center; font-size: 10pt; line-height: 1.15; }
            .recipient span { display: block; }
            .date { position: absolute; top: 94mm; right: 20mm; text-align: right; }
            .content { margin-top: 81mm; }
            h1 { margin: 0 0 9mm; font-size: 13pt; }
            .body { white-space: pre-wrap; line-height: 1.45; }
            @media screen {
              body { background: #e5e7eb; }
              .page { margin: 12mm auto; background: #fff; box-shadow: 0 2mm 8mm #0003; }
            }
            @media print { .page { break-after: auto; } }
          </style>
        </head>
        <body>
          <main class="page">
            <div class="sender">${senderName} · ${senderStreet} · ${senderCity}</div>
            <div class="recipient">${recipientLines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>
            <div class="date">${escapeHtml(companyDetails.city || '')}, ${formatDate(form.date)}</div>
            <section class="content">
              ${form.subject.trim() ? `<h1>${escapeHtml(form.subject)}</h1>` : ''}
              <div class="body">${escapeHtml(form.body)}</div>
            </section>
          </main>
          <script>window.addEventListener('load', () => { window.focus(); window.print(); });</script>
        </body>
      </html>`)
    printWindow.document.close()
  }

  return (
    <section className="panel customer-letters-panel">
      <div className="panel-header">
        <div>
          <h2>Kundenbriefe</h2>
          <p className="meta">Briefe mit Anschriftenfeld für Fensterumschläge erstellen, speichern und drucken.</p>
        </div>
      </div>
      <div className="customer-letter-layout">
        <form className="customer-letter-form" onSubmit={(event) => { event.preventDefault(); saveLetter() }}>
          <label>
            Kunde auswählen
            <select value={form.customerName} onChange={(event) => selectCustomer(event.target.value)}>
              <option value="">Kunde wählen …</option>
              {customers.map((customer) => <option key={`${customer.name}-${customer.id || ''}`} value={customer.name}>{customer.name}</option>)}
            </select>
          </label>
          <label>
            Empfänger / Firma
            <input value={form.recipientName} onChange={(event) => updateForm({ recipientName: event.target.value })} required />
          </label>
          <label>
            Ansprechpartner (optional)
            <input value={form.contactName} onChange={(event) => updateForm({ contactName: event.target.value })} />
          </label>
          <label>
            Anschrift
            <textarea rows={3} value={form.recipientAddress} onChange={(event) => updateForm({ recipientAddress: event.target.value })} placeholder={'Straße und Hausnummer\nPLZ Ort'} required />
          </label>
          <label>
            Betreff
            <input value={form.subject} onChange={(event) => updateForm({ subject: event.target.value })} />
          </label>
          <label>
            Brieftext
            <textarea className="customer-letter-body-input" rows={10} value={form.body} onChange={(event) => updateForm({ body: event.target.value })} required />
          </label>
          <label>
            Briefdatum
            <input type="date" value={form.date} onChange={(event) => updateForm({ date: event.target.value })} required />
          </label>
          <div className="customer-letter-actions">
            <button type="submit" className="primary-button">{form.id ? 'Änderungen speichern' : 'Brief speichern'}</button>
            <button type="button" className="secondary-button" onClick={printLetter}>Drucken</button>
            <button type="button" className="secondary-button" onClick={() => { setForm(createLetterForm()); setMessage('') }}>Neuer Brief</button>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
        </form>

        <aside className="customer-letter-saved">
          <h3>Gespeicherte Briefe</h3>
          {letters.length === 0
            ? <p className="meta">Noch keine Briefe gespeichert.</p>
            : letters.map((letter) => (
              <div className="customer-letter-saved-item" key={letter.id}>
                <button type="button" className="customer-name-link" onClick={() => loadLetter(letter)}>{letter.recipientName}</button>
                <small>{letter.subject || 'Ohne Betreff'} · {formatDate(letter.date)}</small>
                <button type="button" className="danger-button small" onClick={() => deleteLetter(letter)}>Löschen</button>
              </div>
            ))}
        </aside>
      </div>
    </section>
  )
}

export default CustomerLetters
