import { useState } from 'react'
import type { CSSProperties } from 'react'
import { RoundWork } from '../../round'
import { DAILY_GAMES_COPY } from '../constants'
import type { DailyGamesAttemptOutcomeInput, MatchPair, PuzzleShell } from '../types'
import { pad2 } from '../utils'
import { PuzzleRound } from './PuzzleRound'

/* ==================================================================================================
   MATCH PAIRS ON THE SHEET. The Japanese tiles are the prompt cell and the meanings are the work
   cell -- two columns of up to six in each -- so a pair is made ACROSS the hairline, which is the
   question and its answer the way every other fill of this sheet has them.

   A MADE PAIR TURNS GOLD IN BOTH CELLS AND STAYS WHERE IT IS. Nothing re-lays out: a board that
   closes up as you play is a board you re-read after every pair. A wrong pair flashes vermilion
   once, for the same 400ms the board was already holding its selection for.
   ================================================================================================== */

interface MatchPairsGameProps {
  pairs: MatchPair[]
  isSaving: boolean
  onComplete: (result: { score: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
  shell: PuzzleShell
}

/** how long a wrong pair stands lit before the board lets you choose again */
const MISMATCH_MS = 400

export function MatchPairsGame({ pairs, isSaving, onComplete, shell }: MatchPairsGameProps) {
  const [selected, setSelected] = useState<MatchPair | null>(null)
  const [matchedIds, setMatchedIds] = useState<Set<string>>(() => new Set())
  const [missedPositions, setMissedPositions] = useState<Set<number>>(() => new Set())
  /* the order the pairs were made in, which is the foot band's trail */
  const [madeOrder, setMadeOrder] = useState<number[]>([])
  const [flashIds, setFlashIds] = useState<string[]>([])
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
      setFlashIds([selected.id, pair.id])
      setStatus(DAILY_GAMES_COPY.matchPairsMismatched.replace('{first}', selected.value).replace('{second}', pair.value))
      window.setTimeout(() => {
        setSelected(null)
        setFlashIds([])
        setIsResolving(false)
      }, MISMATCH_MS)
      return
    }
    const nextMatched = new Set([...matchedIds, selected.id, pair.id])
    setMatchedIds(nextMatched)
    setMadeOrder((current) => [...current, pair.poolPosition])
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

  function tiles(side: MatchPair['side'], label: string) {
    const mine = pairs.filter((pair) => pair.side === side)
    return (
      <div
        className="dp-tiles"
        role="group"
        aria-label={label}
        style={{ '--dp-rows': Math.max(1, Math.ceil(mine.length / 2)) } as CSSProperties}
      >
        {mine.map((pair) => {
          const classes = ['dp-tile', side === 'character' ? 'jp' : 'lat']
          if (matchedIds.has(pair.id)) classes.push('on')
          else if (flashIds.includes(pair.id)) classes.push('bad')
          else if (selected?.id === pair.id) classes.push('here')
          return (
            <button
              key={pair.id}
              type="button"
              className={classes.join(' ')}
              lang={side === 'character' ? 'ja' : undefined}
              aria-pressed={selected?.id === pair.id}
              title={pair.value}
              disabled={isSaving || isResolving || matchedIds.has(pair.id)}
              onClick={() => selectPair(pair)}
            >
              <span>{pair.value}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const pairCount = pairs.length / 2
  const matchedCount = matchedIds.size / 2
  return (
    <PuzzleRound
      shell={shell}
      run={[
        { key: 'pairs', value: pad2(matchedCount), of: `/ ${pairCount}`, label: 'PAIRED' },
        shell.spent,
      ]}
      foot={{ at: madeOrder.length, target: pairCount, trail: madeOrder.map((position) => !missedPositions.has(position)) }}
      hints={[
        { cap: 'TAB', en: 'Move', jp: '移動' },
        { cap: 'ENTER', en: 'Pick', jp: '選択' },
      ]}
      ask={(
        <div className="rd-ask">
          <div className="rd-kick"><span>THE WORDS</span><em>札</em></div>
          <div className="dp-stage">{tiles('character', 'Japanese words')}</div>
        </div>
      )}
      work={(
        <RoundWork
          kick="THEIR MEANINGS"
          kickJp="意味"
          slab={{ text: selected ? 'NOW ITS MATCH' : 'ONE FROM EACH SIDE', jp: '札合わせ', tone: 'calm' }}
          after={<p className="sr-only" role="status">{status}</p>}
        >
          <p className="sr-only">{DAILY_GAMES_COPY.matchPairsInstructions}</p>
          <div className="dp-stage">{tiles('meaning', 'Meanings')}</div>
        </RoundWork>
      )}
    />
  )
}
