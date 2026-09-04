import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameKey, MinigameStats, ScriptKey } from '../../../types'
import { SESSION_LENGTH_PRESETS } from '../../../constants'
import {
  drillChapters, drillDecks, drillModes, groupCopy, modeNameSize, modeStep, modeWindow,
  nearestOffered, offeredList,
} from '../drills'
import { screenHead } from '../chrome'
import { refuse } from '../refuse'
import { ScreenHead } from './ScreenHead'
import { screenClass, useEntered, useFrameFit } from '../useScreen'
import '../../../styles/stage.css'
import '../menu.css'

/* HOW THIS RUN GOES, which lived in the script hub and nowhere else. All four are persisted
   preferences rather than per-run choices -- the app has read them out of `sessionPrefs` since
   long before this screen existed -- and they stand beside the button that starts the round
   because that is the moment they mean anything. */
export interface DrillSession {
  /** items in a round, matched against `SESSION_LENGTH_PRESETS[n].items` */
  length: number
  lives: boolean
  focus: boolean
  confidence: boolean
  setLength: (items: number) => void
  toggleLives: () => void
  toggleFocus: () => void
  toggleConfidence: () => void
}

export interface DrillsProps {
  /* THE DECK IS THE APP'S NOW, NOT THE SCREEN'S. It was local state that committed only on start,
     which was harmless while the poster's one claim was a name -- but the lock reasons below are
     computed from the LIVE pool, so a list standing on a deck the app is not standing on would
     draw another deck's refusals. */
  deck: ScriptKey
  /** the resolved deck, level included: KANJI N3 rather than KANJI */
  slug: string
  session: DrillSession
  /* WHY A MODE CANNOT RUN ON THIS POOL. The hub drew these on its cassettes and the road drew
     nothing at all, so retiring the hub without them would leave seventeen modes that all look
     runnable and four that quietly fail. Keyed by mode; absent means it can run. */
  lockReasons: Partial<Record<MinigameKey, string>>
  /* WHAT YOU HAVE DONE WITH EACH MODE ON THIS DECK. `minigameStats` is written after every round
     and the script hub's cassettes were the only thing that ever read it -- so without this the
     figure would still be kept and never shown again. */
  stats: Record<MinigameKey, MinigameStats>
  onDeck: (deck: ScriptKey) => void
  onStart: (deck: ScriptKey, mode: MinigameKey) => void
  onUp: () => void
}

/* ==================================================================================================
   THE DRILLS — a catalogue, and a catalogue reads as a list. See the note over `.dr-run` for what
   was here before: seventeen modes fanned out as cards off both edges of the stage, the second and
   third carrying a number and a name over two hundred pixels of empty paper.

   TWO AXES AND ONE OF EACH SHAPE. The deck is a row of tabs across the top because it is one
   question with six answers; the modes are a column of lines because they are a catalogue; and the
   one you are on stands at poster size on the valley, which is where this family of screens puts
   the thing you are about to act on.
   ================================================================================================== */

export function Drills({
  deck, slug, session, lockReasons, stats, onDeck, onStart, onUp,
}: DrillsProps) {
  const entered = useEntered()
  const frameRef = useFrameFit()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const modes = useMemo(() => drillModes(), [])
  const chapters = useMemo(() => drillChapters(modes), [modes])
  const decks = useMemo(() => drillDecks(modes), [modes])

  const deckKey = deck
  const [sel, setSel] = useState(() => nearestOffered(modes, deck, 0))
  const offered = useMemo(() => offeredList(modes, deckKey), [modes, deckKey])
  const win = modeWindow(offered, sel)
  const here = modes[sel]
  const shut = here ? lockReasons[here.key] ?? null : null
  const record = here ? stats[here.key] : undefined
  const played = record && record.attempted > 0

  /* the three lengths answer to their number and the three switches to their letter, both printed
     on the chip -- the same rule level one's rows and the study screens' level row follow */
  const setKeys = useMemo(() => {
    const map = new Map<string, () => void>()
    SESSION_LENGTH_PRESETS.forEach((preset, index) => {
      map.set(String(index + 1), () => session.setLength(preset.items))
    })
    map.set('l', session.toggleLives)
    map.set('f', session.toggleFocus)
    map.set('c', session.toggleConfidence)
    return map
  }, [session])

  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault(); setSel((s) => modeStep(offered, s, 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault(); setSel((s) => modeStep(offered, s, -1))
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        const step = event.key === 'ArrowRight' ? 1 : -1
        const i = decks.findIndex((d) => d.key === deckKey)
        const next = decks[Math.max(0, Math.min(decks.length - 1, i + step))]
        onDeck(next.key)
        /* changing deck snaps to the nearest mode that deck still offers */
        setSel((s) => nearestOffered(modes, next.key, s))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        /* A REFUSED PRESS SAYS SO OUT LOUD, and the reason is already on the slab -- the flash and
           the knock are only what send you to read it. See `refuse.ts`. */
        if (shut) { refuse(); return }
        if (here) onStart(deckKey, here.key)
      } else {
        /* STOPPED, NOT MERELY PREVENTED: App binds 1 through 5 on the window as its route into a
           deck, so a bubbling 1 would set the round to eight items and then leave the screen. */
        const act = setKeys.get(event.key.toLowerCase())
        if (act) { event.preventDefault(); event.stopPropagation(); act() }
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [offered, decks, deckKey, modes, here, onDeck, onStart, setKeys, shut])

  /* THE RESOLVED DECK, because KANJI is five decks and the list runs on whichever of them the
     study screen last stood on. RUN ON KANJI over an N3 round is the same half-truth the deck
     screen's own caption exists to avoid. */
  const deckLabel = slug.replace(/_/g, ' ').toUpperCase()
  const chapter = chapters.find((c) => sel >= c.from && sel <= c.to) ?? chapters[0]
  const copy = groupCopy(chapter?.key ?? '')

  /* a chapter heading is drawn where the chapter CHANGES inside the window, so a run that opens
     halfway down RECOGNITION still says which chapter it is in */
  let last: string | null = null

  return (
    <div className={screenClass(entered)} ref={rootRef} tabIndex={-1}>
      <div className="mn-frame" ref={frameRef}>
        <ScreenHead head={screenHead('DRILLS', 'drills')} />

        {/* ─── the deck axis. Its figure is counted out of SCRIPT_MINIGAMES rather than stated. */}
        <div className="dr-decks" role="group" aria-label="Which deck to drill">
          {decks.map((d) => (
            <button
              key={d.key}
              type="button"
              className={d.key === deckKey ? 'dr-deck on' : 'dr-deck'}
              onClick={() => { onDeck(d.key); setSel((v) => nearestOffered(modes, d.key, v)) }}
              aria-label={`${d.label} — offers ${d.offers} of ${modes.length} drills`}
            >
              <b>{d.label.toUpperCase()}</b>
              <s>{d.offers} / {modes.length}</s>
            </button>
          ))}
        </div>

        {/* ─── every mode this deck offers, as lines under its own chapter ─────────────────── */}
        <div className="dr-run" role="group" aria-label="Drills this deck offers">
          {win.list.map((i) => {
            const m = modes[i]
            /* NUMBERED BY ITS PLACE IN THE LIST YOU ARE LOOKING AT. The catalogue index skips --
               hiragana offers twelve of seventeen -- so a column reading 01 02 03 06 08 10 looks
               like rows failed to draw, and disagrees with the foot band's MODE 1 OF 12. */
            const no = offered.indexOf(i) + 1
            const chap = chapters.find((c) => i >= c.from && i <= c.to)
            const head = chap && chap.key !== last ? chap : null
            last = chap?.key ?? last
            const locked = lockReasons[m.key]
            return (
              <Row key={m.key}>
                {head ? (
                  <span className="dr-chap">
                    <b>{head.title.toUpperCase()}</b>
                    <i>{groupCopy(head.key).jp}</i>
                    <u />
                  </span>
                ) : null}
                <button
                  type="button"
                  className={['dr-mode', i === sel ? 'on' : '', locked ? 'shut' : '']
                    .filter(Boolean).join(' ')}
                  onClick={() => setSel(i)}
                  aria-label={`${m.title} — ${m.description}`}
                >
                  <span className="n">{String(no).padStart(2, '0')}</span>
                  <span className="t">{m.title}</span>
                  <span className="s">
                    {/* THIS DECK OFFERS IT AND SOMETHING ELSE DOES NOT -- a missing voice model,
                        too few cards. The poster carries which; the row only says it is shut. */}
                    {locked ? 'SHUT'
                      : m.decks.length === decks.length ? `ALL ${decks.length} DECKS`
                        : `${m.decks.length} DECKS`}
                  </span>
                </button>
              </Row>
            )
          })}
        </div>

        {/* ─── and the mode itself, on the valley ──────────────────────────────────────────── */}
        {here ? (
          <div className="dr-card">
            <span className="dr-cap">
              {chapter ? chapter.title.toUpperCase() : ''} <i>{copy.jp}</i>
              {' '}· MODE {String(offered.indexOf(sel) + 1).padStart(2, '0')} OF {offered.length}
            </span>
            <b className="dr-hen" style={{ fontSize: `${modeNameSize(here.title)}px` }}>
              {here.title}
            </b>
            <span className="dr-hd">{here.description}</span>

            <span className="dr-read">
              {/* THE RECORD, WHICH IS THE ONE THING A CATALOGUE CANNOT TELL YOU. Not played is
                  drawn as not played rather than as nought per cent -- a mode you have never
                  run is not a mode you are bad at. */}
              <span className="dr-rec">
                {played ? (
                  <>
                    <b>{Math.round((record.correct / record.attempted) * 100)}%</b>
                    <i>RIGHT</i>
                    <b>{record.bestStreak}</b>
                    <i>BEST RUN</i>
                  </>
                ) : <span className="none">NOT PLAYED ON THIS DECK</span>}
              </span>
              {/* WHICH DECKS OFFER IT, which is the map read the other way and the one fact a
                  learner picking a drill cannot get anywhere else. */}
              <span className="dr-cells">
                {decks.map((d) => (
                  <i
                    key={d.key}
                    className={`${here.decks.includes(d.key) ? 'has' : ''}`
                      + `${d.key === deckKey ? ' at' : ''}`}
                  >
                    {d.label.toUpperCase()}
                  </i>
                ))}
              </span>
            </span>

            <button
              type="button"
              className={shut ? 'dr-slab shut' : 'dr-slab'}
              onClick={() => { if (shut) { refuse(); return } onStart(deckKey, here.key) }}
              aria-disabled={!!shut}
            >
              <em>{shut ? 'CANNOT RUN HERE' : `${session.length} ITEMS`}</em>
              <b>{shut ? shut.toUpperCase() : `RUN ON ${deckLabel} ▸`}</b>
            </button>
          </div>
        ) : null}

        {/* THE FOLD, SAID OUT LOUD. A deck that offers twelve of seventeen has five closed over,
            and a list that silently omits them looks like a shorter catalogue. */}
        <div className="dr-mini">
          <span className="dr-line">
            MODE <em>{win.at + 1}</em> OF <em>{offered.length}</em> OFFERED ON {deckLabel}
            {offered.length < modes.length
              ? ` · ${modes.length - offered.length} FOLDED AWAY`
              : ''}
            {win.behind ? ` · ${win.behind} ABOVE` : ''}
            {win.ahead ? ` · ${win.ahead} BELOW` : ''}
          </span>
        </div>

        {/* ── HOW THIS RUN GOES ───────────────────────────────────────────────────────────────
            Four switches that existed only inside the script hub, standing where the list ends
            rather than on a settings page: they are the difference between eight cards and
            twenty, and between a round that can be lost and one that cannot. */}
        <div className="dr-set" role="group" aria-label="How this run goes">
          <span className="dr-setlab">THIS RUN</span>
          {SESSION_LENGTH_PRESETS.map((preset, index) => (
            <button
              key={preset.key}
              type="button"
              className={preset.items === session.length ? 'dr-chip on' : 'dr-chip'}
              aria-pressed={preset.items === session.length}
              aria-label={`${preset.label} round, ${preset.items} items`}
              onClick={() => session.setLength(preset.items)}
            >
              <s>{index + 1}</s><b>{preset.label.toUpperCase()}</b><i>{preset.items}</i>
            </button>
          ))}
          <span className="dr-setdiv" aria-hidden="true" />
          <button
            type="button"
            className={session.lives ? 'dr-chip on' : 'dr-chip'}
            aria-pressed={session.lives}
            aria-label={`Lives ${session.lives ? 'on' : 'off'}`}
            onClick={session.toggleLives}
          >
            <s>L</s><b>LIVES</b>
          </button>
          <button
            type="button"
            className={session.focus ? 'dr-chip on' : 'dr-chip'}
            aria-pressed={session.focus}
            aria-label={`Focused review ${session.focus ? 'on' : 'off'}`}
            onClick={session.toggleFocus}
          >
            <s>F</s><b>FOCUS</b>
          </button>
          <button
            type="button"
            className={session.confidence ? 'dr-chip on' : 'dr-chip'}
            aria-pressed={session.confidence}
            aria-label={`Confidence capture ${session.confidence ? 'on' : 'off'}`}
            onClick={session.toggleConfidence}
          >
            <s>C</s><b>CONFIDENCE</b>
          </button>
        </div>

        <div className="back-tab">
          <button type="button" onClick={onUp}>
            <b className="bt-en">Back</b><em className="bt-jp">戻る</em>
          </button>
        </div>
        <div className="hints">
          <span><b>↑ ↓</b>Choose<em>選択</em></span>
          <span><b>← →</b>Deck<em>教材</em></span>
          <span><b>1–3</b>Length<em>長さ</em></span>
          <span><b>L F C</b>Switches<em>設定</em></span>
          <span><b>ENTER</b>Run<em>決定</em></span>
        </div>
      </div>
    </div>
  )
}

/* A CHAPTER HEADING AND ITS FIRST ROW ARE TWO SIBLINGS, NOT A WRAPPER: `.dr-run` is the flex column
   that spaces every child, so a div around the pair would collapse them into one slot and take the
   gap with it. This fragment keys the pair and adds no box. */
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
