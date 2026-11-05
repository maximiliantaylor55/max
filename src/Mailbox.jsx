import { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'

const emptySettings = { email: '', password: '', displayName: 'Liberty Street Food', signature: 'Mit freundlichen Grüßen\nLiberty Street Food GmbH\nwww.zyro-78855.web.app', imapHost: 'imap.strato.de', imapPort: 993, smtpHost: 'smtp.strato.de', smtpPort: 465 }

const formatDate = (value) => (value ? new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '')
const formatFileSize = (size) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / (1024 * 1024)).toFixed(1)} MB`
const emailHtmlConfig = {
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'meta', 'base', 'link'],
}
const linkifyEmailText = (text) => String(text).split(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi).map((part, index) => {
  if (!/^(https?:\/\/|www\.)/i.test(part)) return part
  const suffix = part.match(/[.,!?;:)]+$/)?.[0] || ''
  const label = part.slice(0, part.length - suffix.length)
  const href = /^www\./i.test(label) ? `https://${label}` : label
  return <span key={index}><a href={href}>{label}</a>{suffix}</span>
})
const readAttachment = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => {
    const result = String(reader.result || '')
    const contentBase64 = result.split(',')[1]
    if (!contentBase64) {
      reject(new Error(`Datei „${file.name}“ konnte nicht gelesen werden.`))
      return
    }
    resolve({ filename: file.name, contentType: file.type || 'application/octet-stream', contentBase64, size: file.size })
  }
  reader.onerror = () => reject(new Error(`Datei „${file.name}“ konnte nicht gelesen werden.`))
  reader.readAsDataURL(file)
})

export default function Mailbox({ sessionToken, userName = '', onUnreadCountChange = () => {}, onSaveAttachments = () => {} }) {
  const api = window.zyroMailbox
  const [settings, setSettings] = useState(null)
  const [draft, setDraft] = useState(emptySettings)
  const [showSettings, setShowSettings] = useState(false)
  const [folder, setFolder] = useState('inbox')
  const [folders, setFolders] = useState([])
  const foldersRef = useRef([])
  const [messages, setMessages] = useState([])
  const [selected, setSelected] = useState(null)
  const [compose, setCompose] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const fail = (err) => { setError(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); setNotice('') }

  const folderRole = (targetFolder) => folders.find((entry) => (
    entry.path === targetFolder || entry.role === targetFolder
  ))?.role || targetFolder
  const folderLabel = (entry) => {
    const sameRoleCount = folders.filter((folderEntry) => folderEntry.role === entry.role).length
    if (sameRoleCount > 1 || entry.role === 'folder') return entry.name
    if (entry.role === 'sent') return 'Gesendet'
    if (entry.role === 'spam') return 'Spam/Junk'
    if (entry.role === 'trash') return 'Papierkorb'
    return entry.name
  }

  const refreshFolders = useCallback(async () => {
    try {
      const result = await api.listFolders(sessionToken)
      foldersRef.current = result.folders
      setFolders(result.folders)
      setFolder((current) => current !== 'inbox' && !result.folders.some((entry) => entry.path === current) ? 'inbox' : current)
    } catch (err) { fail(err) }
  }, [api, sessionToken])

  const refresh = useCallback(async (targetFolder = folder) => {
    setBusy(true); setError('')
    try {
      const result = await api.list({ folder: targetFolder, limit: 60 }, sessionToken)
      setMessages(result.messages)
      if ((foldersRef.current.find((entry) => entry.path === targetFolder || entry.role === targetFolder)?.role || targetFolder) === 'inbox') {
        onUnreadCountChange(result.messages.filter((message) => !message.seen).length)
      }
    } catch (err) { fail(err) } finally { setBusy(false) }
  }, [api, folder, onUnreadCountChange, sessionToken])

  const refreshUnreadCount = useCallback(async () => {
    try {
      const result = await api.list({ folder: 'inbox', limit: 60 }, sessionToken)
      onUnreadCountChange(result.messages.filter((message) => !message.seen).length)
    } catch (err) { fail(err) }
  }, [api, onUnreadCountChange, sessionToken])

  useEffect(() => {
    if (!api) return
    api.getSettings(sessionToken).then((value) => {
      setSettings(value)
      setDraft({ ...emptySettings, ...value, password: '' })
      setShowSettings(!value.configured)
      if (!value.configured) onUnreadCountChange(0)
    }).catch(fail)
  }, [api, onUnreadCountChange, sessionToken])

  useEffect(() => {
    if (!settings?.configured) return undefined
    refreshFolders()
    refresh(folder)
    refreshUnreadCount()
    const timer = setInterval(() => refreshUnreadCount(), 90000)
    return () => clearInterval(timer)
  }, [settings?.configured, folder, refresh, refreshFolders, refreshUnreadCount])

  if (!api) return <section className="panel"><h2>Postfach</h2><p>Das Postfach ist nur in der Desktop-App verfügbar.</p></section>

  const saveSettings = async (event) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await api.saveSettings(draft, sessionToken)
      const value = await api.getSettings(sessionToken)
      setSettings(value); setDraft({ ...emptySettings, ...value, password: '' }); setShowSettings(false)
      await refreshFolders()
      setNotice('Postfach verbunden und in der Cloud gespeichert.')
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  const removeSettings = async () => {
    if (!window.confirm('Postfach-Zugang aus der Cloud entfernen? Das Postfach wird auf allen PCs getrennt.')) return
    try {
      await api.remove(sessionToken)
      setSettings({ configured: false }); setMessages([]); setFolders([]); setSelected(null); setShowSettings(true); onUnreadCountChange(0)
      foldersRef.current = []
      setNotice('Postfach-Zugang wurde aus der Cloud entfernt.')
    } catch (err) { fail(err) }
  }

  const open = async (message) => {
    setError(''); setNotice(''); setCompose(null)
    try {
      const full = await api.read({ folder, uid: message.uid }, sessionToken)
      setSelected(full)
      setMessages((items) => {
        const updated = items.map((item) => (item.uid === message.uid ? { ...item, seen: true } : item))
        if (folderRole(folder) === 'inbox') onUnreadCountChange(updated.filter((item) => !item.seen).length)
        return updated
      })
      const attachments = Array.isArray(full.attachments) ? full.attachments : []
      if (attachments.some((attachment) => attachment.available)) {
        try {
          const result = await onSaveAttachments({
            attachments,
            folder,
            mailboxEmail: settings?.email || '',
            message: full,
          })
          if (result?.message) setNotice(result.message)
        } catch (err) {
          setError(`Anhänge konnten nicht im Dokumentenarchiv gespeichert werden: ${err.message || err}`)
        }
      }
    } catch (err) { fail(err) }
  }

  const signatureForUser = () => {
    const signature = String(settings?.signature || '').trim()
    const name = String(userName || '').trim()
    if (!signature || !name) return signature
    if (/\{name\}/i.test(signature)) return signature.replace(/\{name\}/gi, name)
    const lines = signature.split('\n')
    if (lines.some((line) => line.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return signature
    const greetingIndex = lines.findIndex((line) => /^(mit freundlichen grüßen|freundliche grüße|viele grüße|beste grüße|herzliche grüße)[,! ]*$/i.test(line.trim()))
    lines.splice(greetingIndex < 0 ? 0 : greetingIndex + 1, 0, name)
    return lines.join('\n')
  }

  const withSignature = (body) => {
    const signature = signatureForUser()
    return signature ? `${body}\n-- \n${signature}` : body
  }

  const openEmailLink = async (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!anchor) return
    event.preventDefault()
    try {
      await api.openLink(anchor.href, sessionToken)
    } catch (err) {
      fail(err)
    }
  }

  const startReply = () => setCompose({
    to: selected.replyTo,
    subject: /^(re|aw):/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`,
    text: withSignature(`\n`) + `\n\n--- ${selected.from} schrieb am ${formatDate(selected.date)} ---\n${selected.text.split('\n').map((line) => `> ${line}`).join('\n')}`,
    inReplyTo: selected.messageId,
    references: `${selected.references} ${selected.messageId}`.trim(),
    attachments: [],
  })

  const addAttachments = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return
    const currentAttachments = compose.attachments || []
    const maxFileSize = 5 * 1024 * 1024
    const maxTotalSize = 7 * 1024 * 1024
    if (currentAttachments.length + files.length > 10) {
      setError('Maximal 10 Anhänge pro E-Mail.')
      return
    }
    if (files.some((file) => file.size < 1 || file.size > maxFileSize)) {
      setError('Jeder Anhang muss zwischen 1 Byte und 5 MB groß sein.')
      return
    }
    if (currentAttachments.reduce((total, file) => total + file.size, 0) + files.reduce((total, file) => total + file.size, 0) > maxTotalSize) {
      setError('Anhänge dürfen zusammen höchstens 7 MB groß sein.')
      return
    }
    setError('')
    try {
      const attachments = await Promise.all(files.map(readAttachment))
      setCompose((current) => current ? { ...current, attachments: [...(current.attachments || []), ...attachments] } : current)
    } catch (err) {
      fail(err)
    }
  }

  const send = async (event) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api.send(compose, sessionToken)
      setCompose(null)
      if (result.sentFolderSaved) {
        const sentFolder = folders.find((entry) => entry.role === 'sent')?.path || 'sent'
        setFolder(sentFolder)
        setSelected(null)
        setNotice('E-Mail gesendet und im Ordner „Gesendet“ gespeichert.')
        await refresh(sentFolder)
      } else {
        setNotice(`E-Mail wurde gesendet, aber die Kopie konnte nicht gespeichert werden: ${result.sentFolderError || 'Unbekannter Fehler'}`)
      }
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  const remove = async () => {
    const permanent = folderRole(folder) === 'trash' || !folders.some((entry) => entry.role === 'trash')
    if (!window.confirm(permanent
      ? 'Für dieses Postfach gibt es keinen erreichbaren Papierkorb. Diese E-Mail endgültig löschen?'
      : 'Diese E-Mail in den Papierkorb verschieben?')) return
    try {
      await api.deleteMessage({ folder, uid: selected.uid }, sessionToken)
      setSelected(null); await refresh()
      if (permanent) setNotice('E-Mail endgültig gelöscht.')
      else setNotice('E-Mail in den Papierkorb verschoben.')
    } catch (err) { fail(err) }
  }

  const moveSelected = async (targetFolder, message) => {
    try {
      await api.moveMessage({ folder, toFolder: targetFolder, uid: message.uid }, sessionToken)
      setSelected(null)
      await refresh()
      await refreshUnreadCount()
      setNotice(targetFolder === 'spam' ? 'E-Mail in Spam/Junk verschoben.' : 'E-Mail in den Posteingang zurückgeholt.')
    } catch (err) { fail(err) }
  }

  const field = (name) => ({ value: draft[name] ?? '', onChange: (event) => setDraft((current) => ({ ...current, [name]: event.target.value })) })

  return (
    <section className="mailbox-page">
      <div className="panel mailbox-head">
        <h2>Postfach {settings?.configured && <small>{settings.email}</small>}</h2>
        <div className="mailbox-actions">
          {settings?.configured && (
            <>
              <button type="button" className={folder === 'inbox' ? 'primary-button small' : 'secondary-button small'} onClick={() => { setFolder('inbox'); setSelected(null) }}>Posteingang</button>
              {folders.filter((entry) => entry.role !== 'inbox').map((entry) => (
                <button
                  type="button"
                  key={entry.path}
                  className={folder === entry.path ? 'primary-button small' : 'secondary-button small'}
                  onClick={() => { setFolder(entry.path); setSelected(null) }}
                >
                  {folderLabel(entry)}
                </button>
              ))}
              <button type="button" className="secondary-button small" disabled={busy} onClick={() => refresh()}>{busy ? 'Lädt …' : 'Aktualisieren'}</button>
              <button type="button" className="primary-button small" onClick={() => { setSelected(null); setCompose({ to: '', subject: '', text: withSignature('\n'), attachments: [] }) }}>Neue E-Mail</button>
            </>
          )}
          <button type="button" className="secondary-button small" onClick={() => setShowSettings((value) => !value)}>Einstellungen</button>
        </div>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {showSettings && (
        <form className="panel mailbox-settings" onSubmit={saveSettings}>
          <h3>Postfach verbinden (Standard: Strato)</h3>
          <label>E-Mail-Adresse<input type="text" inputMode="email" required {...field('email')} /></label>
          <label>Passwort {settings?.configured && '(leer lassen = unverändert)'}<input type="password" autoComplete="new-password" required={!settings?.configured} {...field('password')} /></label>
          <label>Absendername<input type="text" {...field('displayName')} /></label>
          <label>Signatur (dein Name „{userName}“ wird automatisch ergänzt; alternativ {`{name}`} als Platzhalter verwenden)<textarea rows="5" maxLength="1000" {...field('signature')} /></label>
          <label>IMAP-Server<input type="text" required {...field('imapHost')} /></label>
          <label>IMAP-Port<input type="number" required {...field('imapPort')} /></label>
          <label>SMTP-Server<input type="text" required {...field('smtpHost')} /></label>
          <label>SMTP-Port<input type="number" required {...field('smtpPort')} /></label>
          <small>Das Passwort wird verschlüsselt in der Cloud gespeichert, damit Admins das Postfach auf mehreren Desktop-PCs nutzen können. Es ist nicht Ende-zu-Ende-verschlüsselt. Bei aktivierter Zwei-Faktor-Anmeldung ein App-Passwort verwenden.</small>
          <div className="mailbox-actions">
            <button type="submit" className="primary-button small" disabled={busy}>{busy ? 'Prüfe Verbindung …' : 'Verbinden & speichern'}</button>
            {settings?.configured && <button type="button" className="secondary-button small" onClick={removeSettings}>Zugang entfernen</button>}
          </div>
        </form>
      )}

      {settings?.configured && (
        <div className="mailbox-layout">
          <ul className="panel mailbox-list">
            {messages.length === 0 && <li className="mailbox-empty">{busy ? 'Lädt …' : 'Keine E-Mails.'}</li>}
            {messages.map((message) => (
              <li key={message.uid} className={`mailbox-item ${message.seen ? '' : 'unread'}`}>
                <button type="button" className={selected?.uid === message.uid ? 'active' : ''} aria-label={`${message.seen ? 'Gelesen' : 'Ungelesen'}: ${message.subject}`} onClick={() => open(message)}>
                  <strong>{folderRole(folder) === 'sent' ? message.to : message.from}</strong>
                  <span>{message.subject}</span>
                  <small>{!message.seen && folderRole(folder) === 'inbox' && <span className="mailbox-unread-label">UNGLESEN · </span>}{formatDate(message.date)}</small>
                </button>
              </li>
            ))}
          </ul>
          <div className="panel mailbox-view">
            {compose ? (
              <form onSubmit={send}>
                <h3>{compose.inReplyTo ? 'Antworten' : 'Neue E-Mail'}</h3>
                <label>An<input type="text" required value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} /></label>
                <label>Betreff<input type="text" required value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></label>
                <label>Nachricht<textarea rows="14" required value={compose.text} onChange={(event) => setCompose({ ...compose, text: event.target.value })} /></label>
                <label>Anhänge (max. 10 Dateien, je 5 MB; insgesamt 7 MB)
                  <input type="file" multiple disabled={busy} onChange={addAttachments} />
                </label>
                {(compose.attachments || []).length > 0 && (
                  <ul className="mailbox-attachments">
                    {compose.attachments.map((file, index) => (
                      <li key={`${file.filename}-${index}`}>
                        <span>{file.filename} · {formatFileSize(file.size)}</span>
                        <button type="button" className="secondary-button small" disabled={busy} onClick={() => setCompose((current) => ({ ...current, attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index) }))}>Entfernen</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mailbox-actions">
                  <button type="submit" className="primary-button small" disabled={busy}>{busy ? 'Sende …' : 'Senden'}</button>
                  <button type="button" className="secondary-button small" onClick={() => setCompose(null)}>Abbrechen</button>
                </div>
              </form>
            ) : selected ? (
              <article>
                <h3>{selected.subject}</h3>
                <p className="mailbox-meta">Von: {selected.from}<br />An: {selected.to}<br />{formatDate(selected.date)}</p>
                {selected.attachments?.length > 0 && (
                  <section className="mailbox-attachment-section">
                    <h4>Anhänge ({selected.attachments.length})</h4>
                    <ul className="mailbox-attachments">
                      {selected.attachments.map((file) => {
                        const dataUrl = file.available ? `data:${file.contentType};base64,${file.contentBase64}` : ''
                        const previewable = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.contentType)
                        return (
                          <li key={`${selected.uid}-${file.index}`}>
                            <span>{file.name} · {formatFileSize(file.size)}</span>
                            {file.available ? (
                              <div className="mailbox-actions">
                                {previewable && <a className="secondary-button small" href={dataUrl} target="_blank" rel="noopener noreferrer">Öffnen</a>}
                                <a className="secondary-button small" href={dataUrl} download={file.name}>Herunterladen</a>
                              </div>
                            ) : <small>Zu groß oder nicht lesbar; Inhalt kann hier nicht geladen werden.</small>}
                          </li>
                        )
                      })}
                    </ul>
                    <small>Verfügbare Anhänge bis 2 MB werden beim Öffnen automatisch im Dokumentenarchiv abgelegt.</small>
                  </section>
                )}
                {selected.html ? (
                  <div
                    className="mailbox-body mailbox-html"
                    onClick={openEmailLink}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.html, emailHtmlConfig) }}
                  />
                ) : (
                  <pre className="mailbox-body" onClick={openEmailLink}>{linkifyEmailText(selected.text || '(kein Text)')}</pre>
                )}
                <div className="mailbox-actions">
                  {folderRole(folder) === 'inbox' && <button type="button" className="primary-button small" onClick={startReply}>Antworten</button>}
                  {folderRole(folder) !== 'sent' && folderRole(folder) !== 'trash' && (
                    folderRole(folder) === 'spam'
                      ? <button type="button" className="secondary-button small" onClick={() => moveSelected('inbox', selected)}>Kein Spam · in Posteingang</button>
                      : folders.some((entry) => entry.role === 'spam')
                        ? <button type="button" className="secondary-button small" onClick={() => moveSelected('spam', selected)}>Als Spam markieren</button>
                        : null
                  )}
                  {folderRole(folder) === 'trash' && <button type="button" className="secondary-button small" onClick={() => moveSelected('inbox', selected)}>Wiederherstellen</button>}
                  <button type="button" className="secondary-button small" onClick={remove}>Löschen</button>
                </div>
              </article>
            ) : <p>E-Mail auswählen, um sie zu lesen.</p>}
          </div>
        </div>
      )}
      {settings?.configured && !folders.some((entry) => entry.role === 'spam') && (
        <p className="meta">Auf dem Mailserver wurde kein Spam-/Junk-Ordner gefunden. Prüfe, ob der Spamordner beim Anbieter eingerichtet ist.</p>
      )}
    </section>
  )
}
