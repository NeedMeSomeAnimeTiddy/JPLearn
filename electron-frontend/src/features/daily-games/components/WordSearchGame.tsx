import { cva } from 'class-variance-authority'
import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { WORD_SEARCH_COPY } from '../constants'
import type { DailyGamesAttemptOutcomeInput, WordSearchBoard, WordSearchCoordinate, WordSearchTarget } from '../types'

const wordSearchCell = cva('word-search-cell', {
  variants: {
    selected: { true: 'is-selected', false: '' },
    found: { true: 'is-found', false: '' },
  },
})

const wordSearchGrid = cva('word-search-grid', {
  variants: {
    size: {
      8: 'is-size-8',
      9: 'is-size-9',
      10: 'is-size-10',
      11: 'is-size-11',
      12: 'is-size-12',
    },
  },
})

interface WordSearchGameProps {
  board: WordSearchBoard
  isSaving: boolean
  onComplete: (result: { score: number; targetCount: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
}

function coordinateKey({ row, column }: WordSearchCoordinate): string {
  return `${row}-${column}`
}

function createSelection(start: WordSearchCoordinate, end: WordSearchCoordinate): WordSearchCoordinate[] {
  const rowDifference = end.row - start.row
  const columnDifference = end.column - start.column
  const rowStep = Math.sign(rowDifference)
  const columnStep = Math.sign(columnDifference)
  if (rowDifference !== 0 && columnDifference !== 0 && Math.abs(rowDifference) !== Math.abs(columnDifference)) return []
  const length = Math.max(Math.abs(rowDifference), Math.abs(columnDifference)) + 1
  return Array.from({ length }, (_, index) => ({ row: start.row + rowStep * index, column: start.column + columnStep * index }))
}

function pathsMatch(selection: readonly WordSearchCoordinate[], target: readonly WordSearchCoordinate[]): boolean {
  return selection.length === target.length && selection.every((coordinate, index) => coordinateKey(coordinate) === coordinateKey(target[index]))
}

function getMatchingTarget(selection: readonly WordSearchCoordinate[], targets: readonly WordSearchTarget[]): WordSearchTarget | undefined {
  return targets.find((target) => pathsMatch(selection, target.path) || pathsMatch(selection, [...target.path].reverse()))
}

function getCellLabel(row: number, column: number, character: string): string {
  return WORD_SEARCH_COPY.cellLabel.replace('{row}', String(row + 1)).replace('{column}', String(column + 1)).replace('{character}', character)
}

export function WordSearchGame({ board, isSaving, onComplete }: WordSearchGameProps) {
  const [selectionStart, setSelectionStart] = useState<WordSearchCoordinate | null>(null)
  const [selection, setSelection] = useState<WordSearchCoordinate[]>([])
  const [foundTargetIds, setFoundTargetIds] = useState<Set<string>>(() => new Set())
  const [optimisticFoundTargetIds, addOptimisticFoundTarget] = useOptimistic(foundTargetIds, (current, targetId: string) => new Set([...current, targetId]))
  const [status, setStatus] = useState('')
  const dragStart = useRef<WordSearchCoordinate | null>(null)
  const dragEnd = useRef<WordSearchCoordinate | null>(null)
  const suppressClick = useRef(false)
  const completed = useRef(false)
  const cellRefs = useRef<Array<Array<HTMLButtonElement | null>>>([])

  const completeSelection = useCallback((nextSelection: WordSearchCoordinate[]): void => {
    if (isSaving || nextSelection.length === 0) return
    const target = getMatchingTarget(nextSelection, board.targets)
    setSelection([])
    setSelectionStart(null)
    if (!target || foundTargetIds.has(target.id)) {
      setStatus(WORD_SEARCH_COPY.selectionInvalid)
      return
    }
    startTransition(() => {
      addOptimisticFoundTarget(target.id)
      setFoundTargetIds((current) => new Set([...current, target.id]))
    })
    setStatus(WORD_SEARCH_COPY.selectionMatched)
    const nextFoundCount = foundTargetIds.size + 1
    if (nextFoundCount !== board.targets.length || completed.current) return
    completed.current = true
    const outcomes = board.targets
      .filter((item) => item.poolPosition !== null)
      .map((item) => ({ poolPosition: item.poolPosition as number, outcome: 'correct' as const }))
    onComplete({ score: outcomes.length || board.targets.length, targetCount: board.targets.length, outcomes })
  }, [addOptimisticFoundTarget, board.targets, foundTargetIds, isSaving, onComplete])

  useEffect(() => {
    function clearPointerSelection(cancelled: boolean): void {
      if (!dragStart.current) return
      dragStart.current = null
      dragEnd.current = null
      setSelection([])
      setSelectionStart(null)
      if (cancelled) setStatus(WORD_SEARCH_COPY.selectionCancelled)
    }

    function handlePointerUp(): void {
      const start = dragStart.current
      const end = dragEnd.current
      if (!start || !end) return
      dragStart.current = null
      dragEnd.current = null
      suppressClick.current = true
      window.setTimeout(() => { suppressClick.current = false }, 0)
      completeSelection(createSelection(start, end))
    }

    function handlePointerCancel(): void {
      clearPointerSelection(true)
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [completeSelection])

  function selectCell(coordinate: WordSearchCoordinate): void {
    if (isSaving) return
    if (!selectionStart) {
      setSelectionStart(coordinate)
      setSelection([coordinate])
      setStatus(WORD_SEARCH_COPY.selectionReady)
      return
    }
    completeSelection(createSelection(selectionStart, coordinate))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, coordinate: WordSearchCoordinate): void {
    const moves: Record<string, WordSearchCoordinate> = {
      ArrowUp: { row: -1, column: 0 }, ArrowDown: { row: 1, column: 0 }, ArrowLeft: { row: 0, column: -1 }, ArrowRight: { row: 0, column: 1 },
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      cellRefs.current[coordinate.row + move.row]?.[coordinate.column + move.column]?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectCell(coordinate)
      return
    }
    if (event.key === 'Escape' && selectionStart) {
      event.preventDefault()
      event.stopPropagation()
      setSelectionStart(null)
      setSelection([])
      setStatus(WORD_SEARCH_COPY.selectionCancelled)
    }
  }

  const selectedCells = new Set(selection.map(coordinateKey))
  return (
    <section className="word-search-game" aria-labelledby="word-search-title">
      <header className="word-search-header">
        <div>
          <h1 id="word-search-title">{WORD_SEARCH_COPY.title}</h1>
          <p>{WORD_SEARCH_COPY.instructions}</p>
        </div>
        <p className="word-search-progress">{WORD_SEARCH_COPY.progress}: <strong>{optimisticFoundTargetIds.size}/{board.targets.length}</strong></p>
      </header>
      <div className="word-search-layout">
        <div className="daily-game-board-scroll" role="region" aria-label={WORD_SEARCH_COPY.boardLabel} tabIndex={0}>
         <div className={wordSearchGrid({ size: board.grid.length as 8 | 9 | 10 | 11 | 12 })}>
          {board.grid.map((gridRow, row) => gridRow.map((character, column) => {
            const coordinate = { row, column }
            const isFound = board.targets.some((target) => optimisticFoundTargetIds.has(target.id) && target.path.some((item) => coordinateKey(item) === coordinateKey(coordinate)))
            return (
              <button
                key={coordinateKey(coordinate)}
                ref={(element) => { (cellRefs.current[row] ??= [])[column] = element }}
                type="button"
                className={wordSearchCell({ selected: selectedCells.has(coordinateKey(coordinate)), found: isFound })}
                aria-label={getCellLabel(row, column, character)}
                disabled={isSaving || completed.current}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  selectCell(coordinate)
                }}
                onKeyDown={(event) => handleKeyDown(event, coordinate)}
                onPointerDown={() => {
                  if (isSaving) return
                  dragStart.current = coordinate
                  dragEnd.current = coordinate
                  setSelectionStart(coordinate)
                  setSelection([coordinate])
                  setStatus(WORD_SEARCH_COPY.selectionReady)
                }}
                onPointerEnter={() => {
                  if (dragStart.current) {
                    dragEnd.current = coordinate
                    setSelection(createSelection(dragStart.current, coordinate))
                  }
                }}
              >
                {character}
              </button>
            )
          }))}
         </div>
        </div>
        <aside className="word-search-targets" aria-label={WORD_SEARCH_COPY.targetList}>
          <h2>{WORD_SEARCH_COPY.targetList}</h2>
          <ul>
            {board.targets.map((target) => <li key={target.id} className={optimisticFoundTargetIds.has(target.id) ? 'is-found' : ''}>{target.value}{optimisticFoundTargetIds.has(target.id) ? ` (${WORD_SEARCH_COPY.found})` : ''}</li>)}
          </ul>
        </aside>
      </div>
      <p className="word-search-status" role="status">{status}</p>
      {isSaving ? <p className="daily-game-saving" role="status">{WORD_SEARCH_COPY.selectionMatched}</p> : null}
    </section>
  )
}
