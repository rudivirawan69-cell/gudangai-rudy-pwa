import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // v0 preview assets are served through a redirecting host route; a service
    // worker script must be a direct same-origin response, so disable and clear
    // workers there to prevent stale chunks from breaking lazy page imports.
    const isV0Preview = window.location.hostname.endsWith('.v0.build');
    if (isV0Preview) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch(() => {});
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const check = () => {
          try { reg.update() } catch (_) {}
        }
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing
          if (!nw) return
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              try {
                window.dispatchEvent(new CustomEvent('gudangai-sw-update'))
              } catch (_) {}
            }
          })
        })
      })
      .catch(() => {})
  })
}
