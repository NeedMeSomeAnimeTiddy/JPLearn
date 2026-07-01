import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are NOT bundled — download them with: python scripts/get_fonts.py
// The app loads them dynamically from Documents\JPLearn\fonts\ at startup.
// Without them the app falls back to system fonts (e.g. Yu Gothic on Windows).
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
