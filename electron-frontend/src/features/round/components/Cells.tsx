import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as wanakana from 'wanakana'
import { bindWanakanaIme } from '../../../lib/wanakanaBinding'
import type { RoundOption } from '../../../types'
import type { SlabSpec } from './Round'

/* ==================================================================================================
   THE TWO CELLS OF THE SHEET, AND THE THREE THINGS THE RIGHT-HAND ONE CAN HOLD.

   Split out of `Round` because the shell is the same on every screen the design card draws and
   these are not: a crossword's board and a passage's text go in the same two slots.
   ================================================================================================== */

export interface AskProps {
  kick: string
  kickJp: string
  /** the hint bulb, the speaker — the affordances the prompt card carried, in the kicker's row */
  tools?: ReactNode
  /** what the card is tagged as, when it is tagged */
  tags?: string[]
  /** LISTENING AND DICTATION HIDE THEIR PROMPT until the answer is in: the whole point of those
      modes is that you have not seen it. It stays in the DOM and out of the accessibility tree, the
      way the old prompt card had it, so a reveal is a state change rather than an insertion. */
  hidden?: boolean
  /** the prompt itself, already built — a specimen, a stem with a gap, a word with a reading */
  children: ReactNode
  /** solved from the prompt's own length; see `promptSize` */
  size: number
  src?: { label: string; value: string } | null
  /** what opens under the prompt once the answer is on the screen */
  gloss?: ReactNode
  extra?: ReactNode
}

export function RoundAsk({
  kick, kickJp, tools, tags, hidden = false, children, size, src, gloss, extra,
}: AskProps) {
  return (
    <div className="rd-ask">
      <div className="rd-kick">
        <span>{kick}</span>
        {tools ? <span className="rd-tools">{tools}</span> : null}
        <em>{kickJp}</em>
      </div>
      {tags && tags.length > 0 ? (
        <div className="rd-tags" aria-label="Card tags">
          {tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      ) : null}
      <div
        className={hidden ? 'rd-focus is-hidden' : 'rd-focus'}
        style={{ fontSize: `${size}px` }}
        aria-hidden={hidden || undefined}
      >
        {children}
      </div>
      {gloss ?? null}
      {extra ?? null}
      {src ? <div className="rd-src">{src.label} <i>{src.value}</i></div> : null}
    </div>
  )
}

export interface GlossProps {
  /** the answer, in whichever script it is written in */
  answer: string
  answerIsJp?: boolean
  /** the reading and the meaning, whichever of them the card has */
  under?: string | null
  /** the note that earns the wrong answer — a grammar pattern, a dictionary aside */
  body?: string | null
}

export function RoundGloss({ answer, answerIsJp = false, under, body }: GlossProps) {
  return (
    <div className="rd-gloss">
      <b className={answerIsJp ? 'jp' : undefined}>{answer}</b>
      {under ? <i>{under}</i> : null}
      {body ? <p>{body}</p> : null}
    </div>
  )
}

export interface WorkProps {
  kick: string
  kickJp: string
  note?: string | null
  children: ReactNode
  /** what goes between the work and the slab — the verdict, or the confidence row */
  after?: ReactNode
  slab: SlabSpec
}

export function RoundWork({ kick, kickJp, note, children, after, slab }: WorkProps) {
  const tone = slab.tone === 'calm' ? ' calm' : ''
  const go = slab.onClick ? ' go' : ''
  return (
    <div className="rd-work">
      <div className="rd-kick"><span>{kick}</span><em>{kickJp}</em></div>
      {note ? <p className="rd-note">{note}</p> : null}
      <div className="rd-body">{children}</div>
      {after ?? null}
      {slab.onClick ? (
        <button
          type="button"
          className={`rd-slab${tone}${go}`}
          onClick={slab.onClick}
          disabled={slab.disabled}
          aria-label={slab.label}
        >
          {slab.text}{slab.jp ? <em>{slab.jp}</em> : null}
        </button>
      ) : (
        <div className={`rd-slab${tone}`}>{slab.text}{slab.jp ? <em>{slab.jp}</em> : null}</div>
      )}
    </div>
  )
}

/* ==================================================================================================
   THE SLIPS. Four numbered pieces of paper, and after the answer they carry the verdict rather than
   being replaced by a panel that states it: the right one takes a gold edge, the one you pressed
   takes a struck-through vermilion, the ones you did not touch go quiet. Nothing re-lays out — a
   screen that rearranges itself between question and answer is a screen you re-read twenty times a
   round. */
export interface SlipsProps {
  options: RoundOption[]
  activeIndex: number
  disabled: boolean
  /** the correct label, once it is allowed to be known */
  answer?: string | null
  /** what you actually pressed, once you have */
  chose?: string | null
  /** set for the modes whose options are Japanese, so they are set in the Japanese face */
  jp?: boolean
  onActiveIndexChange: (index: number) => void
  onSelect: (label: string) => void
}

export function RoundSlips({
  options, activeIndex, disabled, answer, chose, jp = false, onActiveIndexChange, onSelect,
}: SlipsProps) {
  const said = Boolean(answer)
  return (
    <div className={`rd-slips${options.length > 4 ? ' many' : options.length <= 2 ? ' two' : ''}`}>
      {options.map((option, index) => {
        const classes = ['rd-slip']
        if (said) {
          if (option.label === answer) classes.push('right')
          else if (chose != null && option.label === chose) classes.push('wrong')
          else classes.push('dead')
        } else if (index === activeIndex) classes.push('hot')
        return (
          <button
            key={option.id}
            type="button"
            className={classes.join(' ')}
            disabled={disabled}
            data-active={index === activeIndex}
            onFocus={() => onActiveIndexChange(index)}
            onMouseEnter={() => onActiveIndexChange(index)}
            onClick={() => { onActiveIndexChange(index); onSelect(option.label) }}
          >
            <u aria-hidden="true">{index + 1}</u>
            <b className={jp ? 'jp' : undefined}>{option.label}</b>
          </button>
        )
      })}
    </div>
  )
}

/* ==================================================================================================
   THE TYPED ANSWER, WHICH IS A LINE RULED ON THE SHEET.

   `TypedAnswerPanel` is a bordered box with a corner-arrow button, drawn for a dark panel; on paper
   the same job is a rule under where you write. What is carried over unchanged is the part that is
   not styling: `bindWanakanaIme`, which is the difference between a working Japanese IME and one
   whose kanji conversion is corrupted on every keystroke, and the finalise-on-submit that turns a
   half-typed romaji tail into kana.
   ================================================================================================== */
export interface TypedProps {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  wanakanaMode?: 'hiragana' | 'katakana'
  /** which script is being written -- see the note over `.rd-type input.lat` */
  face?: 'jp' | 'lat'
}

export function RoundTyped({
  inputRef, value, placeholder, disabled, onChange, onSubmit, wanakanaMode, face = 'jp',
}: TypedProps) {
  const composing = useRef(false)
  const [knocking, setKnocking] = useState(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el || !wanakanaMode) return
    return bindWanakanaIme(el, wanakanaMode === 'hiragana' ? 'toHiragana' : 'toKatakana')
  }, [inputRef, wanakanaMode])

  return (
    <form
      className={knocking ? 'rd-type knock' : 'rd-type'}
      onAnimationEnd={() => setKnocking(false)}
      onSubmit={(event) => {
        event.preventDefault()
        const raw = event.currentTarget.querySelector('input')?.value ?? ''
        /* AN EMPTY SUBMIT KNOCKS. Doing nothing at all is the shape of a broken control -- the same
           argument `refuse.ts` makes for a locked row in the menu. */
        if (raw.trim().length === 0) { setKnocking(true); return }
        if (!wanakanaMode) { onSubmit(raw); return }
        onSubmit(wanakanaMode === 'hiragana' ? wanakana.toHiragana(raw) : wanakana.toKatakana(raw))
      }}
    >
      <div className="rd-type-row">
        <input
          ref={inputRef}
          className={face === 'lat' ? 'lat' : undefined}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          aria-label={placeholder}
          onChange={(event) => { if (!wanakanaMode) onChange(event.target.value) }}
          onInput={(event) => {
            if (wanakanaMode && !composing.current) onChange(event.currentTarget.value)
          }}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={(event) => {
            composing.current = false
            if (wanakanaMode) onChange(event.currentTarget.value)
          }}
        />
        <button type="submit" className="rd-type-go" disabled={disabled} aria-label="Submit answer">
          ENTER ▸
        </button>
      </div>
    </form>
  )
}

/* ==================================================================================================
   AND WHAT THE LINE SAYS AFTERWARDS.

   A field you can no longer type in is not an answer, it is a broken control -- and while it stood
   there the verdict below it printed the same word again under the label `Your answer`. This is the
   slips' own move made on a rule instead of on paper: what you wrote stays where you wrote it, and
   is struck through in vermilion when it was wrong. What the answer WAS is the prompt cell's line,
   which prints it in full the moment the round resolves, so it is not repeated here.
   ================================================================================================== */
export interface WroteProps {
  text: string
  right: boolean
  face?: 'jp' | 'lat'
  /** what the line is a record of -- `YOU WROTE`, `YOU SAID`, `YOU DREW` */
  label?: string
}

export function RoundWrote({ text, right, face = 'jp', label = 'YOU WROTE' }: WroteProps) {
  return (
    <div className={right ? 'rd-said hit' : 'rd-said miss'}>
      <span>
        <b className={face === 'jp' ? 'jp' : undefined} lang={face === 'jp' ? 'ja' : undefined}>
          {text}
        </b>
        <s>{label}</s>
      </span>
    </div>
  )
}

/* ==================================================================================================
   WHAT A ROUND SAYS ONCE IT IS OVER, and it is everything the old feedback panel said.

   EVERY FILL CARRIES ITS OWN VERDICT NOW, so this carries none of it: the slips edge the right one
   gold and strike the one you pressed, the typed rule keeps what you wrote and strikes that, the
   chunks lock in the order you left them and the drawn square holds the character you drew. What is
   left for this panel is what none of those can say -- the message, what it cost or earned, how long
   you took, and the sentence or the dictionary note that makes the miss worth having made.

   IT USED TO PRINT BOTH ANSWERS HERE and that was a third printing rather than a first: the prompt
   cell has said what the answer was since the sheet landed, several of the modes put it in the
   message as well (`Not quite. The answer is ...`), and on sentence assembly what it printed under
   `Your answer` was the internal chunk ids -- `chunk-0|chunk-1` -- because that is what the grader
   is handed. A row that is wrong on one mode and redundant on the other fifteen is not a row.

   IT SITS BETWEEN THE WORK AND THE SLAB rather than replacing either. `MinigameResponsePanel` swapped
   the whole answer area for a feedback card, so the thing you had just pressed vanished at the moment
   you were told about it.
   ================================================================================================== */
export interface VerdictProps {
  message: string
  tone: 'success' | 'error' | null
  comboBonus?: number
  milestoneStreak?: number | null
  livesEnabled?: boolean
  responseMs?: number | null
  example?: { jp: string; romaji: string; en: string } | null
  note?: { title: string; copy: string } | null
  saving?: boolean
  saveFailed?: boolean
  /** the app's own wording for both — `FEEDBACK_COPY`, passed in so this file owns no copy */
  savingCopy?: string
  saveFailedCopy?: string
}

export function RoundVerdict({
  message, tone, comboBonus = 0, milestoneStreak = null, livesEnabled = false,
  responseMs, example, note, saving = false, saveFailed = false,
  savingCopy = 'Saving that review…', saveFailedCopy = 'That review did not save.',
}: VerdictProps) {
  return (
    <div className={`rd-verdict${tone ? ` is-${tone}` : ''}`} role="status" aria-live="polite">
      <p className="rd-verdict-msg">{message}</p>
      <div className="rd-verdict-meta">
        {comboBonus > 0 ? <span>+{comboBonus} combo</span> : null}
        {milestoneStreak ? <span>Streak ×{milestoneStreak}</span> : null}
        {tone === 'error' && livesEnabled ? <span className="cost">−1 life</span> : null}
        {/* WHEN THIS CARD COMES BACK IS NOT IN HERE. It is the one fact worth reading off this
            screen, so it stands on the prompt cell's own line at nineteen points rather than
            fifth in a row of eight-and-a-half point chips. See `src` in `MinigameView`. */}
        {responseMs ? <span>Answered in {(responseMs / 1000).toFixed(1)}s</span> : null}
      </div>
      {example ? (
        <p className="rd-verdict-eg"><b lang="ja">{example.jp}</b> {example.en}</p>
      ) : null}
      {note ? <p className="rd-verdict-eg"><b>{note.title}</b> {note.copy}</p> : null}
      {saving ? <p className="rd-verdict-save">{savingCopy}</p> : null}
      {saveFailed ? <p className="rd-verdict-save is-bad" role="alert">{saveFailedCopy}</p> : null}
    </div>
  )
}

/* HOW SURE WERE YOU. Off by default; when it is on it is the last thing you touch before answering,
   so it goes under the work rather than over it. */
export interface ConfidenceProps {
  scores: readonly number[]
  labels: Record<number, string>
  value: number
  disabled: boolean
  onSet: (score: number) => void
}

export function RoundConfidence({ scores, labels, value, disabled, onSet }: ConfidenceProps) {
  return (
    <div className="rd-conf" role="group" aria-label="Select confidence score for this answer">
      <span>HOW SURE?</span>
      {scores.map((score) => (
        <button
          key={score}
          type="button"
          className={value === score ? 'is-on' : undefined}
          aria-pressed={value === score}
          aria-label={`Confidence ${labels[score]}`}
          disabled={disabled}
          onClick={() => onSet(score)}
        >
          {labels[score]}
        </button>
      ))}
    </div>
  )
}
