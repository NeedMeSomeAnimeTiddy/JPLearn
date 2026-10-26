import { cva } from 'class-variance-authority'
import { startTransition, useCallback, useEffect, useOptimistic, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { RoundWork } from '../../round'
import type { DailyGamesWordPayload } from '../../../generated/types'
import { CROSSWORD_COPY, WORD_SEARCH_COPY, WORD_SEARCH_MAX_TARGETS } from '../constants'
import type { DailyGamesAttemptOutcomeInput, PuzzleShell, WordSearchBoard, WordSearchCoordinate, WordSearchTarget } from '../types'
import { boardCell, pad2 } from '../utils'
import { PuzzleRound, PuzzleRows } from './PuzzleRound'

/* ==================================================================================================
   WORD SEARCH ON THE SHEET. The grid is the prompt cell, sized to its 278px content box by
   `boardCell`; the words to find are the work cell, English first with the Japanese beside it,
   struck in gold as you find them. Selection, dragging, the keyboard and Escape cancelling a
   half-made line are the same code they were -- that last one still wins over leaving.
   ================================================================================================== */

const wordSearchCell = cva('dp-cell', {
  variants: {
    selected: { true: 'here', false: '' },
    found: { true: 'on', false: '' },
  },
})

interface WordSearchGameProps {
  board: WordSearchBoard
  /** today's pool, which is where each target's English comes from */
  words: readonly DailyGamesWordPayload[]
  isSaving: boolean
  onComplete: (result: { score: number; targetCount: number; outcomes: DailyGamesAttemptOutcomeInput[] }) => void
  shell: PuzzleShell
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

export function WordSearchGame({ board, words, isSaving, onComplete, shell }: WordSearchGameProps) {
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
  const columns = board.grid[0]?.length ?? board.grid.length
  const cell = boardCell(columns)
  const found = optimisticFoundTargetIds.size
  return (
    <PuzzleRound
      shell={shell}
      run={[
        { key: 'found', value: pad2(found), of: `/ ${board.targets.length}`, label: 'FOUND' },
        shell.spent,
      ]}
      /* nothing in a word search can be got wrong, so every mark is gold -- in the order found */
      foot={{ at: found, target: board.targets.length, trail: Array.from({ length: found }, () => true) }}
      hints={[
        { cap: '←↑↓→', en: 'Move', jp: '移動' },
        { cap: 'ENTER', en: 'Mark', jp: '選択' },
        { cap: 'ESC', en: 'Cancel, then back', jp: '取消' },
      ]}
      ask={(
        <div className="rd-ask">
          <div className="rd-kick"><span>THE GRID</span><em>升目</em></div>
          <div className="dp-stage">
            <div role="region" aria-label={WORD_SEARCH_COPY.boardLabel} aria-describedby="word-search-instructions">
              <div className="dp-board" style={{ '--dp-n': columns, '--dp-cell': `${cell}px` } as CSSProperties}>
                {board.grid.map((gridRow, row) => gridRow.map((character, column) => {
                  const coordinate = { row, column }
                  const isFound = board.targets.some((target) => optimisticFoundTargetIds.has(target.id) && target.path.some((item) => coordinateKey(item) === coordinateKey(coordinate)))
                  return (
                    <button
                      key={coordinateKey(coordinate)}
                      ref={(element) => { (cellRefs.current[row] ??= [])[column] = element }}
                      type="button"
                      lang="ja"
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
          </div>
        </div>
      )}
      work={(
        <RoundWork
          kick="WORDS TO FIND"
          kickJp="単語"
          slab={{ text: selectionStart ? 'NOW ITS LAST LETTER' : 'MARK A FIRST LETTER', jp: '単語探し', tone: 'calm' }}
          after={<p className="dp-status" role="status">{status}</p>}
        >
          <p id="word-search-instructions" className="sr-only">{WORD_SEARCH_COPY.instructions}</p>
          <PuzzleRows
            items={board.targets}
            label={WORD_SEARCH_COPY.targetList}
            limit={WORD_SEARCH_MAX_TARGETS}
            render={(target, index) => {
              const isFound = optimisticFoundTargetIds.has(target.id)
              /* ENGLISH LEADS -- it is the half of the word you can read the list by */
              const meaning = target.poolPosition === null ? CROSSWORD_COPY.fallbackClue : (words[target.poolPosition]?.meaning ?? target.value)
              return (
                <li key={target.id} className={isFound ? 'dp-row on' : 'dp-row'}>
                  <u aria-hidden="true">{pad2(index + 1)}</u>
                  <b>{meaning}</b>
                  <i lang="ja">{target.value}</i>
                  {isFound ? <s>{WORD_SEARCH_COPY.found.toUpperCase()}</s> : null}
                </li>
              )
            }}
          />
        </RoundWork>
      )}
    />
  )
}
