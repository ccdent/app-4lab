import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Mantine styles
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/tiptap/styles.css'

import './index.css'
import App from './App.tsx'
import { installErrorLog } from './lib/errorLog'
import { IS_DEMO } from './lib/demo'

// Sběr JS chyb pro diagnostiku — musí běžet před prvním renderem.
installErrorLog()

// Demo doména se nemá indexovat (ukázka, ne produkt).
if (IS_DEMO) {
  const meta = document.createElement('meta')
  meta.name = 'robots'
  meta.content = 'noindex, nofollow'
  document.head.appendChild(meta)
}

// Po deployi zmizí staré hashované chunky (lazy stránky, jazykové katalogy) —
// otevřená záložka se starým index.html by na ně narazila 404. Jednorázový
// reload stáhne aktuální verzi; guard brání smyčce, kdyby selhalo i po ní.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'chunk-reload-at'
  const last = Number(sessionStorage.getItem(KEY) ?? 0)
  if (Date.now() - last < 30_000) return
  sessionStorage.setItem(KEY, String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
