import { useEffect, useState } from 'react'

// sevDesk: Rechnungen sowie Einnahmen/Ausgaben aus „Finanzen“ als Belege an sevDesk übertragen.
const formatDateTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}
const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('de-DE') : '')

// Status/Button an einer einzelnen Rechnung (Verkauf).
export function SevdeskInvoiceSync({ invoice, sessionToken }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    window.zyroSevdesk.invoiceGet(invoice.id, sessionToken)
      .then((result) => { if (active) setState(result) })
      .catch(() => { if (active) setState({ synced: false }) })
    return () => { active = false }
  }, [invoice.id, invoice.status, sessionToken])

  const push = async () => {
    setBusy(true)
    setMessage('')
    try {
      const result = await window.zyroSevdesk.invoicePush(invoice.id, sessionToken)
      setState(result)
      setMessage(result.alreadySynced ? 'War bereits in sevDesk.' : 'An sevDesk übertragen.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!state) return <small>sevDesk: wird geprüft …</small>
  if (state.needsAttention) return <small className="sales-feedback">In sevDesk gebucht, hier storniert – Beleg in sevDesk bitte stornieren.</small>
  if (state.synced) {
    return <small>In sevDesk{state.syncedAt ? ` seit ${formatDateTime(state.syncedAt)}` : ''}{state.hasFile ? ' · PDF angehängt' : ''}</small>
  }
  if (invoice.status === 'Storniert') return null
  return (
    <>
      <button type="button" className="secondary-button small" onClick={push} disabled={busy}>
        {busy ? 'sevDesk …' : state.status === 'error' ? 'sevDesk erneut versuchen' : 'An sevDesk übertragen'}
      </button>
      {(message || state.error) && <small className="sales-feedback" role="status">{message || state.error}</small>}
    </>
  )
}

// Übersicht im Finanzbereich: offene Rechnungen/Einnahmen/Ausgaben, Fehler und „Alles übertragen“.
export function SevdeskPanel({ sessionToken }) {
  const [overview, setOverview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState([])

  const load = async () => {
    try {
      setOverview(await window.zyroSevdesk.overview(sessionToken))
    } catch (error) {
      setMessage(error.message)
    }
  }
  useEffect(() => { load() }, [])

  const pendingTotal = overview ? overview.pendingInvoices + overview.pendingIncome + overview.pendingExpenses : 0

  const syncAll = async () => {
    if (!window.confirm(`${pendingTotal} Beleg(e) an sevDesk übertragen? Bereits in sevDesk vorhandene Belegnummern werden nicht doppelt angelegt.`)) return
    setBusy(true)
    setMessage('')
    setFailed([])
    let synced = 0
    const errors = []
    try {
      // Pro Aufruf schafft der Server ~20 Belege – so lange wiederholen, bis nichts mehr geht.
      for (let round = 0; round < 50; round += 1) {
        const result = await window.zyroSevdesk.syncAll(sessionToken)
        synced += result.synced
        errors.push(...result.failed)
        setMessage(`${synced} übertragen …`)
        if (result.synced === 0 || result.remaining === 0) break
      }
      setFailed(errors)
      setMessage(`${synced} Beleg(e) an sevDesk übertragen${errors.length ? `, ${errors.length} mit Fehler` : ''}.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
      load()
    }
  }

  const errorList = failed.length ? failed : overview?.errors || []

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>sevDesk</h2>
          <p className="meta">Rechnungen, Einnahmen und Ausgaben inkl. Beleg an die Buchhaltung übertragen</p>
        </div>
        <button type="button" className="primary-button small" onClick={syncAll} disabled={busy || !overview || pendingTotal === 0}>
          {busy ? 'Überträgt …' : pendingTotal ? `Alles übertragen (${pendingTotal})` : 'Alles übertragen'}
        </button>
      </div>
      {overview && (
        <div className="finance-summary-grid">
          <div><span>Offene Rechnungen</span><strong>{overview.pendingInvoices}</strong></div>
          <div><span>Offene Einnahmen</span><strong>{overview.pendingIncome}</strong></div>
          <div><span>Offene Ausgaben</span><strong>{overview.pendingExpenses}</strong></div>
        </div>
      )}
      <p className="meta">
        Neue Belege werden stündlich automatisch übertragen{overview?.autoSyncFrom ? ` (ab ${formatDate(overview.autoSyncFrom)})` : ''}. Einnahmen aus Rechnungen kommen über die Rechnung und werden nicht doppelt gebucht.
      </p>
      {message && <p className="form-feedback" role="status">{message}</p>}
      {errorList.length > 0 && (
        <div className="finance-notice" role="status">
          <strong>Nicht übertragen:</strong>
          <ul>
            {errorList.map((item, index) => <li key={index}>{item.label}: {item.error}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
