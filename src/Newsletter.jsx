import { useEffect, useMemo, useRef, useState } from 'react'
import { renderNewsletterHtml } from './newsletter-render.js'

// ZYRO Newsletter: gestalten (Baukasten + Live-Vorschau), Abonnent:innen verwalten, versenden.
const DRAFT_KEY = 'zyro-newsletter-draft'
const blockLabels = {
  heading: 'Überschrift',
  text: 'Text',
  image: 'Bild',
  button: 'Button',
  highlight: 'Hervorhebung',
  divider: 'Trennlinie',
  spacer: 'Abstand',
}
const newBlock = (type) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  ...(type === 'heading' ? { text: 'Neue Überschrift', size: 'medium', align: 'left' } : {}),
  ...(type === 'text' ? { text: 'Dein Text. **Fett** mit Sternchen, Links als [Linktext](https://…).', align: 'left' } : {}),
  ...(type === 'image' ? { url: '', alt: '', link: '', caption: '', width: 'full' } : {}),
  ...(type === 'button' ? { text: 'Jetzt entdecken', url: 'https://xn--zyro-getrnke-ocb.de/shop', align: 'center', style: 'filled' } : {}),
  ...(type === 'highlight' ? { title: 'Nur für Abonnent:innen', text: '10 % Rabatt mit dem Code **ZYRO10**', align: 'center' } : {}),
  ...(type === 'spacer' ? { size: 'small' } : {}),
})
const templates = {
  launch: {
    subject: 'Neu bei ZYRO: Pink Yuzu ist da 🍑',
    preheader: 'Unsere neue Sorte – spritzig, exotisch, zuckerfrei.',
    blocks: [
      { type: 'image', url: '', alt: 'Neue ZYRO-Sorte', width: 'full' },
      { type: 'heading', text: 'Hallo {{vorname}}, unsere neue Sorte ist da!', size: 'large', align: 'left' },
      { type: 'text', text: 'Yuzu trifft Drachenfrucht – mit einem Hauch Ingwer. **Zuckerfrei**, spritzig und so erfrischend, dass eine Dose nie reicht.', align: 'left' },
      { type: 'button', text: 'Jetzt probieren', url: 'https://xn--zyro-getrnke-ocb.de/shop', align: 'center', style: 'filled' },
      { type: 'highlight', title: 'Nur für dich', text: 'Mit dem Code **HALLOYUZU** sparst du 10 % auf deine erste Bestellung.', align: 'center' },
    ],
  },
  news: {
    subject: 'Neuigkeiten von ZYRO',
    preheader: 'Was es Neues gibt.',
    blocks: [
      { type: 'heading', text: 'Hallo {{vorname}}!', size: 'large', align: 'left' },
      { type: 'text', text: 'Hier sind die neuesten Neuigkeiten von ZYRO …', align: 'left' },
      { type: 'divider' },
      { type: 'heading', text: 'Das ist neu', size: 'small', align: 'left' },
      { type: 'text', text: '…', align: 'left' },
      { type: 'button', text: 'Zum Shop', url: 'https://xn--zyro-getrnke-ocb.de/shop', align: 'center', style: 'filled' },
    ],
  },
}
const withIds = (campaign) => ({ ...campaign, blocks: (campaign.blocks || []).map((block) => ({ ...newBlock(block.type), ...block, id: newBlock(block.type).id })) })
const loadDraft = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null')
    if (saved?.blocks) return saved
  } catch { /* ignorieren */ }
  return withIds(templates.launch)
}
const formatDate = (value) => (value ? new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–')

const shrinkImage = (file) => new Promise((resolve, reject) => {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('Bitte ein JPG-, PNG-, WebP- oder GIF-Bild wählen.'))
  if (file.type === 'image/gif' && file.size <= 900 * 1024) {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'))
    return reader.readAsDataURL(file)
  }
  const image = new Image()
  const url = URL.createObjectURL(file)
  image.onload = () => {
    const scale = Math.min(1, 1200 / image.naturalWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    let quality = 0.86
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > 1.15 * 1024 * 1024 && quality > 0.5) {
      quality -= 0.08
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }
    resolve(dataUrl)
  }
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden.')) }
  image.src = url
})

function BlockEditor({ block, onChange, onUpload, uploading }) {
  const set = (key, value) => onChange({ ...block, [key]: value })
  const alignSelect = (
    <label>Ausrichtung
      <select value={block.align || 'left'} onChange={(event) => set('align', event.target.value)}>
        <option value="left">Links</option>
        <option value="center">Mittig</option>
      </select>
    </label>
  )
  if (block.type === 'heading') {
    return (
      <div className="nl-fields">
        <label className="nl-wide">Text<input value={block.text} maxLength={300} onChange={(event) => set('text', event.target.value)} /></label>
        <label>Größe
          <select value={block.size || 'medium'} onChange={(event) => set('size', event.target.value)}>
            <option value="large">Groß</option><option value="medium">Mittel</option><option value="small">Klein</option>
          </select>
        </label>
        {alignSelect}
      </div>
    )
  }
  if (block.type === 'text' || block.type === 'highlight') {
    return (
      <div className="nl-fields">
        {block.type === 'highlight' && <label className="nl-wide">Kleine Überschrift<input value={block.title || ''} maxLength={120} onChange={(event) => set('title', event.target.value)} /></label>}
        <label className="nl-wide">Text<textarea rows={4} value={block.text} maxLength={5000} onChange={(event) => set('text', event.target.value)} /></label>
        {alignSelect}
      </div>
    )
  }
  if (block.type === 'image') {
    return (
      <div className="nl-fields">
        <div className="nl-wide nl-image-row">
          {block.url ? <img src={block.url} alt="" className="nl-thumb" /> : <div className="nl-thumb nl-thumb-empty">Kein Bild</div>}
          <label className="secondary-button small nl-upload">
            {uploading ? 'Lädt hoch …' : block.url ? 'Bild ersetzen' : 'Bild hochladen'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUpload(file) }} />
          </label>
        </div>
        <label className="nl-wide">Oder Bild-Adresse (https://…)<input value={block.url} onChange={(event) => set('url', event.target.value)} /></label>
        <label>Beschreibung (Alt-Text)<input value={block.alt || ''} maxLength={200} onChange={(event) => set('alt', event.target.value)} /></label>
        <label>Breite
          <select value={block.width || 'full'} onChange={(event) => set('width', event.target.value)}>
            <option value="full">Randlos</option><option value="inset">Mit Rand, abgerundet</option>
          </select>
        </label>
        <label>Link beim Klick (optional)<input value={block.link || ''} placeholder="https://…" onChange={(event) => set('link', event.target.value)} /></label>
        <label>Bildunterschrift (optional)<input value={block.caption || ''} maxLength={400} onChange={(event) => set('caption', event.target.value)} /></label>
      </div>
    )
  }
  if (block.type === 'button') {
    return (
      <div className="nl-fields">
        <label>Beschriftung<input value={block.text} maxLength={60} onChange={(event) => set('text', event.target.value)} /></label>
        <label>Link<input value={block.url} placeholder="https://…" onChange={(event) => set('url', event.target.value)} /></label>
        <label>Stil
          <select value={block.style || 'filled'} onChange={(event) => set('style', event.target.value)}>
            <option value="filled">Gefüllt</option><option value="outline">Umrandet</option>
          </select>
        </label>
        {alignSelect}
      </div>
    )
  }
  if (block.type === 'spacer') {
    return (
      <div className="nl-fields">
        <label>Höhe
          <select value={block.size || 'small'} onChange={(event) => set('size', event.target.value)}>
            <option value="small">Klein</option><option value="large">Groß</option>
          </select>
        </label>
      </div>
    )
  }
  return null
}

function Newsletter({ sessionToken, defaultTestEmail = '' }) {
  const api = (action, payload) => window.zyroNewsletter.request(action, payload, sessionToken)
  const [view, setView] = useState('design')
  const [campaign, setCampaign] = useState(loadDraft)
  const [preview, setPreview] = useState('desktop')
  const [overview, setOverview] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [uploadingId, setUploadingId] = useState('')
  const [testEmail, setTestEmail] = useState(defaultTestEmail)
  const [progress, setProgress] = useState(null)
  const stopRef = useRef(false)

  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(campaign)) } catch { /* ignorieren */ }
  }, [campaign])

  const loadOverview = async () => {
    try {
      setOverview(await api('overview'))
    } catch (error) {
      setMessage(error.message)
    }
  }
  useEffect(() => { loadOverview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const previewHtml = useMemo(() => renderNewsletterHtml(campaign, {
    subscriber: { name: 'Max Muster' },
    unsubscribeUrl: '#',
  }), [campaign])

  const updateBlock = (id, next) => setCampaign((current) => ({ ...current, blocks: current.blocks.map((block) => (block.id === id ? next : block)) }))
  const moveBlock = (index, direction) => setCampaign((current) => {
    const blocks = [...current.blocks]
    const target = index + direction
    if (target < 0 || target >= blocks.length) return current
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    return { ...current, blocks }
  })
  const removeBlock = (id) => setCampaign((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== id) }))
  const duplicateBlock = (index) => setCampaign((current) => {
    const blocks = [...current.blocks]
    blocks.splice(index + 1, 0, { ...blocks[index], id: newBlock(blocks[index].type).id })
    return { ...current, blocks }
  })
  const addBlock = (type) => setCampaign((current) => ({ ...current, blocks: [...current.blocks, newBlock(type)] }))

  const uploadImage = async (block, file) => {
    setUploadingId(block.id)
    setMessage('')
    try {
      const dataUrl = await shrinkImage(file)
      const result = await api('upload-image', { dataUrl })
      updateBlock(block.id, { ...block, url: result.url, alt: block.alt || file.name.replace(/\.[^.]+$/, '') })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setUploadingId('')
    }
  }

  const sendTest = async () => {
    setBusy('test')
    setMessage('')
    try {
      await api('test', { campaign, to: testEmail })
      setMessage(`Testmail an ${testEmail} verschickt.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  const sendAll = async () => {
    const count = overview?.counts?.active || 0
    if (!count) return setMessage('Es gibt noch keine bestätigten Abonnent:innen.')
    if (!window.confirm(`Newsletter „${campaign.subject}“ jetzt an ${count} Abonnent:innen senden? Das kann nicht rückgängig gemacht werden.`)) return
    setBusy('send')
    setMessage('')
    stopRef.current = false
    try {
      const started = await api('start', { campaign })
      setProgress({ total: started.total, sent: 0, failed: 0 })
      let state = { done: false }
      while (!state.done && !stopRef.current) {
        state = await api('continue', { campaignId: started.campaignId })
        setProgress({ total: state.total, sent: state.sent, failed: state.failed })
      }
      setMessage(stopRef.current
        ? 'Versand pausiert. Die restlichen Empfänger werden nicht mehr angeschrieben.'
        : `Fertig: ${state.sent} von ${state.total} Newslettern verschickt${state.failed ? `, ${state.failed} fehlgeschlagen` : ''}.`)
      loadOverview()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy('')
    }
  }

  const deleteSubscriber = async (subscriber) => {
    if (!window.confirm(`${subscriber.email} endgültig aus der Liste löschen?`)) return
    try {
      await api('delete-subscriber', { id: subscriber.id })
      loadOverview()
    } catch (error) {
      setMessage(error.message)
    }
  }

  const exportCsv = () => {
    const rows = [['E-Mail', 'Name', 'Status', 'Angemeldet', 'Bestätigt'], ...(overview?.subscribers || []).map((s) => [s.email, s.name, s.status, s.createdAt || '', s.confirmedAt || ''])]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = `zyro-newsletter-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
  }

  const statusLabel = { active: 'Bestätigt', pending: 'Wartet auf Bestätigung', unsubscribed: 'Abgemeldet' }
  const counts = overview?.counts || { active: 0, pending: 0, unsubscribed: 0 }

  return (
    <section className="nl-shell">
      <header className="nl-header">
        <div>
          <p className="eyebrow">Marketing</p>
          <h2>Newsletter</h2>
        </div>
        <div className="nl-stats">
          <span><strong>{counts.active}</strong> bestätigt</span>
          <span><strong>{counts.pending}</strong> offen</span>
          <span><strong>{counts.unsubscribed}</strong> abgemeldet</span>
        </div>
        <div className="nl-tabs" role="tablist">
          {[['design', 'Gestalten'], ['subscribers', 'Abonnent:innen'], ['history', 'Versendet']].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
      </header>

      {message && <p className="nl-message" role="status">{message}</p>}

      {view === 'design' && (
        <div className="nl-design">
          <div className="nl-editor">
            <div className="panel nl-card">
              <div className="nl-fields">
                <label className="nl-wide">Betreff<input value={campaign.subject} maxLength={150} onChange={(event) => setCampaign({ ...campaign, subject: event.target.value })} /></label>
                <label className="nl-wide">Vorschautext (erscheint im Posteingang neben dem Betreff)<input value={campaign.preheader || ''} maxLength={200} onChange={(event) => setCampaign({ ...campaign, preheader: event.target.value })} /></label>
              </div>
              <div className="nl-template-row">
                <span>Vorlage laden:</span>
                <button type="button" className="secondary-button small" onClick={() => window.confirm('Aktuellen Entwurf durch die Vorlage „Neue Sorte“ ersetzen?') && setCampaign(withIds(templates.launch))}>Neue Sorte</button>
                <button type="button" className="secondary-button small" onClick={() => window.confirm('Aktuellen Entwurf durch die Vorlage „Neuigkeiten“ ersetzen?') && setCampaign(withIds(templates.news))}>Neuigkeiten</button>
              </div>
              <p className="nl-hint">Tipp: <code>{'{{vorname}}'}</code> wird durch den Vornamen ersetzt, <code>**fett**</code> macht Text fett, <code>[Text](https://…)</code> wird ein Link.</p>
            </div>

            {campaign.blocks.map((block, index) => (
              <div key={block.id} className="panel nl-card nl-block">
                <div className="nl-block-head">
                  <strong>{blockLabels[block.type] || block.type}</strong>
                  <div className="nl-block-actions">
                    <button type="button" title="Nach oben" disabled={index === 0} onClick={() => moveBlock(index, -1)}>↑</button>
                    <button type="button" title="Nach unten" disabled={index === campaign.blocks.length - 1} onClick={() => moveBlock(index, 1)}>↓</button>
                    <button type="button" title="Duplizieren" onClick={() => duplicateBlock(index)}>⧉</button>
                    <button type="button" title="Löschen" className="danger" onClick={() => removeBlock(block.id)}>✕</button>
                  </div>
                </div>
                <BlockEditor block={block} onChange={(next) => updateBlock(block.id, next)} onUpload={(file) => uploadImage(block, file)} uploading={uploadingId === block.id} />
              </div>
            ))}

            <div className="nl-add">
              <span>Baustein hinzufügen</span>
              {Object.entries(blockLabels).map(([type, label]) => (
                <button key={type} type="button" className="secondary-button small" onClick={() => addBlock(type)}>+ {label}</button>
              ))}
            </div>

            <div className="panel nl-card nl-send">
              <div className="nl-fields">
                <label className="nl-wide">Testmail an<input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="deine@adresse.de" /></label>
              </div>
              <div className="nl-send-actions">
                <button type="button" className="secondary-button" disabled={busy !== '' || !testEmail} onClick={sendTest}>{busy === 'test' ? 'Sendet …' : 'Testmail senden'}</button>
                <button type="button" className="primary-button" disabled={busy !== '' || !counts.active} onClick={sendAll}>{busy === 'send' ? 'Wird versendet …' : `An ${counts.active} Abonnent:innen senden`}</button>
              </div>
              {progress && (
                <div className="nl-progress" aria-live="polite">
                  <div className="nl-progress-bar"><span style={{ width: `${progress.total ? Math.round((progress.sent + progress.failed) / progress.total * 100) : 0}%` }} /></div>
                  <small>{progress.sent} von {progress.total} verschickt{progress.failed ? ` · ${progress.failed} fehlgeschlagen` : ''}</small>
                  {busy === 'send' && <button type="button" className="secondary-button small" onClick={() => { stopRef.current = true }}>Versand pausieren</button>}
                </div>
              )}
            </div>
          </div>

          <div className="nl-preview">
            <div className="nl-preview-head">
              <strong>Vorschau</strong>
              <div className="nl-tabs small">
                <button type="button" className={preview === 'desktop' ? 'active' : ''} onClick={() => setPreview('desktop')}>Desktop</button>
                <button type="button" className={preview === 'mobile' ? 'active' : ''} onClick={() => setPreview('mobile')}>Handy</button>
              </div>
            </div>
            <div className="nl-inbox">
              <strong>{campaign.subject || 'Betreff'}</strong>
              <span>ZYRO · {campaign.preheader || 'Vorschautext'}</span>
            </div>
            <iframe title="Newsletter-Vorschau" className={`nl-frame ${preview}`} srcDoc={previewHtml} sandbox="" />
          </div>
        </div>
      )}

      {view === 'subscribers' && (
        <div className="panel nl-card">
          <div className="nl-table-head">
            <p>Neue Abonnent:innen melden sich auf der Website an und bestätigen per E-Mail-Link. Erst dann bekommen sie Newsletter.</p>
            <button type="button" className="secondary-button small" onClick={exportCsv} disabled={!overview?.subscribers?.length}>Als CSV exportieren</button>
          </div>
          {!overview?.subscribers?.length ? <p>Noch keine Anmeldungen.</p> : (
            <div className="nl-table-wrap">
              <table className="nl-table">
                <thead><tr><th>E-Mail</th><th>Name</th><th>Status</th><th>Angemeldet</th><th>Bestätigt</th><th /></tr></thead>
                <tbody>
                  {overview.subscribers.map((subscriber) => (
                    <tr key={subscriber.id}>
                      <td>{subscriber.email}</td>
                      <td>{subscriber.name || '–'}</td>
                      <td><span className={`nl-badge ${subscriber.status}`}>{statusLabel[subscriber.status] || subscriber.status}</span></td>
                      <td>{formatDate(subscriber.createdAt)}</td>
                      <td>{formatDate(subscriber.confirmedAt)}</td>
                      <td><button type="button" className="secondary-button small" onClick={() => deleteSubscriber(subscriber)}>Löschen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'history' && (
        <div className="panel nl-card">
          {!overview?.campaigns?.length ? <p>Noch kein Newsletter verschickt.</p> : (
            <div className="nl-table-wrap">
              <table className="nl-table">
                <thead><tr><th>Betreff</th><th>Gesendet</th><th>Ergebnis</th><th /></tr></thead>
                <tbody>
                  {overview.campaigns.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.subject}</td>
                      <td>{formatDate(entry.finishedAt || entry.createdAt)}</td>
                      <td>{entry.sent} von {entry.total}{entry.failed ? ` · ${entry.failed} Fehler` : ''}{entry.status === 'sending' ? ' · unvollständig' : ''}</td>
                      <td><button type="button" className="secondary-button small" onClick={() => { setCampaign(withIds(entry.campaign)); setView('design') }}>Als Vorlage öffnen</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default Newsletter
