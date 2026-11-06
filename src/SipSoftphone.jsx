import { useEffect, useRef, useState } from 'react'
import { Invitation, Inviter, Registerer, RegistererState, SessionState, UserAgent } from 'sip.js'

const emptySettings = {
  websocketServer: '',
  sipUri: '',
  username: '',
  displayName: '',
}

const initialDraft = { ...emptySettings, password: '' }

const phoneDestination = (value, sipUri) => {
  const destination = String(value || '').trim()
  if (/^sips?:[^@\s]+@[^@\s]+$/i.test(destination)) return destination
  const number = destination.replace(/[\s()./-]/g, '')
  if (!/^\+?\d{6,20}$/.test(number)) throw new Error('Bitte eine gültige Telefonnummer mit Vorwahl eingeben.')
  const domain = String(sipUri).split('@').pop()
  if (!domain) throw new Error('Die SIP-Adresse enthält keine Provider-Domain.')
  return `sip:${number}@${domain}`
}

export default function SipSoftphone({ sessionToken, isAdmin }) {
  const api = window.zyroSipSoftphone
  const [settings, setSettings] = useState(emptySettings)
  const [draft, setDraft] = useState(initialDraft)
  const [configured, setConfigured] = useState(false)
  const [editing, setEditing] = useState(false)
  const [destination, setDestination] = useState('')
  const [connectionState, setConnectionState] = useState('getrennt')
  const [callState, setCallState] = useState('')
  const [callParty, setCallParty] = useState('')
  const [muted, setMuted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const userAgentRef = useRef(null)
  const registererRef = useRef(null)
  const sessionRef = useRef(null)
  const audioRef = useRef(null)

  useEffect(() => {
    if (!api || !isAdmin) return undefined
    let active = true
    api.getSettings(sessionToken).then((result) => {
      if (!active) return
      const { configured: hasSettings, ...savedSettings } = result
      setConfigured(Boolean(hasSettings))
      setSettings({ ...emptySettings, ...savedSettings })
      setDraft({ ...initialDraft, ...savedSettings })
      setEditing(!hasSettings)
    }).catch((reason) => {
      if (active) setError(reason.message)
    })
    return () => { active = false }
  }, [api, isAdmin, sessionToken])

  const attachRemoteAudio = (session) => {
    const peerConnection = session.sessionDescriptionHandler?.peerConnection
    if (!peerConnection || !audioRef.current) return
    const attach = () => {
      const tracks = peerConnection.getReceivers()
        .map((receiver) => receiver.track)
        .filter((track) => track?.kind === 'audio' && track.readyState === 'live')
      if (!tracks.length || !audioRef.current) return
      audioRef.current.srcObject = new MediaStream(tracks)
      audioRef.current.play().catch((reason) => setError(`PC-Audio konnte nicht gestartet werden: ${reason.message}`))
    }
    peerConnection.addEventListener('track', attach)
    attach()
  }

  const finishSession = (session) => {
    if (sessionRef.current !== session) return
    sessionRef.current = null
    setCallState('')
    setCallParty('')
    setMuted(false)
    if (audioRef.current) audioRef.current.srcObject = null
  }

  const monitorSession = (session, party) => {
    sessionRef.current = session
    setCallParty(party)
    setCallState(session.state === SessionState.Established ? 'verbunden' : 'verbindet')
    session.stateChange.addListener((state) => {
      if (sessionRef.current !== session) return
      if (state === SessionState.Established) {
        setCallState('verbunden')
        attachRemoteAudio(session)
      } else if (state === SessionState.Terminated) {
        finishSession(session)
      } else {
        setCallState('verbindet')
      }
    })
  }

  const disconnect = async () => {
    const session = sessionRef.current
    if (session) {
      try {
        if (session.state === SessionState.Established) await session.bye()
        else if (session instanceof Inviter) await session.cancel()
        else if (session instanceof Invitation) await session.reject()
      } catch (reason) {
        setError(`Anruf konnte nicht sauber beendet werden: ${reason.message}`)
      }
      finishSession(session)
    }
    const userAgent = userAgentRef.current
    userAgentRef.current = null
    registererRef.current = null
    if (userAgent) {
      try {
        await userAgent.stop()
      } catch (reason) {
        setError(`Telefonverbindung konnte nicht sauber getrennt werden: ${reason.message}`)
      }
    }
    setConnectionState('getrennt')
  }

  useEffect(() => () => {
    const userAgent = userAgentRef.current
    const activeSession = sessionRef.current
    userAgentRef.current = null
    sessionRef.current = null
    if (activeSession?.state === SessionState.Established) activeSession.bye().catch(() => {})
    userAgent?.stop().catch(() => {})
  }, [])

  const connect = async () => {
    if (!api || !configured || userAgentRef.current || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    setConnectionState('verbinde')
    try {
      const credentials = await api.getCredentials(sessionToken)
      const uri = UserAgent.makeURI(credentials.sipUri)
      if (!uri) throw new Error('Die gespeicherte SIP-Adresse ist ungültig.')
      const userAgent = new UserAgent({
        uri,
        transportOptions: { server: credentials.websocketServer },
        authorizationUsername: credentials.username,
        authorizationPassword: credentials.password,
        displayName: credentials.displayName || undefined,
        logBuiltinEnabled: false,
        logConfiguration: false,
        delegate: {
          onInvite: (invitation) => {
            if (sessionRef.current) {
              invitation.reject().catch((reason) => setError(`Eingehender Anruf konnte nicht abgelehnt werden: ${reason.message}`))
              return
            }
            const caller = invitation.remoteIdentity.uri.toString()
            monitorSession(invitation, caller)
            setCallState('eingehend')
          },
        },
      })
      userAgentRef.current = userAgent
      await userAgent.start()
      const registerer = new Registerer(userAgent)
      registererRef.current = registerer
      registerer.stateChange.addListener((state) => {
        if (state === RegistererState.Registered) setConnectionState('bereit')
        if (state === RegistererState.Unregistered) setConnectionState('getrennt')
      })
      await registerer.register()
      setConnectionState('bereit')
      setNotice('SIP angemeldet. Anrufe laufen über PC-Mikrofon und Lautsprecher.')
    } catch (reason) {
      const userAgent = userAgentRef.current
      userAgentRef.current = null
      registererRef.current = null
      if (userAgent) await userAgent.stop().catch(() => {})
      setConnectionState('getrennt')
      setError(`SIP-Verbindung fehlgeschlagen: ${reason.message}`)
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = async (event) => {
    event.preventDefault()
    if (!api) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api.saveSettings(draft, sessionToken)
      const { configured: hasSettings, ...savedSettings } = result
      setConfigured(Boolean(hasSettings))
      setSettings({ ...emptySettings, ...savedSettings })
      setDraft({ ...initialDraft, ...savedSettings, password: '' })
      setEditing(false)
      setNotice('SIP-Zugang wurde verschlüsselt auf diesem PC gespeichert.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  const removeSettings = async () => {
    if (!api || !window.confirm('Gespeicherte SIP-Zugangsdaten von diesem PC entfernen?')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.removeSettings(sessionToken)
      setConfigured(false)
      setSettings(emptySettings)
      setDraft(initialDraft)
      setEditing(true)
      setNotice('SIP-Zugangsdaten wurden entfernt.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  const placeCall = async () => {
    if (!userAgentRef.current || connectionState !== 'bereit' || sessionRef.current) return
    setError('')
    try {
      const permission = await window.zyroMedia?.requestAccess({ audio: true })
      if (permission && !permission.granted) throw new Error(permission.message)
      const target = UserAgent.makeURI(phoneDestination(destination, settings.sipUri))
      if (!target) throw new Error('Die Zieladresse konnte nicht erstellt werden.')
      const inviter = new Inviter(userAgentRef.current, target, {
        sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
      })
      monitorSession(inviter, destination.trim())
      await inviter.invite()
    } catch (reason) {
      setError(`Anruf konnte nicht gestartet werden: ${reason.message}`)
      if (sessionRef.current) finishSession(sessionRef.current)
    }
  }

  const acceptCall = async () => {
    const invitation = sessionRef.current
    if (!(invitation instanceof Invitation)) return
    setError('')
    try {
      const permission = await window.zyroMedia?.requestAccess({ audio: true })
      if (permission && !permission.granted) throw new Error(permission.message)
      await invitation.accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } })
      setCallState('verbunden')
      attachRemoteAudio(invitation)
    } catch (reason) {
      setError(`Anruf konnte nicht angenommen werden: ${reason.message}`)
      finishSession(invitation)
    }
  }

  const toggleMute = () => {
    const nextMuted = !muted
    const peerConnection = sessionRef.current?.sessionDescriptionHandler?.peerConnection
    peerConnection?.getSenders().forEach((sender) => {
      if (sender.track?.kind === 'audio') sender.track.enabled = !nextMuted
    })
    setMuted(nextMuted)
  }

  if (!api) {
    return <div className="panel"><h2>Externe Telefonie · PC-Softphone</h2><p>Das PC-Softphone ist nur in der Zyro-Desktop-App verfügbar.</p></div>
  }
  if (!isAdmin) {
    return <div className="panel"><h2>Externe Telefonie · PC-Softphone</h2><p>Das SIP-Softphone kann nur von einem Admin eingerichtet und genutzt werden.</p></div>
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Externe Telefonie · PC-Softphone</h2>
          <span>{configured ? settings.sipUri : 'SIP-Zugang noch nicht eingerichtet'}</span>
        </div>
        <span className={`status-badge ${connectionState === 'bereit' ? 'connected' : ''}`}>
          {connectionState === 'bereit' ? 'SIP bereit' : connectionState === 'verbinde' ? 'Verbindung wird aufgebaut' : 'Getrennt'}
        </span>
      </div>
      <p>Externe Gespräche laufen direkt über das PC-Mikrofon und die PC-Lautsprecher. Dafür muss dein sipgate-Tarif SIP over WebSocket (WSS) unterstützen. Die bisherigen sipgate.io-API-Daten reichen dafür nicht aus; Serveradresse und SIP-Zugang werden nach der Störung ergänzt.</p>
      {editing ? (
        <form className="mailbox-settings" onSubmit={saveSettings}>
          <label>
            SIP WebSocket-Server (WSS)
            <input required type="url" value={draft.websocketServer} onChange={(event) => setDraft((current) => ({ ...current, websocketServer: event.target.value }))} placeholder="wss://…" />
          </label>
          <label>
            SIP-Adresse
            <input required type="text" value={draft.sipUri} onChange={(event) => setDraft((current) => ({ ...current, sipUri: event.target.value }))} placeholder="sip:benutzer@anbieter.de" />
          </label>
          <label>
            SIP-Anmeldename
            <input required type="text" autoComplete="username" value={draft.username} onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))} />
          </label>
          <label>
            SIP-Passwort
            <input required={!configured} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} placeholder={configured ? 'Leer lassen, um das gespeicherte Passwort zu behalten' : ''} />
          </label>
          <label>
            Anzeigename (optional)
            <input type="text" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} />
          </label>
          <div className="mini-actions">
            <button type="submit" className="primary-button" disabled={busy}>SIP-Einstellungen sicher speichern</button>
            {configured && <button type="button" className="secondary-button" disabled={busy} onClick={() => { setDraft({ ...initialDraft, ...settings }); setEditing(false) }}>Abbrechen</button>}
          </div>
          <small>SIP-Passwort wird verschlüsselt lokal auf diesem PC gespeichert. Es wird nicht in die Zyro-Cloud übertragen.</small>
        </form>
      ) : (
        <>
          {configured && (
            <>
              <label>
                Telefonnummer
                <input type="tel" autoComplete="tel" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="+49 211 1234567" disabled={connectionState !== 'bereit' || Boolean(callState)} />
              </label>
              <div className="mini-actions">
                {connectionState === 'bereit' ? (
                  <button type="button" className="secondary-button" disabled={Boolean(callState) || busy} onClick={disconnect}>Telefon abmelden</button>
                ) : (
                  <button type="button" className="secondary-button" disabled={busy} onClick={connect}>Am SIP-Server anmelden</button>
                )}
                <button type="button" className="primary-button" disabled={connectionState !== 'bereit' || !destination.trim() || Boolean(callState)} onClick={placeCall}>Anrufen</button>
                <button type="button" className="secondary-button" disabled={busy || connectionState === 'bereit'} onClick={() => { setDraft({ ...initialDraft, ...settings }); setEditing(true) }}>Einstellungen</button>
                <button type="button" className="secondary-button" disabled={busy || connectionState === 'bereit'} onClick={removeSettings}>Zugang entfernen</button>
              </div>
            </>
          )}
          {callState && (
            <div className="call-status" role="status">
              <strong>{callState === 'eingehend' ? `Eingehender Anruf: ${callParty}` : `${callParty} · ${callState}`}</strong>
              <div className="mini-actions">
                {callState === 'eingehend' && <button type="button" className="primary-button" onClick={acceptCall}>Annehmen</button>}
                {callState === 'verbunden' && <button type="button" className="secondary-button" onClick={toggleMute}>{muted ? 'Mikrofon einschalten' : 'Stummschalten'}</button>}
                <button type="button" className="danger-button" onClick={disconnect}>Auflegen</button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="network-help" role="status">{notice}</p>}
      <audio ref={audioRef} autoPlay />
    </div>
  )
}
