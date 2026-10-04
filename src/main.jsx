import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Service Worker for PWA and safely apply new deployments.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { updateViaCache: 'none' },
      )

      const requestUpdate = () => registration.update().catch(() => {})
      requestUpdate()
      window.addEventListener('pageshow', requestUpdate)
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            reloadPending = true
            if (document.visibilityState === 'visible') {
              reloadTimer = window.setTimeout(safeReload, 1200)
            }
          }
        })
      })
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') requestUpdate()
      })

      let reloadPending = false
      let reloadTimer = null

      const safeReload = () => {
        if (!reloadPending) return
        const active = document.activeElement
        const editing = active && (
          active.matches?.('input, textarea, select, [contenteditable="true"]') ||
          active.closest?.('input, textarea, select, [contenteditable="true"]')
        )
        if (editing) return
        reloadPending = false
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = null
        sessionStorage.setItem('gudangai_sw_updated', String(Date.now()))
        window.location.reload()
      }

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // The new worker has taken control. LocalStorage/IndexedDB are untouched;
        // pending transaction queue therefore survives the reload.
        reloadPending = true
        if (document.visibilityState === 'visible') {
          reloadTimer = window.setTimeout(safeReload, 900)
        }
      })

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') safeReload()
      })
    } catch (_) {
      // PWA remains usable even when service-worker registration/update fails.
    }
  })
}
