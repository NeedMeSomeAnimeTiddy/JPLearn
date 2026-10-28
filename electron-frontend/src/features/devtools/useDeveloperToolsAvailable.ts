import { useEffect, useState } from 'react'

/** Whether the developer commands may be offered: only when running from source. The installed app
    refuses every debug route (audit 8 F4), so it offers none. Hidden until the main process answers,
    and hidden if it cannot; with no desktop bridge at all (the browser and the tests) they show. */
export function useDeveloperToolsAvailable(): boolean {
  const isPackagedApp = window.jplearnDesktop?.isPackagedApp
  const [available, setAvailable] = useState(() => typeof isPackagedApp !== 'function')

  useEffect(() => {
    if (typeof isPackagedApp !== 'function') return
    let cancelled = false
    isPackagedApp()
      .then((packaged) => { if (!cancelled) setAvailable(packaged === false) })
      .catch(() => { if (!cancelled) setAvailable(false) })
    return () => { cancelled = true }
  }, [isPackagedApp])

  return available
}
