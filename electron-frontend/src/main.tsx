import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are not bundled in renderer output.
// Downloaded fonts are loaded dynamically from Documents\JPLearn\fonts\ by Electron main.
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

/* THE VALLEY LOADS BEHIND THE APP, AND AFTER IT. Phase 0 of the menu port: the world is mounted
   once, outside React, and is never allowed to delay the thing the user came for. It is imported
   lazily so three.js stays out of the entry chunk, and every failure is swallowed -- no WebGL, a
   missing asset or a driver fault must cost the app nothing but a valley.

   IT WAITS FOR THE FIRST PAINT, AND THAT IS NOT PARANOIA -- IT WAS MEASURED. Kicking the import
   off here at module scope cost first contentful paint 1212ms -> 3992ms, because parsing 21,000
   nodes and building the first frame is about a second of unbroken main-thread work and the
   browser had not painted yet when it started. Waiting for the paint entry puts that second
   somewhere the user is already looking at their app. */
function mountValleyAfterFirstPaint() {
  /* an off switch, because the only honest way to price the valley is to boot the same build
     twice -- once with it and once without. Set by JPLEARN_VALLEY=off, which the main process
     turns into a query on the renderer's URL. Phase 3 replaces this with the real toggle. */
  if (new URLSearchParams(window.location.search).get('valley') === 'off') return
  let started = false
  const go = () => {
    if (started) return
    started = true
    void import('./valley/valley.ts')
      .then((m) => m.mountValley())
      .catch((error) => console.warn('[valley] not mounted:', error))
  }
  try {
    const observer = new PerformanceObserver((list) => {
      if (list.getEntries().some((e) => e.name === 'first-contentful-paint')) {
        observer.disconnect()
        setTimeout(go, 0)
      }
    })
    observer.observe({ type: 'paint', buffered: true })
  } catch {
    /* no PerformanceObserver: fall through to the timer below */
  }
  /* a floor, so a browser that never reports the entry still gets its valley */
  setTimeout(go, 2000)
}

mountValleyAfterFirstPaint()
