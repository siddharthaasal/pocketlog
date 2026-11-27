import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { requestPersistentStorage } from './data/storage'
import { startTheme } from './lib/theme'
import './index.css'

startTheme()
void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
