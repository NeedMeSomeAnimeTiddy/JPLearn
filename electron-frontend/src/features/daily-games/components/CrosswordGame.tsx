import { cva } from 'class-variance-authority'
import { startTransition, useEffect, useRef, useState } from 'react'
import type { CompositionEvent, FormEvent, KeyboardEvent } from 'react'
import { CROSSWORD_COPY } from '../constants'
import type { CrosswordCoordinate, CrosswordEntry, CrosswordBoard, DailyGamesAttemptOutcomeInput } from '../types'

const crosswordGrid = cva('crossword-grid', {
  variants: {
    size: {
      7: 'is-size-7',
      8: 'is-size-8',
      9: 'is-size-9',
      10: 'is-size-10',
      11: 'is-size-11',
      12: 'is-size-12',
    },
  },
})

const crosswordCell = cva('crossword-cell', {
  variants: {
    active: { true: 'is-active', false: '' },
  },
})

interface CrosswordGameProps {
  board: CrosswordBoard
  isSaving: boolean
  onComplete: (result: { score: number; targetCount: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
}

function coordinateKey({ row, column }: CrosswordCoordinate): string {
  return `${row}-${column}`
}

function getCellLabel(row: number, column: number): string {
  return CROSSWORD_COPY.cellLabel.replace('{row}', String(row + 1)).replace('{column}', String(column + 1))
}

function getClueLabel(entry: CrosswordEntry, index: number): string {
  return CROSSWORD_COPY.clueLabel.replace('{number}', String(index + 1)).replace('{clue}', entry.clue)
}

function normalizeCharacter(value: string): string {
  return Array.from(value.trim())[0] ?? ''
}

export function CrosswordGame({ board, isSaving, onComplete }: CrosswordGameProps) {
  const [values, setValues] = useState<Map<string, string>>(() => new Map())
  const [activeEntryId, setActiveEntryId] = useState(board.entries[0]?.id ?? '')
  const [focusCoordinate, setFocusCoordinate] = useState<CrosswordCoordinate | null>(null)
  const [status, setStatus] = useState('')
  const completed = useRef(false)
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([])
  const composingCells = useRef<Set<string>>(new Set())
  const activeEntry = board.entries.find((entry) => entry.id === activeEntryId) ?? board.entries[0]

  useEffect(() => {
    if (!focusCoordinate) return
    cellRefs.current[focusCoordinate.row]?.[focusCoordinate.column]?.focus()
    setFocusCoordinate(null)
  }, [focusCoordinate])

  function selectEntry(entry: CrosswordEntry): void {
    setActiveEntryId(entry.id)
    setFocusCoordinate(entry.cells[0] ?? null)
  }

  function getEntryAt(coordinate: CrosswordCoordinate): CrosswordEntry | undefined {
    return board.entries.find((entry) => entry.id === activeEntryId && entry.cells.some((cell) => coordinateKey(cell) === coordinateKey(coordinate)))
      ?? board.entries.find((entry) => entry.cells.some((cell) => coordinateKey(cell) === coordinateKey(coordinate)))
  }

  function updateValue(coordinate: CrosswordCoordinate, value: string, preserveComposition = false): void {
    if (isSaving || completed.current) return
    startTransition(() => {
      setValues((current) => {
        const next = new Map(current)
        next.set(coordinateKey(coordinate), preserveComposition ? value : normalizeCharacter(value))
        return next
      })
    })
  }

  function handleCompositionStart(coordinate: CrosswordCoordinate): void {
    composingCells.current.add(coordinateKey(coordinate))
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>, coordinate: CrosswordCoordinate): void {
    composingCells.current.delete(coordinateKey(coordinate))
    updateValue(coordinate, event.currentTarget.value)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, coordinate: CrosswordCoordinate): void {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || composingCells.current.has(coordinateKey(coordinate)))) {
      event.preventDefault()
      return
    }
    const moves: Record<string, CrosswordCoordinate> = {
      ArrowUp: { row: -1, column: 0 },
      ArrowDown: { row: 1, column: 0 },
      ArrowLeft: { row: 0, column: -1 },
      ArrowRight: { row: 0, column: 1 },
    }
    const move = moves[event.key]
    if (!move) return
    const next = { row: coordinate.row + move.row, column: coordinate.column + move.column }
    const nextInput = cellRefs.current[next.row]?.[next.column]
    if (!nextInput) return
    event.preventDefault()
    const nextEntry = getEntryAt(next)
    if (nextEntry) setActiveEntryId(nextEntry.id)
    nextInput.focus()
  }

  function submit(): void {
    if (isSaving || completed.current) return
    const solvedEntries = board.entries.filter((entry) => entry.cells.every((cell, index) => values.get(coordinateKey(cell)) === Array.from(entry.answer)[index]))
    if (solvedEntries.length !== board.entries.length) {
      setStatus(CROSSWORD_COPY.incomplete)
      return
    }
    completed.current = true
    const outcomes = board.entries
      .filter((entry) => entry.poolPosition !== null)
      .map((entry) => ({
        poolPosition: entry.poolPosition as number,
        outcome: 'correct' as const,
      }))
    setStatus(CROSSWORD_COPY.complete)
    onComplete({ score: solvedEntries.length, targetCount: board.entries.length, outcomes })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (composingCells.current.size > 0) return
    submit()
  }

  return (
    <section className="crossword-game" aria-labelledby="crossword-title">
      <header className="crossword-header">
        <div>
          <h1 id="crossword-title">{CROSSWORD_COPY.title}</h1>
          <p>{CROSSWORD_COPY.instructions}</p>
        </div>
      </header>
      <div className="crossword-layout">
        <form className="crossword-form" onSubmit={handleSubmit}>
          <div className="daily-game-board-scroll" role="region" aria-label={CROSSWORD_COPY.boardLabel} tabIndex={0}>
           <div className={crosswordGrid({ size: board.grid.length as 7 | 8 | 9 | 10 | 11 | 12 })}>
            {board.grid.map((gridRow, row) => gridRow.map((character, column) => {
              const coordinate = { row, column }
              const entry = character === null ? undefined : getEntryAt(coordinate)
              return character === null ? <span key={coordinateKey(coordinate)} className="crossword-block" aria-hidden="true" /> : (
                <input
                  key={coordinateKey(coordinate)}
                  ref={(element) => { (cellRefs.current[row] ??= [])[column] = element }}
                  className={crosswordCell({ active: entry?.id === activeEntry?.id })}
                  aria-label={getCellLabel(row, column)}
                  aria-describedby="crossword-current-clue"
                  lang="ja"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={values.get(coordinateKey(coordinate)) ?? ''}
                  disabled={isSaving || completed.current}
                  onClick={() => { if (entry) setActiveEntryId(entry.id) }}
                  onChange={(event) => updateValue(coordinate, event.target.value, composingCells.current.has(coordinateKey(coordinate)))}
                  onCompositionStart={() => handleCompositionStart(coordinate)}
                  onCompositionEnd={(event) => handleCompositionEnd(event, coordinate)}
                  onKeyDown={(event) => handleKeyDown(event, coordinate)}
                />
              )
            }))}
           </div>
          </div>
          <button type="submit" className="daily-game-button is-primary" disabled={isSaving || completed.current}>{CROSSWORD_COPY.submit}</button>
        </form>
        <aside className="crossword-clues" aria-label={CROSSWORD_COPY.clueList}>
          <h2>{CROSSWORD_COPY.clueList}</h2>
          <p id="crossword-current-clue" className="crossword-current-clue" role="status"><strong>{CROSSWORD_COPY.currentClue}:</strong> {activeEntry?.clue}</p>
          <ol>
            {board.entries.map((entry, index) => (
              <li key={entry.id}>
                <button type="button" className="crossword-clue-button" aria-pressed={entry.id === activeEntry?.id} onClick={() => selectEntry(entry)}>{getClueLabel(entry, index)}</button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      <p className="crossword-status" role="status">{status}</p>
      {isSaving ? <p className="daily-game-saving" role="status">{CROSSWORD_COPY.saving}</p> : null}
    </section>
  )
}
