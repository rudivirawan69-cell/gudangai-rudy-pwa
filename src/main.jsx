import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './css-theme-imports.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the versioned Service Worker. New versions wait for explicit user approval.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `${import.meta.env.BASE_URL}sw.js`,
        { updateViaCache: 'none' },
      )

      let reloadAfterActivation = false
      let updatePromptOpen = false

      const askToUpdate = (waitingWorker) => {
        if (!waitingWorker || updatePromptOpen) return
        updatePromptOpen = true
        const accepted = window.confirm('Pembaruan GudangAI tersedia. Perbarui aplikasi sekarang?')
        updatePromptOpen = false
        if (accepted) {
          reloadAfterActivation = true
          waitingWorker.postMessage({ type: 'SKIP_WAITING' })
        }
      }

      const inspectWaitingWorker = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          askToUpdate(registration.waiting)
        }
      }

      const watchInstallingWorker = () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            askToUpdate(registration.waiting || installing)
          }
        })
      }

      registration.addEventListener('updatefound', watchInstallingWorker)
      watchInstallingWorker()
      inspectWaitingWorker()

      const checkForUpdate = () => registration.update().catch(() => {})
      checkForUpdate()
      window.addEventListener('pageshow', checkForUpdate)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate()
          inspectWaitingWorker()
        }
      })

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadAfterActivation) return
        reloadAfterActivation = false
        window.location.reload()
      })
    } catch (_) {
      // Keep the application usable if Service Worker registration is unavailable.
    }
  })
}
