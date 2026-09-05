import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bareLength, bareText, minutesLeft, paginate, pieces, proseSize, stops, termSize,
  useWordGloss, usePassages,
} from '../features/passages'
import type { Passage } from '../features/passages'
import { Round, RoundAsk, RoundWork } from '../features/round'
import type { RunChip } from '../features/round'
import { screenHead } from '../features/menu'

/* ==================================================================================================
   THE PASSAGE — the third screen onto the SHEET, and the one that turns it round.

   THE TWO CELLS SWAP JOBS AND KEEP THEIR SIZES, which is the design card's whole argument for this
   fill: on a drill the left cell asks and the right one answers; here the right cell is the TEXT and
   the left is what the cursor is standing on. Same sheet, same hairline, same 322 — a reader who has
   done a drill already knows where to look, and the word being explained lands where the character
   was. (`design-system/components/past-three.html`, FIVE.)

   NOTHING OPENS. The old reader put the definition in a popover over the sentence you were reading
   it from — a menu with two buttons, one of which opened a second overlay on top. There is a whole
   cell for it here and it is never empty, so a lookup costs no motion and hides nothing.

   AND NOTHING SCROLLS. The text is dealt a page at a time and the foot band carries the pages, which
   is the frame contract's own overflow law and gives the screen the one fact a scrollbar only
   implies: how much of this text is left. See `features/passages/reader.ts` for how a page is
   measured out, and why the cursor's stops are the words the text itself annotated.
   ================================================================================================== */

interface PassageHubViewProps {
  /** the text the library opened — this view has no shelf of its own to pick from */
  passageId: string
  onBack: () => void
  onOpenDictionary: (query?: string) => void
  onPlayAudio: (text: string) => void
  voiceBusy: boolean
}

export function PassageHubView({
  passageId, onBack, onOpenDictionary, onPlayAudio, voiceBusy,
}: PassageHubViewProps) {
  const {
    passages, loading, error, readerSettings, selectPassage, clearSelection,
    setFuriganaVisible, markProgress, retry,
  } = usePassages()

  /* THE SHELF STILL HAS TO LOAD before the id means anything: `usePassages` fetches the whole set
     and the menu only handed over which one. Derived rather than held in state, so a reload of the
     shelf cannot leave a stale copy of the text on screen. */
  const passage: Passage | null = passages.find((p) => p.id === passageId) ?? null

  useEffect(() => {
    if (passage) selectPassage(passage)
  }, [passage, selectPassage])

  const [at, setAt] = useState(0)
  const [cursor, setCursor] = useState(0)

  const pages = useMemo(() => (passage ? paginate(passage.text_jp) : []), [passage])
  const page = pages[at] ?? ''
  const words = useMemo(() => stops(page), [page])
  const parts = useMemo(() => pieces(page), [page])
  const word = words[cursor] ?? null
  const gloss = useWordGloss(word?.text ?? null)

  /* a page you have not reached has no cursor position worth keeping, and the first word of the one
     you have is where a reader's eye already is */
  useEffect(() => { setCursor(0) }, [at])

  const leave = useCallback(() => {
    clearSelection()
    onBack()
  }, [clearSelection, onBack])

  const finish = useCallback(() => {
    if (passage) markProgress(passage.id, 'completed')
    leave()
  }, [passage, markProgress, leave])

  const turn = useCallback((by: 1 | -1) => {
    setAt((n) => Math.max(0, Math.min(pages.length - 1, n + by)))
  }, [pages.length])

  /* THE CURSOR RUNS OFF THE PAGE RATHER THAN STOPPING ON IT. Walking the words is how you read this
     screen, so the last word of a page is not a wall — the arrow that leaves it turns the page and
     lands on the first word of the next, which is where you were going anyway. */
  const walk = useCallback((by: 1 | -1) => {
    setCursor((c) => {
      const next = c + by
      if (next >= 0 && next < words.length) return next
      if (next < 0 && at > 0) {
        const before = stops(pages[at - 1])
        setAt(at - 1)
        /* the effect above resets the cursor to nought on every page change, so the tail of the
           page you are stepping BACK into is set after it, not instead of it */
        queueMicrotask(() => setCursor(Math.max(0, before.length - 1)))
        return c
      }
      if (next >= words.length && at < pages.length - 1) { setAt(at + 1); return c }
      return c
    })
  }, [words.length, at, pages])

  const keys = useRef({ walk, turn, leave, finish, onOpenDictionary, onPlayAudio })
  keys.current = { walk, turn, leave, finish, onOpenDictionary, onPlayAudio }
  const furigana = readerSettings.furiganaVisible
  const state = useRef({ furigana, word, page, last: at === pages.length - 1 })
  state.current = { furigana, word, page, last: at === pages.length - 1 }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = keys.current
      const s = state.current
      switch (event.key) {
        case 'ArrowRight': event.preventDefault(); k.walk(1); return
        case 'ArrowLeft': event.preventDefault(); k.walk(-1); return
        case 'ArrowDown': case 'PageDown': event.preventDefault(); k.turn(1); return
        case 'ArrowUp': case 'PageUp': event.preventDefault(); k.turn(-1); return
        case ' ': event.preventDefault(); if (s.last) k.finish(); else k.turn(1); return
        case 'Enter':
          if (s.word) { event.preventDefault(); k.onOpenDictionary(s.word.text) }
          return
        case 'Escape': event.preventDefault(); k.leave(); return
        default: break
      }
      if (event.key === 'f' || event.key === 'F') { event.preventDefault(); setFuriganaVisible(!s.furigana) }
      if (event.key === 'p' || event.key === 'P') { event.preventDefault(); k.onPlayAudio(bareText(s.page)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setFuriganaVisible])

  /* ==================================================================================================
     THE THREE STATES THAT ARE NOT A TEXT — waiting for the shelf, the shelf having failed, and an id
     the shelf does not contain, which can only happen if the library and this view disagree. All
     three are the same sheet, because a screen that changes shape between its own states is two
     screens sharing a route. */
  if (!passage) {
    const why = loading ? null : error ?? 'That text is no longer on the shelf.'
    return (
      <Round
        head={screenHead('READING', 'library', { en: 'READING', jp: '読解' })}
        cap="THE WORLD · READING"
        run={[]}
        foot={{ at: 0, target: 0, trail: [], note: 'NOT OPEN' }}
        onBack={onBack}
        backLabel="Back"
        backJp="戻る"
        backAria="Back to the library"
        hints={[{ cap: 'ESC', en: 'Back', jp: '戻る' }]}
        ask={
          <RoundAsk kick={why ? 'NO TEXT' : 'ONE MOMENT'} kickJp="準備" size={132}>
            <span lang="ja">{why ? '無' : '本'}</span>
          </RoundAsk>
        }
        work={
          <RoundWork
            kick="THE TEXT"
            kickJp="本文"
            slab={why
              ? { text: 'BACK TO THE LIBRARY', jp: '戻る', tone: 'calm', onClick: onBack }
              : { text: 'OPENING', jp: '準備', tone: 'calm' }}
          >
            <div className="rd-plain">
              <h2>{loading ? 'Opening…' : 'Nothing to read'}</h2>
              {why ? <p className="rd-err" role="alert">{why}</p> : null}
              {error ? (
                <p><button type="button" className="rd-undo" onClick={retry}>TRY AGAIN</button></p>
              ) : null}
            </div>
          </RoundWork>
        }
      />
    )
  }

  const left = pages.length - at - 1
  const mins = minutesLeft(passage.word_count, pages, at)
  const chips: RunChip[] = [
    { key: 'page', value: String(at + 1).padStart(2, '0'), of: `/ ${pages.length}`, label: 'PAGE' },
    /* the one figure a scrollbar could never give: how long the rest takes at the shelf's own pace */
    { key: 'mins', value: String(mins), label: 'MIN LEFT' },
  ]

  /* WHAT THE PROMPT CELL CAN ALWAYS SAY. The text annotated its own words, so the reading is on the
     page already and costs nothing; only the English needs the dictionary. When it cannot be had the
     reading takes the headline and the cell says why underneath, which is the difference between a
     cell that is empty and one that is honest. */
  const meaning = gloss.status === 'ready' ? gloss.meaning : null
  const src = word
    ? {
      label: meaning ? 'WORD'
        : gloss.status === 'looking' ? 'LOOKING IT UP'
          : gloss.reason ?? 'NO MEANING',
      value: `${cursor + 1} / ${words.length}`,
    }
    : { label: 'PAGE', value: `${at + 1} / ${pages.length}` }

  return (
    <Round
      head={screenHead('READING', 'library', { en: 'READING', jp: passage.title })}
      cap={`${passage.author} · ${passage.word_count} WORDS · ${passage.difficulty_label.toUpperCase()}`}
      run={chips}
      foot={{
        at,
        target: pages.length,
        trail: Array.from({ length: at }, () => true),
        note: `${pages.length} ${pages.length === 1 ? 'PAGE' : 'PAGES'}`,
      }}
      onBack={leave}
      backLabel="Leave"
      backJp="戻る"
      backAria="Back to the library"
      /* THE ROW ONLY OFFERS WHAT THIS TEXT HAS. A text that marks no readings has no words to walk
         and no entry to open, and a key row that names them anyway is the screen lying about
         itself -- which is the thing this menu has spent its whole rebuild not doing. */
      hints={[
        ...(words.length > 0 ? [
          { cap: '←→', en: 'Word', jp: '選択' },
          { cap: 'ENTER', en: 'Full entry', jp: '辞書' },
        ] : []),
        { cap: 'SPACE', en: 'Page', jp: '頁' },
        { cap: 'F', en: 'Furigana', jp: '振仮名' },
        { cap: 'P', en: 'Hear it', jp: '音声' },
        { cap: 'ESC', en: 'Leave', jp: '戻る' },
      ]}
      /* HAND-WRITTEN RATHER THAN `RoundAsk`: this cell holds a gloss, not a specimen. `RoundAsk`
         centres one big thing and hangs an answer off it, which is what a drill wants; a word with
         its reading and its meaning under it is a stack, and at specimen size the word pushed both
         of the others onto the floor of the cell. */
      ask={
        <div className="rd-ask">
          <div className="rd-kick">
            <span>{word ? 'UNDER THE CURSOR' : 'NOTHING TO STAND ON'}</span><em>語義</em>
          </div>
          <div className="rd-term">
            <b lang="ja" style={{ fontSize: `${termSize(word?.text ?? '—')}px` }}>
              {word?.text ?? '—'}
            </b>
            {word ? <i lang="ja">{word.reading}</i> : null}
            {meaning ? <p>{meaning}</p> : null}
          </div>
          {src ? <div className="rd-src">{src.label} <i>{src.value}</i></div> : null}
        </div>
      }
      work={
        <RoundWork
          kick="THE TEXT"
          kickJp="本文"
          note={words.length === 0 ? 'THIS TEXT MARKS NO READINGS, SO THERE IS NOWHERE FOR THE CURSOR TO STAND.' : null}
          slab={
            left > 0
              ? { text: 'SPACE FOR THE NEXT PAGE', jp: '次頁', tone: 'calm', onClick: () => turn(1) }
              : { text: 'THAT IS THE WHOLE TEXT', jp: '読了', tone: 'calm', onClick: finish, label: 'Finish this text' }
          }
        >
          {/* the page's own size, solved from how much of it there is -- see `proseSize` */}
          <div className="rd-prose" lang="ja" style={{ fontSize: `${proseSize(bareLength(page))}px` }}>
            {parts.map((part, i) => (
              part.kind === 'plain' ? <span key={i}>{part.text}</span> : (
                <button
                  key={i}
                  type="button"
                  className={part.at === cursor ? 'rd-word on' : 'rd-word'}
                  aria-current={part.at === cursor ? 'true' : undefined}
                  onMouseEnter={() => setCursor(part.at)}
                  onClick={() => { setCursor(part.at); onOpenDictionary(part.text) }}
                >
                  {furigana
                    ? <ruby>{part.text}<rt>{part.reading}</rt></ruby>
                    : part.text}
                </button>
              )
            ))}
          </div>
          {voiceBusy ? <p className="rd-note" aria-live="polite">READING IT ALOUD…</p> : null}
        </RoundWork>
      }
    />
  )
}
