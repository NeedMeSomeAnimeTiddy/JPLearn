import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type StudySummaryPayload = Awaited<
  ReturnType<typeof window.jplearnDesktop.getStudySummary>
>
type ScriptDeck = Awaited<ReturnType<typeof window.jplearnDesktop.getDeckCards>>
type ScriptKey = 'hiragana' | 'katakana' | 'kanji_n5'
type MinigameKey = 'romaji_sprint' | 'meaning_match' | 'character_match'
type AppView = 'home' | 'games' | 'overview'

interface RoundOption {
  id: string
  label: string
}

interface RoundState {
  prompt: string
  answer: string
  options: RoundOption[]
}

interface ScriptStats {
  attempted: number
  correct: number
  currentStreak: number
  bestStreak: number
}

type StatsByScript = Record<ScriptKey, ScriptStats>

const SCRIPT_LABELS: Record<ScriptKey, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  kanji_n5: 'Kanji',
}

const MINIGAMES: Array<{ key: MinigameKey; title: string; description: string }> = [
  {
    key: 'romaji_sprint',
    title: 'Romaji Sprint',
    description: 'Type the romaji reading as quickly as you can.',
  },
  {
    key: 'meaning_match',
    title: 'Meaning Match',
    description: 'Pick the correct meaning from four choices.',
  },
  {
    key: 'character_match',
    title: 'Character Match',
    description: 'Pick the correct character for the meaning.',
  },
]

const STATS_STORAGE_KEY = 'jplearn-desktop-script-stats-v1'
const EMPTY_SCRIPT_STATS: ScriptStats = {
  attempted: 0,
  correct: 0,
  currentStreak: 0,
  bestStreak: 0,
}

function defaultStatsByScript(): StatsByScript {
  return {
    hiragana: { ...EMPTY_SCRIPT_STATS },
    katakana: { ...EMPTY_SCRIPT_STATS },
    kanji_n5: { ...EMPTY_SCRIPT_STATS },
  }
}

function loadSavedStats(): StatsByScript {
  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY)
    if (!raw) {
      return defaultStatsByScript()
    }
    const parsed = JSON.parse(raw) as Partial<StatsByScript>

    return {
      hiragana: { ...EMPTY_SCRIPT_STATS, ...(parsed.hiragana ?? {}) },
      katakana: { ...EMPTY_SCRIPT_STATS, ...(parsed.katakana ?? {}) },
      kanji_n5: { ...EMPTY_SCRIPT_STATS, ...(parsed.kanji_n5 ?? {}) },
    }
  } catch {
    return defaultStatsByScript()
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function chooseUniqueIndices(length: number, count: number, exclude: number): number[] {
  const picks = new Set<number>()
  while (picks.size < Math.min(count, Math.max(0, length - 1))) {
    const candidate = Math.floor(Math.random() * length)
    if (candidate !== exclude) {
      picks.add(candidate)
    }
  }
  return [...picks]
}

function shuffleArray<T>(items: T[]): T[] {
  const clone = [...items]
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]]
  }
  return clone
}

function App() {
  const [view, setView] = useState<AppView>('home')
  const [summary, setSummary] = useState<StudySummaryPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [activeScript, setActiveScript] = useState<ScriptKey>('hiragana')
  const [activeGame, setActiveGame] = useState<MinigameKey>('romaji_sprint')
  const [deckCards, setDeckCards] = useState<ScriptDeck['cards']>([])
  const [gameLoading, setGameLoading] = useState<boolean>(false)
  const [gameError, setGameError] = useState<string | null>(null)
  const [sessionActive, setSessionActive] = useState<boolean>(false)
  const [roundState, setRoundState] = useState<RoundState | null>(null)
  const [roundInput, setRoundInput] = useState<string>('')
  const [roundFeedback, setRoundFeedback] = useState<string | null>(null)
  const [sessionScore, setSessionScore] = useState<number>(0)
  const [sessionRounds, setSessionRounds] = useState<number>(0)
  const [sessionPoints, setSessionPoints] = useState<number>(0)
  const [scriptStats, setScriptStats] = useState<StatsByScript>(() => loadSavedStats())

  useEffect(() => {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(scriptStats))
  }, [scriptStats])

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

  const loadScriptCards = useCallback(async (script: ScriptKey) => {
    setGameLoading(true)
    setGameError(null)
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
    setRoundInput('')
    setSessionScore(0)
    setSessionRounds(0)
    setSessionPoints(0)

    try {
      const payload = await window.jplearnDesktop.getDeckCards(script)
      setDeckCards(payload.cards)
    } catch (err) {
      setDeckCards([])
      setGameError(err instanceof Error ? err.message : 'Unknown game bridge error')
    } finally {
      setGameLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadScriptCards(activeScript)
  }, [activeScript, loadScriptCards])

  const buildRound = useCallback(
    (cards: ScriptDeck['cards'], minigame: MinigameKey): RoundState | null => {
      if (cards.length === 0) {
        return null
      }

      const cardIndex = Math.floor(Math.random() * cards.length)
      const card = cards[cardIndex]

      if (minigame === 'romaji_sprint') {
        return {
          prompt: `Type romaji for ${card.character}`,
          answer: card.romaji,
          options: [],
        }
      }

      if (cards.length < 4) {
        return null
      }

      const distractorIndices = chooseUniqueIndices(cards.length, 3, cardIndex)
      if (minigame === 'meaning_match') {
        const options = shuffleArray([
          { id: `${card.id}-correct`, label: card.meaning },
          ...distractorIndices.map((idx) => ({
            id: `${cards[idx].id}-meaning`,
            label: cards[idx].meaning,
          })),
        ])

        return {
          prompt: `Select the meaning of ${card.character}`,
          answer: card.meaning,
          options,
        }
      }

      const options = shuffleArray([
        { id: `${card.id}-correct`, label: card.character },
        ...distractorIndices.map((idx) => ({
          id: `${cards[idx].id}-character`,
          label: cards[idx].character,
        })),
      ])

      return {
        prompt: `Select the character for \"${card.meaning}\"`,
        answer: card.character,
        options,
      }
    },
    [],
  )

  const startSession = useCallback(() => {
    const nextRound = buildRound(deckCards, activeGame)
    if (!nextRound) {
      setSessionActive(false)
      setRoundState(null)
      setGameError('Not enough cards in this deck for the selected minigame yet.')
      return
    }

    setSessionActive(true)
    setRoundState(nextRound)
    setRoundInput('')
    setRoundFeedback(null)
    setGameError(null)
    setSessionScore(0)
    setSessionRounds(0)
    setSessionPoints(0)
  }, [activeGame, buildRound, deckCards])

  const nextRound = useCallback(() => {
    const candidate = buildRound(deckCards, activeGame)
    if (!candidate) {
      setRoundState(null)
      setSessionActive(false)
      return
    }
    setRoundState(candidate)
    setRoundInput('')
  }, [activeGame, buildRound, deckCards])

  const submitAnswer = useCallback(
    (answer: string) => {
      if (!roundState) {
        return
      }

      const isCorrect = normalizeText(answer) === normalizeText(roundState.answer)
      let awardedPoints = 0
      setScriptStats((previous) => {
        const previousScript = previous[activeScript]
        const nextStreak = isCorrect ? previousScript.currentStreak + 1 : 0
        awardedPoints = isCorrect ? 1 + Math.floor(nextStreak / 3) : 0
        return {
          ...previous,
          [activeScript]: {
            attempted: previousScript.attempted + 1,
            correct: isCorrect ? previousScript.correct + 1 : previousScript.correct,
            currentStreak: nextStreak,
            bestStreak: Math.max(previousScript.bestStreak, nextStreak),
          },
        }
      })

      setSessionRounds((value) => value + 1)
      if (isCorrect) {
        setSessionScore((value) => value + 1)
        setSessionPoints((value) => value + awardedPoints)
        setRoundFeedback(awardedPoints > 1 ? `Correct +${awardedPoints} points` : 'Correct +1')
      } else {
        setRoundFeedback(`Not quite - answer: ${roundState.answer}`)
      }

      window.setTimeout(() => {
        nextRound()
        setRoundFeedback(null)
      }, 700)
    },
    [activeScript, nextRound, roundState],
  )

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

  const activeScriptStats = scriptStats[activeScript]
  const activeAccuracy =
    activeScriptStats.attempted > 0
      ? Math.round((activeScriptStats.correct / activeScriptStats.attempted) * 100)
      : 0

  const goHome = useCallback(() => {
    setView('home')
    setSessionActive(false)
    setRoundState(null)
    setRoundFeedback(null)
  }, [])

  const homeHero = (
    <section className="home-menu panel-glass">
      <p className="home-kicker">JPLearn Desktop</p>
      <h1>Choose Your Session</h1>
      <p className="home-copy">
        Pick a script to jump into mini games, or open your study overview for deck progress.
      </p>

      <div className="home-actions">
        {(['hiragana', 'katakana', 'kanji_n5'] as const).map((script) => (
          <button
            key={script}
            type="button"
            className="home-action-button"
            onClick={() => {
              setActiveScript(script)
              setView('games')
            }}
          >
            {SCRIPT_LABELS[script]} Mini Games
          </button>
        ))}
      </div>

      <button type="button" className="home-secondary-button" onClick={() => setView('overview')}>
        Study Overview
      </button>
    </section>
  )

  return (
    <main className="app-shell">
      <div className="atmosphere atmosphere-left" aria-hidden="true" />
      <div className="atmosphere atmosphere-right" aria-hidden="true" />

      {view === 'home' ? homeHero : null}

      {view === 'games' ? (
        <>
          <header className="topbar panel-glass">
            <button type="button" className="back-button" onClick={goHome}>
              Back
            </button>
            <div className="brand-block">
              <span className="brand-kicker">{SCRIPT_LABELS[activeScript]}</span>
              <h1>Mini Game Arena</h1>
            </div>
            <div className="focus-chip">
              <span>{deckCards.length} Cards Loaded</span>
            </div>
          </header>

          <section className="panel-glass game-panel">
            <div className="panel-head">
              <h2>Choose Script</h2>
              <span className="game-stats">Session {sessionScore}/{sessionRounds}</span>
            </div>

            <div className="selector-row">
              {(['hiragana', 'katakana', 'kanji_n5'] as const).map((script) => (
                <button
                  key={script}
                  type="button"
                  className={`pill-button ${activeScript === script ? 'is-active' : ''}`}
                  onClick={() => setActiveScript(script)}
                >
                  {SCRIPT_LABELS[script]}
                </button>
              ))}
            </div>

            <div className="minigame-grid">
              {MINIGAMES.map((game) => (
                <button
                  key={game.key}
                  type="button"
                  className={`game-tile ${activeGame === game.key ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveGame(game.key)
                    setSessionActive(false)
                    setRoundFeedback(null)
                  }}
                >
                  <strong>{game.title}</strong>
                  <p>{game.description}</p>
                </button>
              ))}
            </div>

            <div className="game-stats-grid">
              <article className="stat-card">
                <p>Accuracy</p>
                <strong>{activeAccuracy}%</strong>
              </article>
              <article className="stat-card">
                <p>Best Streak</p>
                <strong>{activeScriptStats.bestStreak}</strong>
              </article>
              <article className="stat-card">
                <p>Points</p>
                <strong>{sessionPoints}</strong>
              </article>
            </div>

            <div className="game-actions">
              <button type="button" onClick={startSession} disabled={gameLoading || deckCards.length === 0}>
                {sessionActive ? 'Restart Game' : 'Start Game'}
              </button>
              {gameLoading ? <span>Loading deck...</span> : <span>{deckCards.length} cards available</span>}
            </div>

            {gameError ? <p className="status-line status-error">{gameError}</p> : null}

            {sessionActive && roundState ? (
              <article className="game-round">
                <div className="game-round-head">
                  <span>{SCRIPT_LABELS[activeScript]}</span>
                  <strong>{MINIGAMES.find((game) => game.key === activeGame)?.title}</strong>
                </div>
                <p className="game-prompt">{roundState.prompt}</p>

                {activeGame === 'romaji_sprint' ? (
                  <form
                    className="game-input-row"
                    onSubmit={(event) => {
                      event.preventDefault()
                      submitAnswer(roundInput)
                    }}
                  >
                    <input
                      value={roundInput}
                      onChange={(event) => setRoundInput(event.target.value)}
                      placeholder="Enter romaji"
                    />
                    <button type="submit">Check</button>
                  </form>
                ) : (
                  <div className="option-grid">
                    {roundState.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="option-button"
                        onClick={() => submitAnswer(option.label)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {roundFeedback ? <p className="status-line">{roundFeedback}</p> : null}
              </article>
            ) : null}
          </section>
        </>
      ) : null}

      {view === 'overview' ? (
        <>
          <header className="topbar panel-glass">
            <button type="button" className="back-button" onClick={goHome}>
              Back
            </button>
            <div className="brand-block">
              <span className="brand-kicker">JPLearn</span>
              <h1>Study Overview</h1>
            </div>
            <div className="focus-chip">
              <span>Deep Focus Mode</span>
            </div>
          </header>

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
              <h2>Deck Snapshot</h2>
              <div className="panel-actions">
                <button type="button" onClick={() => void loadSummary()} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
                <span>{lastUpdated ? `Updated ${lastUpdated}` : 'Waiting for first sync'}</span>
              </div>
            </div>

            {loading && <p className="status-line">Loading deck metrics...</p>}
            {error && <p className="status-line status-error">Unable to load summary: {error}</p>}
            {!loading && !error && decks.length === 0 ? <p className="status-line">No decks found.</p> : null}

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
        </>
      ) : null}
    </main>
  )
}

export default App
