import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are not bundled in renderer output.
// Downloaded fonts are loaded dynamically from Documents\JPLearn\fonts\ by Electron main.
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
