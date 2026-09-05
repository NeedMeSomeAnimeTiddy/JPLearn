import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CARD_MASTERY_MAX } from '../../../constants'
import { boardScale } from '../../menu/useScreen'
import { listWindow, masteryGroups, masteryNote } from '../mastery'
import type { MasteryInput } from '../mastery'
import '../../../styles/stage.css'
import '../../lookup/lookup.css'
import '../mastery.css'

/* ==================================================================================================
   EVERY CHARACTER — see `mastery.css` for the argument, and `mastery.ts` for the model.

   THIS FILE IS THE ARRANGEMENT AND THE THREE CURSORS. The old panel was 543 lines with the browsing
   state, a search box, a mastery filter, a theme filter and a pager in it; the search and the filters
   are the dictionary's job and the paging is the window's, so what is left is where you are.
   ================================================================================================== */

export interface MasteryOverlayProps extends MasteryInput {
  open: boolean
  loading: boolean
  error: string | null
  onClose: () => void
  onRefresh: () => void
  /** hand a kanji to the panel that already draws one properly */
  onOpenKanjiDetail: (character: string, trigger: HTMLElement) => void
}

/** which column the arrows are moving in */
type Column = 'group' | 'block' | 'char'

const KANJI = /[々一-鿿]/

export function MasteryOverlay({
  open, loading, error, blocks, categoryBlocks, kanji, scores,
  onClose, onRefresh, onOpenKanjiDetail,
}: MasteryOverlayProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  const groups = useMemo(
    () => masteryGroups({ blocks, categoryBlocks, kanji, scores }),
    [blocks, categoryBlocks, kanji, scores],
  )

  const [at, setAt] = useState({ group: 0, block: 0, char: 0 })
  const [column, setColumn] = useState<Column>('group')

  const group = groups[Math.min(at.group, Math.max(0, groups.length - 1))] ?? null
  const blockList = group?.blocks ?? []
  const blockAt = Math.min(at.block, Math.max(0, blockList.length - 1))
  const theBlock = blockList[blockAt] ?? null
  const chars = theBlock?.chars ?? []
  const charAt = Math.min(at.char, Math.max(0, chars.length - 1))
  const theChar = chars[charAt] ?? null

  const view = listWindow(blockList, blockAt)

  /* the board is 1280x720 and the window is not — the lookup's own fit, on the lookup's own frame */
  useLayoutEffect(() => {
    if (!open) return
    const fit = () => frameRef.current?.style.setProperty('--lk-u', String(boardScale()))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [open])

  useEffect(() => {
    if (!open) {
      restoreFocusRef.current?.focus?.()
      restoreFocusRef.current = null
      return
    }
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => sheetRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open])

  const state = useRef({ groups, at, column, theChar })
  state.current = { groups, at, column, theChar }

  /* ==================================================================================================
     THREE COLUMNS AND ONE CURSOR IN EACH. Up and down move inside the column you are in; left and
     right move between them, which is the only arrangement that works when the three are side by
     side. Landing on a column resets nothing — walking back to the rail and forward again returns
     you to the block you were reading. */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      const s = state.current
      const g = s.groups[s.at.group] ?? null
      const sizes: Record<Column, number> = {
        group: s.groups.length,
        block: g?.blocks.length ?? 0,
        char: g?.blocks[Math.min(s.at.block, Math.max(0, (g.blocks.length || 1) - 1))]?.chars.length ?? 0,
      }
      const order: Column[] = ['group', 'block', 'char']
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const by = event.key === 'ArrowDown' ? 1 : -1
        const size = sizes[s.column]
        if (size === 0) return
        setAt((prev) => {
          const next = { ...prev, [s.column]: Math.max(0, Math.min(size - 1, prev[s.column] + by)) }
          /* moving to another group or block puts you at the top of what it holds, because the
             place you were in the last one means nothing in this one */
          if (s.column === 'group') { next.block = 0; next.char = 0 }
          if (s.column === 'block') next.char = 0
          return next
        })
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const by = event.key === 'ArrowRight' ? 1 : -1
        const i = order.indexOf(s.column)
        const next = order[Math.max(0, Math.min(order.length - 1, i + by))]
        if (sizes[next] > 0 || by < 0) setColumn(next)
        return
      }
      if (event.key === 'Enter' && s.column === 'char' && s.theChar && KANJI.test(s.theChar.char)) {
        event.preventDefault()
        const trigger = restoreFocusRef.current ?? document.body
        onClose()
        onOpenKanjiDetail(s.theChar.char, trigger)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onOpenKanjiDetail])

  if (!open) return null

  const note = masteryNote(groups)

  return createPortal(
    /* PORTALLED AND ON THE LOOKUP'S SHELL — see the note over `LookupOverlay`'s own portal for why
       z-index alone is not enough against the window titlebar. */
    <div className="lk-open" role="dialog" aria-modal="true" aria-label="Every character">
      <button type="button" className="lk-scrim" aria-label="Close" onClick={onClose} />
      <div className="lk-frame" ref={frameRef}>
        <div className="mx-sheet" ref={sheetRef} tabIndex={-1}>
          <div className="lk-cap">
            <b>文字</b><i>EVERY CHARACTER</i>
            <s>{loading ? 'COUNTING…' : note}</s>
            <button
              type="button"
              className="mx-cap-act"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Count it again"
            >
              COUNT AGAIN
            </button>
          </div>

          {error ? <p className="mx-err" role="alert">Unable to load the counts: {error}</p> : null}

          <div className="mx-body">
            <div className="mx-rail" role="tablist" aria-label="Which set">
              {groups.map((g, i) => (
                <button
                  key={g.key}
                  type="button"
                  role="tab"
                  aria-selected={i === at.group}
                  className={i === at.group ? 'on' : undefined}
                  onClick={() => { setAt({ group: i, block: 0, char: 0 }); setColumn('block') }}
                >
                  {g.en}<em>{g.jp}</em><s>{g.pct}%</s>
                </button>
              ))}
            </div>

            <div className="mx-list" aria-label="Blocks">
              {view.above > 0 ? <p className="mx-fold">{view.above} ABOVE</p> : null}
              {view.rows.map((b, i) => {
                const index = view.above + i
                return (
                  <button
                    key={b.key}
                    type="button"
                    className={index === blockAt ? 'on' : undefined}
                    aria-current={index === blockAt ? 'true' : undefined}
                    onClick={() => { setAt((p) => ({ ...p, block: index, char: 0 })); setColumn('char') }}
                  >
                    <b>{b.name}</b>
                    <i aria-hidden="true"><u style={{ width: `${b.pct}%` }} /></i>
                    <s>{b.pct}</s>
                  </button>
                )
              })}
              {view.below > 0 ? <p className="mx-fold">{view.below} BELOW</p> : null}
              {blockList.length === 0 ? <p className="mx-fold">NOTHING COUNTED HERE</p> : null}
            </div>

            <div className="mx-grid">
              <div className="mx-kick">
                <span>{theBlock?.name.toUpperCase() ?? 'NOTHING SELECTED'}</span>
                <s>{theBlock ? `${theBlock.known} OF ${chars.length} AT FULL SCORE` : ''}</s>
              </div>
              <div className="mx-chips">
                {chars.map((c, i) => {
                  const done = c.score >= CARD_MASTERY_MAX
                  const classes = ['mx-chip']
                  if (done) classes.push('done')
                  if (i === charAt && column === 'char') classes.push('at')
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={classes.join(' ')}
                      lang="ja"
                      aria-label={`${c.char}, ${c.reading}, ${c.meaning}. ${c.score} of ${CARD_MASTERY_MAX}`}
                      onMouseEnter={() => { setAt((p) => ({ ...p, char: i })); setColumn('char') }}
                      onClick={() => {
                        setAt((p) => ({ ...p, char: i }))
                        setColumn('char')
                        if (KANJI.test(c.char)) {
                          const trigger = restoreFocusRef.current ?? document.body
                          onClose()
                          onOpenKanjiDetail(c.char, trigger)
                        }
                      }}
                    >
                      {c.char}
                      <u aria-hidden="true" style={{ width: `${(c.score / CARD_MASTERY_MAX) * 100}%` }} />
                    </button>
                  )
                })}
              </div>
              {/* NOTHING OPENS, the same law the passage's cursor obeys: what the chip means is
                  already on the sheet, so pointing at one costs no motion. */}
              <div className="mx-said" aria-live="polite">
                {theChar ? (
                  <>
                    <b lang="ja">{theChar.char}</b>
                    <i lang="ja">{theChar.reading}</i>
                    <span>{theChar.meaning}</span>
                    <s className={theChar.score >= CARD_MASTERY_MAX ? 'done' : undefined}>
                      {theChar.score} / {CARD_MASTERY_MAX}
                    </s>
                  </>
                ) : <span>—</span>}
              </div>
            </div>
          </div>

          <div className="mx-hint">
            <b>↑↓</b> MOVE · <b>←→</b> COLUMN · <b>ENTER</b> THE KANJI IN FULL · <b>ESC</b> CLOSE
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
