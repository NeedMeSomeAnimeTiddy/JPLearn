import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type StudySummaryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getStudySummary>
>

function App() {
  const versions = useMemo(() => window.jplearnDesktop?.versions, [])
  const [summary, setSummary] = useState<StudySummaryPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await window.jplearnDesktop.getStudySummary()
      setSummary(payload)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown desktop bridge error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  return (
    <main className="shell">
      <h1>JPLearn Desktop</h1>
      <p className="subtitle">Electron + React + TypeScript wired to your Python study data.</p>

      <section className="panel">
        <h2>Desktop Runtime</h2>
        <ul>
          <li>Electron: {versions?.electron ?? 'unknown'}</li>
          <li>Chromium: {versions?.chrome ?? 'unknown'}</li>
          <li>Node: {versions?.node ?? 'unknown'}</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Study Snapshot</h2>
        <div className="panel-actions">
          <button type="button" onClick={() => void loadSummary()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          {lastUpdated ? <span>Last updated: {lastUpdated}</span> : null}
        </div>
        {loading && <p>Loading summary from Python bridge...</p>}
        {error && <p>Unable to load summary: {error}</p>}
        {!loading && !error && summary?.decks?.length === 0 && <p>No decks found.</p>}
        {!loading && !error && summary?.decks?.length ? (
          <table className="summary-table">
            <thead>
              <tr>
                <th>Deck</th>
                <th>Total</th>
                <th>Mastered</th>
                <th>Due Today</th>
                <th>Completed Today</th>
              </tr>
            </thead>
            <tbody>
              {summary.decks.map((deck) => (
                <tr key={deck.slug}>
                  <td>{deck.name}</td>
                  <td>{deck.total}</td>
                  <td>{deck.mastered}</td>
                  <td>{deck.due_today}</td>
                  <td>{deck.completed_today}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  )
}

export default App
