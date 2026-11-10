import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyQmValues,
  collectQmValues,
  companyForQm,
  makeQmDocuments,
  qmGroups,
  qmPrintCss,
  qmSheetCss,
  renderQmSheet,
} from './qm-documents.js'

const createId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))
const formatDateTime = (value) => {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return ''
  }
}

// Druckt eine oder mehrere ausgefüllte Seiten in einem eigenen Fenster.
const printSheets = (sheets, title) => {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${qmPrintCss}</style></head><body>${sheets.join('')}<script>window.addEventListener('load',()=>{window.focus();window.print()})</script></body></html>`)
  printWindow.document.close()
  return true
}

const sheetWithValues = (doc, company, values) => {
  const container = document.createElement('div')
  container.innerHTML = renderQmSheet(doc, company)
  applyQmValues(container, values)
  container.querySelectorAll('[contenteditable]').forEach((element) => element.removeAttribute('contenteditable'))
  return container.innerHTML
}

function BehoerdenMappe({ companyDetails, bottlerDetails, records, onRecordsChange, currentUser }) {
  const companyKey = JSON.stringify(companyForQm(companyDetails, bottlerDetails))
  const company = useMemo(() => JSON.parse(companyKey), [companyKey])
  const documents = useMemo(() => makeQmDocuments(company), [company])
  const [selectedNo, setSelectedNo] = useState('')
  const [editingId, setEditingId] = useState('')
  const [recordName, setRecordName] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const sheetRef = useRef(null)
  const savedRecords = Array.isArray(records) ? records : []
  const selectedDocument = documents.find((doc) => doc.no === selectedNo)
  const editingRecord = savedRecords.find((record) => record.id === editingId)

  const missingCompanyFields = [
    !company.firma && 'Firmenname',
    !company.gf && 'Geschäftsführer',
    !company.register && 'Handelsregister',
    !company.sitz && 'Sitz der Gesellschaft',
  ].filter(Boolean)

  const recordsRef = useRef(savedRecords)
  recordsRef.current = savedRecords
  // Nur bei Wechsel des Formulars neu aufbauen, damit ein Cloud-Abgleich keine laufenden Eingaben überschreibt.
  useEffect(() => {
    if (!sheetRef.current || !selectedDocument) return
    sheetRef.current.innerHTML = renderQmSheet(selectedDocument, company)
    const record = recordsRef.current.find((entry) => entry.id === editingId)
    if (record) applyQmValues(sheetRef.current, record.values)
  }, [selectedDocument, company, editingId])

  const openDocument = (no, record = null) => {
    setSelectedNo(no)
    setEditingId(record?.id || '')
    setRecordName(record?.name || '')
    setMessage('')
  }

  const toggleCheckbox = (event) => {
    const box = event.target.closest?.('.cb')
    if (!box) return
    box.textContent = box.textContent === '☑' ? '☐' : '☑'
  }

  const saveRecord = () => {
    if (!selectedDocument || !sheetRef.current) return
    const values = collectQmValues(sheetRef.current)
    const name = recordName.trim() || `${selectedDocument.title} ${new Date().toLocaleDateString('de-DE')}`
    const now = new Date().toISOString()
    if (editingRecord) {
      onRecordsChange(savedRecords.map((record) => (record.id === editingRecord.id
        ? { ...record, name, values, updatedAt: now, updatedBy: currentUser?.name || '' }
        : record)))
      setMessage('Gespeichert und mit der Cloud abgeglichen.')
      return
    }
    const record = {
      id: createId(),
      no: selectedDocument.no,
      title: selectedDocument.title,
      name,
      values,
      createdAt: now,
      createdBy: currentUser?.name || '',
      updatedAt: now,
      updatedBy: currentUser?.name || '',
    }
    onRecordsChange([record, ...savedRecords])
    setEditingId(record.id)
    setRecordName(name)
    setMessage('Gespeichert und mit der Cloud abgeglichen.')
  }

  const deleteRecord = (record) => {
    if (!window.confirm(`„${record.name}“ wirklich löschen?`)) return
    onRecordsChange(savedRecords.filter((entry) => entry.id !== record.id))
    if (editingId === record.id) {
      setEditingId('')
      setRecordName('')
    }
  }

  const printCurrent = () => {
    if (!selectedDocument || !sheetRef.current) return
    const values = collectQmValues(sheetRef.current)
    if (!printSheets([sheetWithValues(selectedDocument, company, values)], `${selectedDocument.no} ${selectedDocument.title}`)) {
      setMessage('Das Druckfenster wurde blockiert. Bitte Pop-ups für Zyro erlauben.')
    }
  }

  const printAll = () => {
    if (!printSheets(documents.filter((doc) => doc.no < 'G').map((doc) => sheetWithValues(doc, company, null)), 'ZYRO Behördenmappe')) {
      setMessage('Das Druckfenster wurde blockiert. Bitte Pop-ups für Zyro erlauben.')
    }
  }

  const query = search.trim().toLowerCase()
  const filteredDocuments = documents.filter((doc) => !query || `${doc.no} ${doc.title}`.toLowerCase().includes(query))
  const groupedDocuments = Object.keys(qmGroups)
    .map((group) => ({ group, items: filteredDocuments.filter((doc) => doc.no.startsWith(group)) }))
    .filter((entry) => entry.items.length > 0)

  return (
    <section className="panel qm-panel">
      <style>{`${qmSheetCss}
.qm-layout{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:20px;align-items:start}
.qm-list{display:flex;flex-direction:column;gap:4px;max-height:75vh;overflow:auto}
.qm-list h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:14px 0 4px;opacity:.7}
.qm-list button{text-align:left;display:flex;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid transparent;background:transparent;cursor:pointer;color:inherit;font:inherit}
.qm-list button:hover{background:rgba(232,89,12,.08)}
.qm-list button.active{border-color:#E8590C;background:rgba(232,89,12,.12)}
.qm-list button b{color:#E8590C;min-width:32px}
.qm-sheet-wrap{overflow:auto;background:#eceef1;border-radius:12px;padding:18px}
.qm-sheet-wrap .qm-sheet{margin:0 auto}
.qm-records{margin:14px 0 0;display:flex;flex-direction:column;gap:6px}
.qm-records li{display:flex;justify-content:space-between;gap:10px;align-items:center;list-style:none;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,.03)}
.qm-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:12px}
@media (max-width: 900px){.qm-layout{grid-template-columns:1fr}.qm-sheet-wrap .qm-sheet{zoom:.55}}
`}</style>
      <div className="panel-header">
        <div>
          <h2>Behördenmappe & Formulare</h2>
          <span>{documents.length} Vorlagen · {savedRecords.length} ausgefüllte Dokumente (in der Cloud gespeichert)</span>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button small" onClick={printAll}>Komplette Behördenmappe drucken</button>
        </div>
      </div>
      {missingCompanyFields.length > 0 && (
        <p className="form-message">
          In den Firmendaten fehlen noch: {missingCompanyFields.join(', ')}. Diese Angaben erscheinen in allen Formularen – bitte im Bereich Admin → Firmendaten ergänzen.
        </p>
      )}
      <div className="qm-layout">
        <div>
          <label>
            Suchen
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="z. B. HACCP, Rückruf, Urlaub" />
          </label>
          <div className="qm-list">
            {groupedDocuments.map(({ group, items }) => (
              <div key={group}>
                <h3>{group} · {qmGroups[group]}</h3>
                {items.map((doc) => (
                  <button key={doc.no} type="button" className={selectedNo === doc.no && !editingId ? 'active' : ''} onClick={() => openDocument(doc.no)}>
                    <b>{doc.no}</b><span>{doc.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          {savedRecords.length > 0 && (
            <>
              <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', margin: '18px 0 4px', opacity: 0.7 }}>Ausgefüllte Dokumente</h3>
              <ul className="qm-records">
                {savedRecords.slice(0, 200).map((record) => (
                  <li key={record.id}>
                    <button type="button" className="text-button" onClick={() => openDocument(record.no, record)}>
                      <strong>{record.no}</strong> {record.name}
                      <br /><small>{formatDateTime(record.updatedAt)}{record.updatedBy ? ` · ${record.updatedBy}` : ''}</small>
                    </button>
                    {currentUser?.role === 'admin' && <button type="button" className="text-button danger" onClick={() => deleteRecord(record)} aria-label={`${record.name} löschen`}>✕</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          {selectedDocument ? (
            <>
              <div className="qm-toolbar">
                <label style={{ flex: 1, minWidth: 220 }}>
                  Bezeichnung
                  <input value={recordName} maxLength={140} onChange={(event) => setRecordName(event.target.value)} placeholder={`${selectedDocument.title} – z. B. Charge, Monat oder Mitarbeiter`} />
                </label>
                <button type="button" className="primary-button small" onClick={saveRecord}>{editingRecord ? 'Speichern' : 'Ausgefüllt speichern'}</button>
                {editingRecord && <button type="button" className="secondary-button small" onClick={() => openDocument(selectedDocument.no)}>Leeres Formular</button>}
                <button type="button" className="secondary-button small" onClick={printCurrent}>Drucken / PDF</button>
              </div>
              {message && <p className="form-message">{message}</p>}
              <div className="qm-sheet-wrap">
                <div ref={sheetRef} onClick={toggleCheckbox} />
              </div>
            </>
          ) : (
            <p>Links ein Formular wählen. Felder direkt im Formular ausfüllen, Kästchen anklicken, dann speichern oder drucken. Gespeicherte Dokumente stehen auf allen Geräten zur Verfügung.</p>
          )}
        </div>
      </div>
    </section>
  )
}

export default BehoerdenMappe
