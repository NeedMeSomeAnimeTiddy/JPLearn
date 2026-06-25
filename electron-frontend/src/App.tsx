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

  const decks = summary?.decks ?? []

  const totals = useMemo(() => {
    const totalCards = decks.reduce((acc, deck) => acc + deck.total, 0)
    const masteredCards = decks.reduce((acc, deck) => acc + deck.mastered, 0)
    const dueToday = decks.reduce((acc, deck) => acc + deck.due_today, 0)
    const completedToday = decks.reduce((acc, deck) => acc + deck.completed_today, 0)
    const masteryRate = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0

    return {
      totalCards,
      masteredCards,
      dueToday,
      completedToday,
      masteryRate,
    }
  }, [decks])

  const summaryTiles = [
    { label: 'Decks', value: decks.length.toString(), tone: 'teal' },
    { label: 'Total Cards', value: totals.totalCards.toString(), tone: 'ocean' },
    { label: 'Mastered', value: `${totals.masteryRate}%`, tone: 'amber' },
    { label: 'Due Today', value: totals.dueToday.toString(), tone: 'rose' },
  ] as const

  return (
    <main className="app-shell">
      <div className="atmosphere atmosphere-left" aria-hidden="true" />
      <div className="atmosphere atmosphere-right" aria-hidden="true" />

      <header className="topbar panel-glass">
        <div className="brand-block">
          <span className="brand-kicker">JPLearn</span>
          <h1>Study Dashboard</h1>
        </div>
        <div className="runtime-chip">
          <span>Electron {versions?.electron ?? 'unknown'}</span>
          <span>Chrome {versions?.chrome ?? 'unknown'}</span>
          <span>Node {versions?.node ?? 'unknown'}</span>
        </div>
      </header>

      <section className="hero panel-glass">
        <p className="hero-kicker">Desktop + Python Bridge</p>
        <p className="hero-copy">
          A focused desktop workspace for daily Japanese repetition, live from your Python
          domain and data layer.
        </p>
      </section>

      <section className="tile-grid">
        {summaryTiles.map((tile, index) => (
          <article
            key={tile.label}
            className={`metric-tile tone-${tile.tone}`}
            style={{ animationDelay: `${120 + index * 80}ms` }}
          >
            <p>{tile.label}</p>
            <strong>{tile.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel-glass deck-panel">
        <div className="panel-head">
          <h2>Study Snapshot</h2>
          <div className="panel-actions">
            <button type="button" onClick={() => void loadSummary()} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <span>{lastUpdated ? `Updated ${lastUpdated}` : 'Waiting for first sync'}</span>
          </div>
        </div>

        {loading && <p className="status-line">Loading deck metrics...</p>}
        {error && <p className="status-line status-error">Unable to load summary: {error}</p>}
        {!loading && !error && decks.length === 0 && <p className="status-line">No decks found.</p>}

        {!loading && !error && decks.length > 0 ? (
          <div className="deck-grid">
            {decks.map((deck, index) => {
              const mastery = deck.total > 0 ? Math.round((deck.mastered / deck.total) * 100) : 0
              const todayProgress =
                deck.due_today > 0
                  ? Math.min(100, Math.round((deck.completed_today / deck.due_today) * 100))
                  : 0

              return (
                <article
                  key={deck.slug}
                  className="deck-card"
                  style={{ animationDelay: `${180 + index * 70}ms` }}
                >
                  <div className="deck-card-head">
                    <h3>{deck.name}</h3>
                    <span>{deck.total} cards</span>
                  </div>

                  <div className="meter">
                    <div className="meter-label">
                      <span>Mastery</span>
                      <strong>{mastery}%</strong>
                    </div>
                    <div className="meter-track">
                      <div className="meter-fill" style={{ width: `${mastery}%` }} />
                    </div>
                  </div>

                  <div className="meter">
                    <div className="meter-label">
                      <span>Today</span>
                      <strong>
                        {deck.completed_today}/{deck.due_today}
                      </strong>
                    </div>
                    <div className="meter-track">
                      <div className="meter-fill meter-fill-alt" style={{ width: `${todayProgress}%` }} />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}

        <footer className="panel-foot">
          <span>{totals.completedToday} cards completed today</span>
          <span>{totals.masteredCards} cards mastered overall</span>
        </footer>
      </section>
    </main>
  )
}

export default App
