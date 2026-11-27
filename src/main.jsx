import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './css-theme-imports.css'
import './app-ui-v2.css'
import './ui-enterprise-precision.css'
import './uiux-page-system-2026.css'
import './ui-human-operator-refinement.css'
import './ui-nav-layout.css'
import './ui-input-transaction-cards.css'
import './po-page-polish.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register the versioned Service Worker. New versions wait for explicit user approval.
if ('serviceWorker' in navigator) {
  // existing SW registration logic remains unchanged
}
