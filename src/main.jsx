import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './web-app-bridge.js'
import App from './App.jsx'

class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 20, color: '#241910', background: '#f5f0e8', minHeight: '100vh', font: '16px Arial, sans-serif' }}>
        <h2>Ein Fehler ist aufgetreten</h2>
        <p style={{ overflowWrap: 'anywhere' }}>{String(this.state.error?.stack || this.state.error?.message || this.state.error).slice(0, 800)}</p>
        <button type="button" style={{ padding: '12px 18px', fontSize: 16 }} onClick={() => window.location.reload()}>Neu laden</button>
      </div>
    )
  }
}

if (import.meta.env.PROD && import.meta.env.BASE_URL !== '/' && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
  }
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((registration) => registration.update())
    .catch((error) => console.error('Offline-App konnte nicht eingerichtet werden:', error))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
