import { cva } from 'class-variance-authority'
import { useState } from 'react'
import { DAILY_GAMES_COPY } from '../constants'
import type { DailyGamesAttemptOutcomeInput, MatchPair } from '../types'

const pairCard = cva('match-pairs-card', {
  variants: {
    selected: { true: 'is-selected', false: '' },
    matched: { true: 'is-matched', false: '' },
    side: { character: 'is-character', meaning: 'is-meaning' },
  },
})

interface MatchPairsGameProps {
  pairs: MatchPair[]
  isSaving: boolean
  onComplete: (result: { score: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
}

export function MatchPairsGame({ pairs, isSaving, onComplete }: MatchPairsGameProps) {
  const [selected, setSelected] = useState<MatchPair | null>(null)
  const [matchedIds, setMatchedIds] = useState<Set<string>>(() => new Set())
  const [missedPositions, setMissedPositions] = useState<Set<number>>(() => new Set())
  const [isResolving, setIsResolving] = useState(false)
  const [status, setStatus] = useState('')

  function selectPair(pair: MatchPair): void {
    if (isSaving || isResolving || matchedIds.has(pair.id)) return
    if (!selected) {
      setSelected(pair)
      setStatus(DAILY_GAMES_COPY.matchPairsSelection.replace('{value}', pair.value))
      return
    }
    if (selected.id === pair.id || selected.side === pair.side) {
      setSelected(pair)
      setStatus(DAILY_GAMES_COPY.matchPairsSelection.replace('{value}', pair.value))
      return
    }
    setIsResolving(true)
    const isMatch = selected.poolPosition === pair.poolPosition
    if (!isMatch) {
      setMissedPositions((current) => new Set([...current, selected.poolPosition, pair.poolPosition]))
      setStatus(DAILY_GAMES_COPY.matchPairsMismatched.replace('{first}', selected.value).replace('{second}', pair.value))
      window.setTimeout(() => {
        setSelected(null)
        setIsResolving(false)
      }, 400)
      return
    }
    const nextMatched = new Set([...matchedIds, selected.id, pair.id])
    setMatchedIds(nextMatched)
    setSelected(null)
    setIsResolving(false)
    setStatus(DAILY_GAMES_COPY.matchPairsMatched.replace('{value}', selected.value))
    if (nextMatched.size === pairs.length) {
      const positions = [...new Set(pairs.map(({ poolPosition }) => poolPosition))]
      onComplete({
        score: positions.length - missedPositions.size,
        outcomes: positions.map((poolPosition) => ({ poolPosition, outcome: missedPositions.has(poolPosition) ? 'incorrect' : 'correct' })),
      })
    }
  }

  const pairCount = pairs.length / 2
  const matchedCount = matchedIds.size / 2
  return (
    <section className="match-pairs-game" aria-labelledby="match-pairs-title">
      <header className="match-pairs-header">
        <div>
          <h1 id="match-pairs-title">{DAILY_GAMES_COPY.matchPairsTitle}</h1>
          <p>{DAILY_GAMES_COPY.matchPairsInstructions}</p>
        </div>
        <p className="match-pairs-progress">{DAILY_GAMES_COPY.matchPairsProgress}: <strong>{matchedCount}/{pairCount}</strong></p>
      </header>
      <div className="match-pairs-grid" aria-label={DAILY_GAMES_COPY.matchPairsTitle}>
        {pairs.map((pair) => (
          <button
            key={pair.id}
            type="button"
            className={pairCard({ selected: selected?.id === pair.id, matched: matchedIds.has(pair.id), side: pair.side })}
            aria-pressed={selected?.id === pair.id}
            disabled={isSaving || isResolving || matchedIds.has(pair.id)}
            onClick={() => selectPair(pair)}
          >
            {pair.value}
          </button>
        ))}
      </div>
      <p className="match-pairs-status" role="status">{status}</p>
      {isSaving ? <p className="daily-game-saving" role="status">{DAILY_GAMES_COPY.recordingResult}</p> : null}
    </section>
  )
}
