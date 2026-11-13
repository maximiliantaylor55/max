// Lohnherstellung: Aufträge anderer Firmen – Anfrage, Bemusterung, Kalkulation, Angebot, Produktion, Auslieferung.
import { useMemo, useState } from 'react'
import {
  approvedSample,
  calculateContractJob,
  recipeCostPerDrinkLiter,
  checklistProgress,
  containerSizes,
  containerTypes,
  contractChecklist,
  contractJobStatuses,
  createContractJobForm,
  createSample,
  nextContractJobNumber,
  openContractStatuses,
  recipeSources,
  sampleStatuses,
  supplyOptions,
  validateContractJob,
} from './contract-manufacturing.js'

const euro = (value, digits = 2) => Number(value || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })
const num = (value, digits = 2) => Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: digits })
const today = () => new Date().toISOString().slice(0, 10)
const plural = (type) => ({ Dose: 'Dosen', 'PET-Flasche': 'PET-Flaschen', Glasflasche: 'Glasflaschen' })[type] || type || 'Gebinde'
const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('de-DE') : '–')

export default function ContractManufacturing({
  jobs, setJobs, recipes = [], rawMaterials = [], customers = [], companyDetails = {}, currentUserName = '', showPrintPreview, escapeHtml,
}) {
  const [form, setForm] = useState(createContractJobForm)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('offen')
  const [search, setSearch] = useState('')
  const list = useMemo(() => (Array.isArray(jobs) ? jobs : []), [jobs])

  const recipeFor = (job) => recipes.find((recipe) => String(recipe.id) === String(job.recipeId)) || null
  const calc = useMemo(() => calculateContractJob(form, recipeFor(form), rawMaterials), [form, recipes, rawMaterials]) // eslint-disable-line react-hooks/exhaustive-deps
  const recipeCost = useMemo(() => recipeCostPerDrinkLiter(recipeFor(form), rawMaterials), [form.recipeId, recipes, rawMaterials]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const open = list.filter((job) => openContractStatuses.includes(job.status))
    return {
      open: open.length,
      sampling: list.filter((job) => job.status === 'Bemusterung').length,
      openVolume: open.filter((job) => job.status !== 'Anfrage' && job.status !== 'Bemusterung').reduce((sum, job) => sum + Number(job.totals?.netTotal || 0), 0),
      units: open.reduce((sum, job) => sum + Number(job.totals?.quantity || 0), 0),
    }
  }, [list])

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase()
    return list
      .filter((job) => statusFilter === 'alle' || (statusFilter === 'offen' ? openContractStatuses.includes(job.status) : job.status === statusFilter))
      .filter((job) => !text || [job.number, job.clientName, job.productName, job.lotNumber].join(' ').toLowerCase().includes(text))
      .sort((a, b) => String(b.number || '').localeCompare(String(a.number || '')))
  }, [list, statusFilter, search])

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const handleInput = (event) => {
    const { name, value, type, checked } = event.target
    set(name, type === 'checkbox' ? checked : value)
  }

  const pickCustomer = (value) => {
    const customer = customers.find((entry) => String(entry.name || '').trim().toLowerCase() === value.trim().toLowerCase())
    setForm((current) => ({
      ...current,
      clientName: value,
      customerId: customer ? String(customer.id ?? '') : '',
      clientContact: customer?.contactName || current.clientContact,
      clientEmail: customer?.email || current.clientEmail,
      clientPhone: customer?.phone || current.clientPhone,
    }))
  }

  const pickRecipe = (recipeId) => {
    const recipe = recipes.find((entry) => String(entry.id) === String(recipeId))
    setForm((current) => ({ ...current, recipeId, productName: current.productName || recipe?.name || '' }))
  }

  // ---- Bemusterung ----
  const addSample = () => setForm((current) => ({
    ...current,
    samples: [...(current.samples || []), { ...createSample(current.samples), date: today() }],
    status: current.status === 'Anfrage' ? 'Bemusterung' : current.status,
  }))
  const updateSample = (id, field, value) => setForm((current) => {
    const samples = (current.samples || []).map((sample) => (sample.id === id ? { ...sample, [field]: value } : sample))
    const approved = field === 'status' && value === 'Freigegeben'
    return {
      ...current,
      samples,
      status: approved && ['Anfrage', 'Bemusterung'].includes(current.status) ? 'Muster freigegeben' : current.status,
      checklist: approved ? { ...(current.checklist || {}), samplesApproved: true } : current.checklist,
    }
  })
  const removeSample = (id) => setForm((current) => ({
    ...current,
    samples: (current.samples || []).filter((sample) => sample.id !== id).map((sample, index) => ({ ...sample, round: index + 1 })),
  }))

  const toggleCheck = (key) => setForm((current) => ({
    ...current,
    checklist: { ...(current.checklist || {}), [key]: !current.checklist?.[key] },
    ndaSigned: key === 'nda' ? !current.checklist?.nda : current.ndaSigned,
  }))

  const reset = () => {
    setForm(createContractJobForm())
    setEditingId(null)
  }

  const save = (event) => {
    event.preventDefault()
    const error = validateContractJob(form)
    if (error) {
      setMessage(error)
      return
    }
    const now = new Date().toISOString()
    const existing = list.find((job) => job.id === editingId)
    const totals = calculateContractJob(form, recipeFor(form), rawMaterials)
    const job = {
      ...existing,
      ...form,
      id: existing?.id ?? `lh-${Date.now().toString(36)}`,
      number: existing?.number || nextContractJobNumber(list),
      clientName: form.clientName.trim(),
      productName: form.productName.trim(),
      requestDate: form.requestDate || existing?.requestDate || today(),
      totals: { quantity: totals.quantity, drinkLiters: totals.drinkLiters, costTotal: totals.costTotal, netTotal: totals.netTotal, pricePerUnit: totals.pricePerUnit },
      history: [...(existing?.history || []), ...(existing?.status !== form.status ? [{ at: now, by: currentUserName, status: form.status }] : [])],
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || currentUserName,
      updatedAt: now,
    }
    setJobs((current) => (existing ? current.map((entry) => (entry.id === existing.id ? job : entry)) : [job, ...(current || [])]))
    setMessage(existing ? `Auftrag ${job.number} gespeichert.` : `Auftrag ${job.number} angelegt.`)
    reset()
  }

  const edit = (job) => {
    setForm({ ...createContractJobForm(), ...job })
    setEditingId(job.id)
    setMessage('')
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  const duplicate = (job) => {
    const { number } = job
    const rest = Object.fromEntries(Object.entries(job).filter(([key]) => !['id', 'number', 'history', 'createdAt', 'createdBy', 'updatedAt', 'totals'].includes(key)))
    setForm({ ...createContractJobForm(), ...rest, status: 'Anfrage', lotNumber: '', bestBefore: '', deliveryDate: '', checklist: { nda: Boolean(rest.checklist?.nda) }, samples: [] })
    setEditingId(null)
    setMessage(`Kopie von ${number} – Menge und Termine anpassen, dann speichern.`)
  }

  const remove = (job) => {
    if (!window.confirm(`Auftrag ${job.number} (${job.clientName} · ${job.productName}) wirklich löschen?`)) return
    setJobs((current) => current.filter((entry) => entry.id !== job.id))
    if (editingId === job.id) reset()
    setMessage(`Auftrag ${job.number} gelöscht.`)
  }

  const setStatus = (job, status) => {
    const now = new Date().toISOString()
    setJobs((current) => current.map((entry) => (entry.id === job.id
      ? { ...entry, status, updatedAt: now, history: [...(entry.history || []), { at: now, by: currentUserName, status }] }
      : entry)))
  }

  // ---- Ausdrucke ----
  const companyLine = [companyDetails.name, companyDetails.street, [companyDetails.postalCode, companyDetails.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  const printStyles = 'body{font:14px/1.5 Arial,sans-serif;color:#2b2119;margin:36px auto;max-width:820px;padding:0 24px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #7a4a2a;padding-bottom:16px;margin-bottom:24px}h1{font-size:26px;margin:4px 0}h2{font-size:16px;margin:24px 0 8px;color:#7a4a2a}.meta{color:#6b5a4a;font-size:12px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e3d9cf;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:#6b5a4a}.num{text-align:right;white-space:nowrap}.total td{font-weight:700;border-top:2px solid #2b2119}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}.box{border:1px solid #e3d9cf;padding:12px;border-radius:6px;white-space:pre-wrap}.check{display:flex;gap:8px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:60px}.signatures div{border-top:1px solid #6b5a4a;padding-top:6px;font-size:12px;color:#6b5a4a}@media print{body{margin:0 auto;padding:0}}'

  const openPrint = (title, body) => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${printStyles}</style></head><body>${body}</body></html>`)
    printWindow.document.close()
    showPrintPreview?.(printWindow)
  }

  const jobHeaderFields = (job, c) => `
    <div class="grid">
      <div><strong>Auftraggeber</strong><br>${escapeHtml(job.clientName)}${job.clientContact ? `<br>${escapeHtml(job.clientContact)}` : ''}${job.clientEmail ? `<br>${escapeHtml(job.clientEmail)}` : ''}</div>
      <div><strong>Produkt</strong><br>${escapeHtml(job.productName)}<br>${num(c.quantity, 0)} × ${escapeHtml(job.containerSize)} ml ${escapeHtml(job.containerType || '')} (${num(c.drinkLiters, 1)} l)</div>
    </div>`

  const printOffer = (job) => {
    const c = calculateContractJob(job, recipeFor(job), rawMaterials)
    const sample = approvedSample(job.samples)
    const supplied = [job.rawMaterialsBy === 'kunde' && 'Rohstoffe', job.packagingBy === 'kunde' && 'Verpackung/Gebinde'].filter(Boolean)
    openPrint(`Angebot ${job.number}`, `
      <header><div><p class="meta">${escapeHtml(companyLine)}</p><h1>Angebot Lohnherstellung</h1><p class="meta">Nr. ${escapeHtml(job.number)} · ${new Date().toLocaleDateString('de-DE')}</p></div>
      <div class="meta">Gültig 30 Tage<br>${escapeHtml(companyDetails.email || '')}<br>${escapeHtml(companyDetails.phone || '')}</div></header>
      ${jobHeaderFields(job, c)}
      <h2>Leistungsumfang</h2>
      <p>Herstellung und Abfüllung von ${num(c.quantity, 0)} ${escapeHtml(c.quantity === 1 ? (job.containerType || 'Gebinde') : plural(job.containerType))} à ${escapeHtml(job.containerSize)} ml „${escapeHtml(job.productName)}“
      ${job.recipeSource === 'kunde' ? 'nach Rezeptur des Auftraggebers' : job.recipeSource === 'entwicklung' ? 'nach von uns entwickelter Rezeptur' : 'nach unserer Rezeptur'}${sample ? `, gemäß freigegebenem Muster (Runde ${sample.round}${sample.variant ? `: ${escapeHtml(sample.variant)}` : ''})` : ''}.</p>
      ${supplied.length ? `<p>Vom Auftraggeber beigestellt: ${supplied.join(' und ')}.</p>` : ''}
      <table><thead><tr><th>Position</th><th class="num">Betrag netto</th></tr></thead><tbody>
        <tr><td>Lohnherstellung inkl. ${[job.rawMaterialsBy !== 'kunde' && 'Rohstoffe', job.packagingBy !== 'kunde' && 'Verpackung', 'Abfüllung', 'Rüsten/Reinigung', Number(c.fixedCost) > 0 && 'Qualitätssicherung'].filter(Boolean).join(', ')}</td><td class="num">${euro(c.netTotal)}</td></tr>
        <tr><td>Preis je ${escapeHtml(job.containerType || 'Gebinde')} (${escapeHtml(job.containerSize)} ml)</td><td class="num">${euro(c.pricePerUnit, 4)}</td></tr>
        <tr><td>zzgl. ${num(job.vatRate, 1)} % USt.</td><td class="num">${euro(c.vatAmount)}</td></tr>
        <tr class="total"><td>Gesamtbetrag brutto</td><td class="num">${euro(c.grossTotal)}</td></tr>
      </tbody></table>
      <h2>Konditionen</h2>
      <p>Liefertermin: ${formatDate(job.deliveryDate)} · Lieferung ab Werk, Mindestmenge wie angeboten. Mengentoleranz ± 3 %. Etikett/Kennzeichnung liegt in der Verantwortung des Auftraggebers und ist vor Produktion freizugeben.
      ${job.recipeSource === 'kunde' ? ' Die Rezeptur des Auftraggebers wird vertraulich behandelt und nicht für eigene Produkte verwendet.' : ''}</p>
      ${job.notes ? `<h2>Hinweise</h2><div class="box">${escapeHtml(job.notes)}</div>` : ''}
      <div class="signatures"><div>${escapeHtml(companyDetails.name || '')} · Datum / Unterschrift</div><div>Auftrag erteilt · ${escapeHtml(job.clientName)} · Datum / Unterschrift</div></div>`)
  }

  const printProductionSheet = (job) => {
    const recipe = recipeFor(job)
    const c = calculateContractJob(job, recipe, rawMaterials)
    const needs = c.materialNeeds.map((need) => `<tr><td>${escapeHtml(need.name)}</td><td class="num">${need.amount === null ? '–' : num(need.amount, 3)} ${escapeHtml(need.unit)}</td><td>☐</td></tr>`).join('')
    const progress = contractChecklist.map((item) => `<div class="check">${job.checklist?.[item.key] ? '☑' : '☐'} ${escapeHtml(item.label)}</div>`).join('')
    openPrint(`Produktionsblatt ${job.number}`, `
      <header><div><p class="meta">${escapeHtml(companyLine)}</p><h1>Produktionsblatt Lohnherstellung</h1><p class="meta">Auftrag ${escapeHtml(job.number)} · Status ${escapeHtml(job.status)}</p></div>
      <div class="meta">Charge: ${escapeHtml(job.lotNumber || '________')}<br>MHD: ${formatDate(job.bestBefore)}<br>Liefertermin: ${formatDate(job.deliveryDate)}</div></header>
      ${jobHeaderFields(job, c)}
      <h2>Rezeptur ${recipe ? `· ${escapeHtml(recipe.name)} (${escapeHtml(recipe.kind || 'Fertiges Getränk')}${recipe.kind === 'Konzentrat' && recipe.dilution ? `, 1 + ${escapeHtml(recipe.dilution)}` : ''})` : ''}</h2>
      ${job.rawMaterialsBy === 'kunde' ? '<p>Rohstoffe werden vom Auftraggeber beigestellt – Wareneingang prüfen und dokumentieren.</p>' : needs ? `<table><thead><tr><th>Rohstoff</th><th class="num">Bedarf gesamt</th><th>Abgewogen</th></tr></thead><tbody>${needs}</tbody></table>` : '<p>Keine Rezeptur mit Mengen hinterlegt.</p>'}
      <h2>Ablauf</h2>${progress}
      ${job.notes ? `<h2>Hinweise</h2><div class="box">${escapeHtml(job.notes)}</div>` : ''}
      <div class="signatures"><div>Produktion · Datum / Unterschrift</div><div>QS-Freigabe · Datum / Unterschrift</div></div>`)
  }

  const printSampleSheet = (job) => {
    const rows = (job.samples || []).map((sample) => `<tr><td>${sample.round}</td><td>${escapeHtml(sample.variant)}</td><td>${formatDate(sample.date)}</td><td>${escapeHtml(sample.quantity)}</td><td>${escapeHtml(sample.status)}</td><td>${escapeHtml(sample.rating)}</td><td>${escapeHtml(sample.feedback)}</td></tr>`).join('')
    openPrint(`Bemusterung ${job.number}`, `
      <header><div><p class="meta">${escapeHtml(companyLine)}</p><h1>Bemusterungsprotokoll</h1><p class="meta">Auftrag ${escapeHtml(job.number)} · ${escapeHtml(job.clientName)} · ${escapeHtml(job.productName)}</p></div><div class="meta">${new Date().toLocaleDateString('de-DE')}</div></header>
      <table><thead><tr><th>Runde</th><th>Variante</th><th>Datum</th><th>Menge</th><th>Status</th><th>Bewertung</th><th>Feedback</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Noch keine Muster.</td></tr>'}</tbody></table>
      <div class="signatures"><div>Muster freigegeben · ${escapeHtml(job.clientName)} · Datum / Unterschrift</div><div>${escapeHtml(companyDetails.name || '')} · Datum / Unterschrift</div></div>`)
  }

  const progress = checklistProgress(form.checklist)

  return (
    <section className="finance-workspace contract-workspace">
      <section className="stats-grid">
        <article className="stat-card primary"><span>Offene Aufträge</span><strong>{stats.open}</strong><small>Lohnherstellung</small></article>
        <article className="stat-card"><span>In Bemusterung</span><strong>{stats.sampling}</strong><small>Muster beim Kunden</small></article>
        <article className="stat-card"><span>Auftragsvolumen offen</span><strong>{euro(stats.openVolume, 0)}</strong><small>netto, ab Angebot</small></article>
        <article className="stat-card"><span>Gebinde geplant</span><strong>{num(stats.units, 0)}</strong><small>offene Aufträge</small></article>
      </section>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{editingId ? `Auftrag ${form.number || ''} bearbeiten` : 'Neuer Lohnherstellungs-Auftrag'}</h2>
            <p className="meta">Getränke für andere Firmen herstellen: Anfrage → Bemusterung → Angebot → Produktion → Auslieferung.</p>
          </div>
          <span>Admin · vertraulich</span>
        </div>
        <form className="form-grid contract-form" onSubmit={save}>
          <h3 className="full-width contract-section-title">Auftraggeber</h3>
          <label>
            Firma *
            <input value={form.clientName} onChange={(event) => pickCustomer(event.target.value)} list="contract-customers" placeholder="z. B. Musterbrause GmbH" />
            <datalist id="contract-customers">{customers.map((customer) => <option key={customer.id ?? customer.name} value={customer.name} />)}</datalist>
          </label>
          <label>Ansprechpartner<input name="clientContact" value={form.clientContact} onChange={handleInput} /></label>
          <label>E-Mail<input name="clientEmail" type="email" value={form.clientEmail} onChange={handleInput} /></label>
          <label>Telefon<input name="clientPhone" value={form.clientPhone} onChange={handleInput} /></label>

          <h3 className="full-width contract-section-title">Produkt &amp; Rezeptur</h3>
          <label>Produkt / Getränkename *<input name="productName" value={form.productName} onChange={handleInput} placeholder="z. B. Mate Lemon 330" /></label>
          <label>
            Rezeptur
            <select name="recipeSource" value={form.recipeSource} onChange={handleInput}>
              {Object.entries(recipeSources).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="full-width">
            Rezeptur aus „Rezepturen“ verknüpfen (für Kosten &amp; Rohstoffbedarf)
            <select value={form.recipeId} onChange={(event) => pickRecipe(event.target.value)}>
              <option value="">Keine – Kosten je Liter unten von Hand</option>
              {recipes.map((recipe) => <option key={recipe.id} value={String(recipe.id)}>{recipe.name} · {recipe.kind || 'Fertiges Getränk'}{recipe.kind === 'Konzentrat' && recipe.dilution ? ` 1+${recipe.dilution}` : ''} · {recipe.batchSize}</option>)}
            </select>
            {form.recipeId && <small className="meta">{recipeCost ? `Rohstoffkosten laut Rezeptur: ${euro(recipeCost.costPerLiter, 4)} je Liter Getränk${recipeCost.complete ? '' : ' (unvollständig bepreist)'}` : 'Rezeptur ohne Kosten – Batchgröße, Preise oder Mischverhältnis fehlen.'}</small>}
          </label>

          <h3 className="full-width contract-section-title">Menge &amp; Gebinde</h3>
          <label>
            Gebinde
            <select name="containerType" value={form.containerType} onChange={handleInput}>{containerTypes.map((type) => <option key={type}>{type}</option>)}</select>
          </label>
          <label>
            Füllmenge (ml)
            <input name="containerSize" list="contract-sizes" inputMode="decimal" value={form.containerSize} onChange={handleInput} />
            <datalist id="contract-sizes">{containerSizes.map((size) => <option key={size} value={size} />)}</datalist>
          </label>
          <label>Menge (Anzahl Gebinde) *<input name="quantity" inputMode="numeric" value={form.quantity} onChange={handleInput} placeholder="z. B. 10000" /></label>
          <label>
            Rohstoffe
            <select name="rawMaterialsBy" value={form.rawMaterialsBy} onChange={handleInput}>{Object.entries(supplyOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label>
            Verpackung (Dosen, Deckel, Etiketten)
            <select name="packagingBy" value={form.packagingBy} onChange={handleInput}>{Object.entries(supplyOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>

          <h3 className="full-width contract-section-title">Bemusterung</h3>
          <div className="full-width contract-samples">
            {(form.samples || []).length === 0 && <p className="meta">Noch keine Muster. Jede Runde mit Variante, Versand und Feedback des Auftraggebers festhalten.</p>}
            {(form.samples || []).map((sample) => (
              <div className={`contract-sample ${sample.status === 'Freigegeben' ? 'approved' : sample.status === 'Abgelehnt' ? 'rejected' : ''}`} key={sample.id}>
                <strong>Runde {sample.round}</strong>
                <input value={sample.variant} onChange={(event) => updateSample(sample.id, 'variant', event.target.value)} placeholder="Variante, z. B. V2 – 10 % weniger Zucker" aria-label="Variante" />
                <input type="date" value={sample.date} onChange={(event) => updateSample(sample.id, 'date', event.target.value)} aria-label="Datum" />
                <input value={sample.quantity} onChange={(event) => updateSample(sample.id, 'quantity', event.target.value)} placeholder="Menge, z. B. 6 × 330 ml" aria-label="Menge" />
                <input value={sample.shipping} onChange={(event) => updateSample(sample.id, 'shipping', event.target.value)} placeholder="Versand / Tracking" aria-label="Versand" />
                <input inputMode="decimal" value={sample.cost} onChange={(event) => updateSample(sample.id, 'cost', event.target.value)} placeholder="Kosten €" aria-label="Kosten" />
                <select value={sample.status} onChange={(event) => updateSample(sample.id, 'status', event.target.value)} aria-label="Status">{sampleStatuses.map((status) => <option key={status}>{status}</option>)}</select>
                <select value={sample.rating} onChange={(event) => updateSample(sample.id, 'rating', event.target.value)} aria-label="Bewertung">
                  <option value="">Bewertung</option>
                  {['1 – sehr gut', '2 – gut', '3 – ok', '4 – anpassen', '5 – passt nicht'].map((rating) => <option key={rating}>{rating}</option>)}
                </select>
                <textarea value={sample.feedback} onChange={(event) => updateSample(sample.id, 'feedback', event.target.value)} placeholder="Feedback: Süße, Säure, Aroma, Farbe, Kohlensäure …" aria-label="Feedback" />
                <button type="button" className="icon-button danger" onClick={() => removeSample(sample.id)} aria-label={`Runde ${sample.round} entfernen`}>✕</button>
              </div>
            ))}
            <div className="contract-sample-actions">
              <button type="button" className="secondary-button small" onClick={addSample}>+ Musterrunde</button>
              <label className="inline-check"><input type="checkbox" name="billSamples" checked={form.billSamples !== false} onChange={handleInput} /> Musterkosten ({euro(calc.sampleCost)}) in die Kalkulation</label>
            </div>
          </div>

          <h3 className="full-width contract-section-title">Kalkulation (€ netto)</h3>
          <label>Rohstoffkosten je Liter (leer = aus Rezeptur)<input name="rawMaterialCostPerLiter" inputMode="decimal" value={form.rawMaterialCostPerLiter} onChange={handleInput} placeholder={recipeCost ? num(recipeCost.costPerLiter, 4) : 'z. B. 0,35'} disabled={form.rawMaterialsBy === 'kunde'} /></label>
          <label>Dose + Deckel je Stück<input name="packagingPerUnit" inputMode="decimal" value={form.packagingPerUnit} onChange={handleInput} disabled={form.packagingBy === 'kunde'} /></label>
          <label>Etikett / Druck je Stück<input name="labelPerUnit" inputMode="decimal" value={form.labelPerUnit} onChange={handleInput} disabled={form.packagingBy === 'kunde'} /></label>
          <label>Abfülllohn je Stück<input name="fillingPerUnit" inputMode="decimal" value={form.fillingPerUnit} onChange={handleInput} /></label>
          <label>Tray / Palette / Folie je Stück<input name="palletPerUnit" inputMode="decimal" value={form.palletPerUnit} onChange={handleInput} /></label>
          <label>Rüsten &amp; Reinigung (pauschal)<input name="setupCost" inputMode="decimal" value={form.setupCost} onChange={handleInput} /></label>
          <label>Laboranalyse / QS (pauschal)<input name="labCost" inputMode="decimal" value={form.labCost} onChange={handleInput} /></label>
          <label>Rezepturentwicklung (pauschal)<input name="developmentCost" inputMode="decimal" value={form.developmentCost} onChange={handleInput} placeholder="0" /></label>
          <label>Sonstiges (Fracht, Lager …)<input name="otherCost" inputMode="decimal" value={form.otherCost} onChange={handleInput} placeholder="0" /></label>
          <label>Aufschlag / Marge (%)<input name="marginPercent" inputMode="decimal" value={form.marginPercent} onChange={handleInput} /></label>
          <label>
            USt. (%)
            <select name="vatRate" value={form.vatRate} onChange={handleInput}><option value="19">19</option><option value="7">7</option><option value="0">0</option></select>
          </label>

          <div className="full-width contract-calc">
            <table>
              <tbody>
                <tr><td>Rohstoffe ({num(calc.drinkLiters, 1)} l × {euro(calc.rawCostPerLiter, 4)}, {calc.rawCostSource})</td><td className="num">{euro(calc.rawMaterialsCost)}</td></tr>
                <tr><td>Verpackung &amp; Etikett</td><td className="num">{euro(calc.packagingCost)}</td></tr>
                <tr><td>Abfüllung &amp; Palettierung</td><td className="num">{euro(calc.fillingCost)}</td></tr>
                <tr><td>Fixkosten (Rüsten, Labor, Entwicklung, Muster, Sonstiges)</td><td className="num">{euro(calc.fixedCost)}</td></tr>
                <tr className="subtotal"><td>Herstellkosten · je Gebinde {euro(calc.costPerUnit, 4)}</td><td className="num">{euro(calc.costTotal)}</td></tr>
                <tr><td>Aufschlag {num(form.marginPercent, 1)} %</td><td className="num">{euro(calc.marginAmount)}</td></tr>
                <tr className="total"><td>Angebotspreis netto · je Gebinde <strong>{euro(calc.pricePerUnit, 4)}</strong> · je Liter {euro(calc.pricePerLiter, 3)}</td><td className="num">{euro(calc.netTotal)}</td></tr>
                <tr><td>Brutto inkl. {num(form.vatRate, 1)} % USt.</td><td className="num">{euro(calc.grossTotal)}</td></tr>
              </tbody>
            </table>
            {calc.warnings.length > 0 && <ul className="contract-warnings">{calc.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          </div>

          <h3 className="full-width contract-section-title">Termine, Charge &amp; Status</h3>
          <label>Anfrage vom<input name="requestDate" type="date" value={form.requestDate} onChange={handleInput} /></label>
          <label>Liefertermin<input name="deliveryDate" type="date" value={form.deliveryDate} onChange={handleInput} /></label>
          <label>Charge / Los<input name="lotNumber" value={form.lotNumber} onChange={handleInput} placeholder="z. B. LH26-014" /></label>
          <label>MHD<input name="bestBefore" type="date" value={form.bestBefore} onChange={handleInput} /></label>
          <label>
            Status
            <select name="status" value={form.status} onChange={handleInput}>{contractJobStatuses.map((status) => <option key={status}>{status}</option>)}</select>
          </label>

          <div className="full-width contract-checklist">
            <strong>Checkliste · {progress.done} von {progress.total} erledigt</strong>
            {contractChecklist.map((item) => (
              <label key={item.key} className="inline-check">
                <input type="checkbox" checked={Boolean(form.checklist?.[item.key])} onChange={() => toggleCheck(item.key)} />
                {item.label}
              </label>
            ))}
          </div>

          <label className="full-width">Notizen / Absprachen<textarea name="notes" value={form.notes} onChange={handleInput} placeholder="Besonderheiten, Allergene, Kohlensäuregehalt, Lieferadresse …" /></label>

          <button type="submit" className="primary-button full-width-button">{editingId ? 'Änderungen speichern' : 'Auftrag anlegen'}</button>
          {editingId && <button type="button" className="secondary-button full-width-button" onClick={reset}>Abbrechen</button>}
          {message && <p className="recipe-form-message full-width" role="status">{message}</p>}
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h2>Aufträge</h2><p className="meta">{filtered.length} von {list.length}</p></div>
          <div className="contract-filters">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Suchen: Nr., Kunde, Produkt, Charge" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="offen">Offene</option>
              <option value="alle">Alle</option>
              {contractJobStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="meta">Keine Aufträge. Oben den ersten Lohnherstellungs-Auftrag anlegen.</p>
        ) : (
          <div className="table-scroll contract-table-scroll">
            <table className="data-table contract-table">
              <thead><tr><th>Nr.</th><th>Auftraggeber / Produkt</th><th>Menge</th><th>Muster</th><th className="num">Netto</th><th>Liefertermin</th><th>Status</th><th /></tr></thead>
              <tbody>
                {filtered.map((job) => {
                  const sample = approvedSample(job.samples)
                  const jobProgress = checklistProgress(job.checklist)
                  return (
                    <tr key={job.id} className={editingId === job.id ? 'editing' : ''}>
                      <td><strong>{job.number}</strong></td>
                      <td><strong>{job.clientName}</strong><small className="table-subtext">{job.productName}{job.lotNumber ? ` · Charge ${job.lotNumber}` : ''}</small></td>
                      <td>{num(job.totals?.quantity ?? job.quantity, 0)} × {job.containerSize} ml</td>
                      <td>{(job.samples || []).length ? `${job.samples.length} Runde${job.samples.length === 1 ? '' : 'n'}${sample ? ' · ✓ frei' : ''}` : '–'}</td>
                      <td className="num">{euro(job.totals?.netTotal)}<small className="table-subtext">{euro(job.totals?.pricePerUnit, 4)} / Stk.</small></td>
                      <td>{formatDate(job.deliveryDate)}</td>
                      <td>
                        <select value={job.status} onChange={(event) => setStatus(job, event.target.value)} aria-label={`Status ${job.number}`}>
                          {contractJobStatuses.map((status) => <option key={status}>{status}</option>)}
                        </select>
                        <small className="table-subtext">Checkliste {jobProgress.done}/{jobProgress.total}</small>
                      </td>
                      <td className="row-actions contract-actions">
                        <button type="button" className="secondary-button small" onClick={() => edit(job)}>Bearbeiten</button>
                        <button type="button" className="secondary-button small" onClick={() => printOffer(job)}>Angebot</button>
                        <button type="button" className="secondary-button small" onClick={() => printSampleSheet(job)}>Bemusterung</button>
                        <button type="button" className="secondary-button small" onClick={() => printProductionSheet(job)}>Produktionsblatt</button>
                        <button type="button" className="secondary-button small" onClick={() => duplicate(job)}>Nachbestellung</button>
                        <button type="button" className="danger-button small" onClick={() => remove(job)}>Löschen</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
