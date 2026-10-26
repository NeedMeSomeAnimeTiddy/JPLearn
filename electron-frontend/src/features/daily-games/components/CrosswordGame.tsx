import { cva } from 'class-variance-authority'
import { startTransition, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import * as wanakana from 'wanakana'
import { RoundVerdict, RoundWork } from '../../round'
import { CROSSWORD_COPY, CROSSWORD_MAX_TARGETS } from '../constants'
import type { CrosswordCoordinate, CrosswordEntry, CrosswordBoard, DailyGamesAttemptOutcomeInput, PuzzleShell } from '../types'
import { boardCell, pad2 } from '../utils'
import { PuzzleRound, PuzzleRows } from './PuzzleRound'

/* ==================================================================================================
   THE CROSSWORD ON THE SHEET -- the one `past-three.html` plate THREE draws. The grid is the prompt
   cell, sized to its 278px content box by `boardCell`; every clue is the work cell, and there are
   never more than six, so nothing folds. A clue you have filled reads FILLED in ink and nothing on
   the sheet says whether it is right until CHECK, which is the slab.

   THE TYPING IS UNTOUCHED: wanakana bound per cell, the raw reading kept while an IME converts, one
   character committed per square, Enter to set, Space to fill, the arrows to move.
   ================================================================================================== */

const crosswordCell = cva('dp-cell', {
  variants: {
    active: { true: 'here', false: '' },
  },
})

interface CrosswordGameProps {
  board: CrosswordBoard
  isSaving: boolean
  onComplete: (result: { score: number; targetCount: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
  shell: PuzzleShell
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

const JAPANESE_CHARACTER_PATTERN = /^[\p{Script_Extensions=Katakana}\p{Script_Extensions=Han}]$/u

export function CrosswordGame({ board, isSaving, onComplete, shell }: CrosswordGameProps) {
  const [values, setValues] = useState<Map<string, string>>(() => new Map())
  const [activeEntryId, setActiveEntryId] = useState(board.entries[0]?.id ?? '')
  const [focusCoordinate, setFocusCoordinate] = useState<CrosswordCoordinate | null>(null)
  const [status, setStatus] = useState('')
  const completed = useRef(false)
  const cellRefs = useRef<Array<Array<HTMLInputElement | null>>>([])
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

  function updateValue(coordinate: CrosswordCoordinate, value: string, isComposing = false): void {
    if (isSaving || completed.current) return
    // Store the raw value so the user can type full readings for IME conversion.
    startTransition(() => {
      setValues((current) => {
        const next = new Map(current)
        next.set(coordinateKey(coordinate), value)
        return next
      })
    })
    const normalized = normalizeCharacter(value)
    if (!normalized || !JAPANESE_CHARACTER_PATTERN.test(normalized) || isComposing) return
    const entry = activeEntry ?? board.entries.find((e) => e.cells.some((c) => coordinateKey(c) === coordinateKey(coordinate)))
    if (!entry) return
    const cellIndex = entry.cells.findIndex((c) => coordinateKey(c) === coordinateKey(coordinate))
    if (cellIndex < 0 || cellIndex >= entry.cells.length - 1) return
    const nextCell = entry.cells[cellIndex + 1]
    setActiveEntryId(entry.id)
    cellRefs.current[nextCell.row]?.[nextCell.column]?.focus()
  }

  function normalizeCell(coordinate: CrosswordCoordinate): void {
    startTransition(() => {
      setValues((current) => {
        const key = coordinateKey(coordinate)
        const raw = current.get(key)
        if (!raw) return current
        const normalized = normalizeCharacter(raw)
        if (normalized === raw) return current
        const next = new Map(current)
        next.set(key, normalized)
        return next
      })
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, coordinate: CrosswordCoordinate): void {
    if (event.key === 'Enter' && event.nativeEvent.isComposing) {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      normalizeCell(coordinate)
      return
    }
    if (event.key === ' ' && !event.nativeEvent.isComposing) {
      const entry = getEntryAt(coordinate)
      if (!entry) return
      const cellIndex = entry.cells.findIndex((c) => coordinateKey(c) === coordinateKey(coordinate))
      if (cellIndex < 0) return
      const expectedChar = Array.from(entry.answer)[cellIndex]
      if (!expectedChar || !JAPANESE_CHARACTER_PATTERN.test(expectedChar)) return
      const raw = (event.currentTarget as HTMLInputElement).value
      if (!raw) return
      event.preventDefault()
      updateValue(coordinate, expectedChar)
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
    const solvedEntries = board.entries.filter((entry) => entry.cells.every((cell, index) => normalizeCharacter(values.get(coordinateKey(cell)) ?? '') === Array.from(entry.answer)[index]))
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
    if ((event.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return
    submit()
  }

  const columns = board.grid[0]?.length ?? board.grid.length
  const cell = boardCell(columns)
  const isFilled = (entry: CrosswordEntry): boolean => entry.cells.every((item) => (values.get(coordinateKey(item)) ?? '').trim() !== '')
  const filledCount = board.entries.filter(isFilled).length
  /* NO LIVE CORRECTNESS. The trail stays empty until CHECK has said every answer is right, because
     a gold tick is earned and a filled square is not yet anything. */
  const solved = status === CROSSWORD_COPY.complete
  return (
    <PuzzleRound
      shell={shell}
      run={[
        { key: 'filled', value: pad2(filledCount), of: `/ ${board.entries.length}`, label: 'FILLED' },
        shell.spent,
      ]}
      foot={{
        at: solved ? board.entries.length : 0,
        target: board.entries.length,
        trail: solved ? board.entries.map(() => true) : [],
      }}
      hints={[
        { cap: '←↑↓→', en: 'Move', jp: '移動' },
        { cap: 'ENTER', en: 'Set', jp: '確定' },
        { cap: 'SPACE', en: 'Fill', jp: '補完' },
        { cap: 'ESC', en: 'Leave', jp: '中断' },
      ]}
      ask={(
        <div className="rd-ask">
          <div className="rd-kick"><span>THE GRID</span><em>升目</em></div>
          <div className="dp-stage">
            <form onSubmit={handleSubmit}>
              <div role="region" aria-label={CROSSWORD_COPY.boardLabel} aria-describedby="crossword-instructions">
                <div className="dp-board" style={{ '--dp-n': columns, '--dp-cell': `${cell}px` } as CSSProperties}>
                  {board.grid.map((gridRow, row) => gridRow.map((character, column) => {
                    const coordinate = { row, column }
                    const entry = character === null ? undefined : getEntryAt(coordinate)
                    return character === null ? <span key={coordinateKey(coordinate)} className="dp-cell dp-block" aria-hidden="true" /> : (
                      <input
                        key={coordinateKey(coordinate)}
                        ref={(element) => { (cellRefs.current[row] ??= [])[column] = element }}
                        className={crosswordCell({ active: entry?.id === activeEntry?.id })}
                        lang="ja"
                        aria-label={getCellLabel(row, column)}
                        aria-describedby="crossword-current-clue"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={values.get(coordinateKey(coordinate)) ?? ''}
                        disabled={isSaving || completed.current}
                        onClick={() => { if (entry) setActiveEntryId(entry.id) }}
                        onFocus={(event) => { wanakana.bind(event.currentTarget, { IMEMode: 'toHiragana' }) }}
                        onBlur={(event) => { wanakana.unbind(event.currentTarget); normalizeCell(coordinate) }}
                        onChange={(event) => updateValue(coordinate, event.target.value)}
                        onInput={(event) => updateValue(coordinate, event.currentTarget.value, (event.nativeEvent as unknown as { isComposing?: boolean }).isComposing)}
                        onCompositionEnd={(event) => updateValue(coordinate, event.currentTarget.value)}
                        onKeyDown={(event) => handleKeyDown(event, coordinate)}
                      />
                    )
                  }))}
                </div>
              </div>
            </form>
          </div>
          <p id="crossword-current-clue" className="sr-only" role="status">{CROSSWORD_COPY.currentClue}: {activeEntry?.clue}</p>
        </div>
      )}
      work={(
        <RoundWork
          kick="CLUES"
          kickJp="手がかり"
          slab={{ text: 'CHECK', jp: '確認', onClick: submit, disabled: isSaving || completed.current, label: CROSSWORD_COPY.submit }}
          after={status ? <RoundVerdict message={status} tone={solved ? 'success' : 'error'} /> : null}
        >
          <p id="crossword-instructions" className="sr-only">{CROSSWORD_COPY.instructions}</p>
          {/* EVERY CLUE, because there are never more than six of them -- nothing here folds */}
          <PuzzleRows
            items={board.entries}
            label={CROSSWORD_COPY.clueList}
            limit={CROSSWORD_MAX_TARGETS}
            render={(entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={entry.id === activeEntry?.id ? 'dp-row here' : 'dp-row'}
                  aria-label={getClueLabel(entry, index)}
                  aria-pressed={entry.id === activeEntry?.id}
                  onClick={() => selectEntry(entry)}
                >
                  <u aria-hidden="true">{pad2(index + 1)}</u>
                  <b>{entry.clue}</b>
                  {/* FILLED, IN INK -- that you have written something, never whether it is right */}
                  <s>{isFilled(entry) ? 'FILLED' : entry.direction.toUpperCase()}</s>
                </button>
              </li>
            )}
          />
        </RoundWork>
      )}
    />
  )
}
