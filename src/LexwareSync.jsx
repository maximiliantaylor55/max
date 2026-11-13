import { useEffect, useState } from 'react'

// Lexware Office: zeigt, ob eine Rechnung schon als Beleg in Lexware liegt, und überträgt sie auf Knopfdruck.
const formatDateTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

function LexwareSync({ invoice }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    window.zyroLexware.get(invoice.id)
      .then((result) => { if (active) setState(result) })
      .catch(() => { if (active) setState({ synced: false }) })
    return () => { active = false }
  }, [invoice.id, invoice.status])

  const push = async () => {
    setBusy(true)
    setMessage('')
    try {
      const result = await window.zyroLexware.push(invoice.id)
      setState(result)
      setMessage(result.alreadySynced ? 'War bereits in Lexware.' : 'An Lexware übertragen.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!state) return <small>Lexware: wird geprüft …</small>
  if (state.needsAttention) return <small className="sales-feedback">In Lexware gebucht, hier storniert – Beleg in Lexware bitte stornieren.</small>
  if (state.synced) {
    return <small title={state.voucherId}>In Lexware{state.syncedAt ? ` seit ${formatDateTime(state.syncedAt)}` : ''}{state.hasFile ? ' · PDF angehängt' : ''}</small>
  }
  if (invoice.status === 'Storniert') return null
  return (
    <>
      <button type="button" className="secondary-button small" onClick={push} disabled={busy}>
        {busy ? 'Lexware …' : state.status === 'error' ? 'Lexware erneut versuchen' : 'An Lexware übertragen'}
      </button>
      {(message || state.error) && <small className="sales-feedback" role="status">{message || state.error}</small>}
    </>
  )
}

export default LexwareSync
