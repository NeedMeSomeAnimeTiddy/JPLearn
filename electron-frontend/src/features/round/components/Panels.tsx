import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Mic, Square } from 'lucide-react'
import { useCallback, useMemo, useState, type RefObject } from 'react'
import { useMicRecorder } from '../../../hooks/useMicRecorder'
import { assessTypedAnswer } from '../../../lib/answerAssessment'
import { blobToBase64, normalizeSpeechMimeType } from '../../../lib/audioEncoding'
import type { TypedAnswerState } from '../../../lib/answerAssessment'
import type { RoundOption } from '../../../types'
import { getStrokeOrderCandidates, sanitizeRomajiInput } from '../../../utils'
import { HANDWRITING_MISS_THRESHOLD, useHandwritingQuiz } from '../../handwriting'
import type { HandwritingOutcome } from '../../handwriting'
import { SHEET_INK, SLATE, candidateSize } from '../utils'

/* ==================================================================================================
   THE FOUR MODES THAT BRING A BOARD OF THEIR OWN, ON PAPER.

   These were hosted rather than drawn: `MinigameView` mounted the app's old dark-theme panels inside
   the sheet's work cell and said so out loud, calling it a staged port. Rendered, the stage looked
   like this — a black slab with a gold-edged dark field and a dark candidate tray, laid on cream; a
   pair of brown gradient chips with rounded corners in an app whose whole vocabulary is square; and
   a handwriting canvas whose ink colour is read off `--text-main`, which in this app's dark theme is
   very nearly white. THE CHARACTER YOU DREW WAS INVISIBLE ON THE PAPER YOU DREW IT ON.

   None of the logic moved. `useHandwritingQuiz` and `useMicRecorder` were already hooks, the
   candidate search is `getStrokeOrderCandidates`, and the ordering is the same dnd-kit sortable it
   always was. What changed is that each of the four now says its piece in the sheet's own language:
   a rule you write on, numbered rows, an ink square, a stamp you press.
   ================================================================================================== */

/* ==================================================================================================
   BUILD — stroke order. A reading typed on the rule, and what that reading could be underneath it.

   The candidates are the slips read narrow: the same numbered paper, sized to a glyph rather than to
   a line of English, because eight of them have to stand in the same cell four slips stand in. */
export interface BuildProps {
  cards: { id: number; character: string; romaji: string }[]
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onSelect: (character: string) => void
}

export function RoundBuild({ cards, inputRef, value, disabled, onChange, onSelect }: BuildProps) {
  const candidates = getStrokeOrderCandidates(cards, value)
  return (
    <div className="rd-build">
      <div className="rd-type-row">
        <input
          ref={inputRef}
          className="rd-rule"
          value={value}
          placeholder="Type the reading"
          autoComplete="off"
          disabled={disabled}
          aria-label="Type the reading"
          onChange={(event) => onChange(sanitizeRomajiInput(event.target.value))}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            /* ONE CANDIDATE IS AN ANSWER, MORE THAN ONE IS A QUESTION -- the same rule the panel
               this replaces followed, and the reason the slab does not promise Enter here. */
            if (candidates.length === 1) onSelect(candidates[0].character)
          }}
        />
      </div>
      {candidates.length > 0 ? (
        <div className="rd-cands" role="group" aria-label="Kanji candidates">
          {candidates.map((card) => (
            <button
              key={card.id}
              type="button"
              className="rd-cand"
              disabled={disabled}
              onClick={() => onSelect(card.character)}
            >
              <b lang="ja" style={{ fontSize: `${candidateSize(candidates.length)}px` }}>
                {card.character}
              </b>
              <s>{card.romaji}</s>
            </button>
          ))}
        </div>
      ) : (
        <p className="rd-hollow">NOTHING MATCHES THAT READING YET</p>
      )}
    </div>
  )
}

/* ==================================================================================================
   ORDER — sentence assembly. The chunks as rows you can move, which is what the sheet's whole
   left-hand vocabulary already is.

   THE ROW IS THE HANDLE AND THE ARROWS ARE THE OTHER WAY IN. Dragging is the quick way and the
   arrows are the one that works from a keyboard; the panel this replaces had both and they are
   both kept, because a drag-only reorder is a control half the people using it cannot reach. */
interface ChunkRowProps {
  id: string
  label: string
  disabled: boolean
  position: number
  first: boolean
  last: boolean
  onEarlier: () => void
  onLater: () => void
}

function ChunkRow({ id, label, disabled, position, first, last, onEarlier, onLater }: ChunkRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, disabled,
  })
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'rd-chunk lifted' : 'rd-chunk'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="rd-grab" disabled={disabled} {...attributes} {...listeners}>
        <u aria-hidden="true">{position}</u>
        <b lang="ja">{label}</b>
      </button>
      <span className="rd-moves">
        <button
          type="button" disabled={disabled || first} onClick={onEarlier}
          aria-label={`Move ${label} earlier`}
        >↑</button>
        <button
          type="button" disabled={disabled || last} onClick={onLater}
          aria-label={`Move ${label} later`}
        >↓</button>
      </span>
    </div>
  )
}

export interface OrderProps {
  options: RoundOption[]
  disabled: boolean
  /** the order as it stands, lifted so the slab can be the thing that submits it */
  order: string[]
  onOrder: (order: string[]) => void
}

export function RoundOrder({ options, disabled, order, onOrder }: OrderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options])
  const rows = order.map((id) => byId.get(id)).filter((row): row is RoundOption => Boolean(row))
  const moved = order.join('|') !== options.map((option) => option.id).join('|')

  const move = (from: number, to: number) => {
    if (disabled || from < 0 || to < 0 || from >= order.length || to >= order.length) return
    onOrder(arrayMove(order, from, to))
  }

  return (
    <div className="rd-order">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event: DragEndEvent) => {
          if (disabled) return
          const { active, over } = event
          if (!over || active.id === over.id) return
          move(order.indexOf(String(active.id)), order.indexOf(String(over.id)))
        }}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {rows.map((row, index) => (
            <ChunkRow
              key={row.id}
              id={row.id}
              label={row.label}
              disabled={disabled}
              position={index + 1}
              first={index === 0}
              last={index === rows.length - 1}
              onEarlier={() => move(index, index - 1)}
              onLater={() => move(index, index + 1)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {rows.length === 0 ? <p className="rd-hollow">NO CHUNKS TO ORDER</p> : null}
      {/* PUT IT BACK IS ONLY OFFERED ONCE THERE IS SOMETHING TO PUT BACK. The panel this replaces
          kept a Reset button beside its Submit at all times, half of it inert; the submit is the
          slab now, and this appears when the arrangement has actually moved. */}
      {moved ? (
        <button
          type="button"
          className="rd-undo"
          disabled={disabled}
          onClick={() => onOrder(options.map((option) => option.id))}
        >
          PUT IT BACK AS DEALT
        </button>
      ) : null}
    </div>
  )
}

/* ==================================================================================================
   DRAW — handwriting. An ink square on the paper, and three plain controls under it.

   THE INK IS THE SHEET'S, NOT THE APP'S. `useHandwritingQuiz` reads its colours off the document
   root, which in this app's dark theme resolves `--text-main` to a near-white — correct on the
   panel this cell replaces and invisible on washi. The sheet passes its own three: ink for the
   character, ink for what you draw, gold for the stroke it is showing you. */
export interface DrawProps {
  character: string
  disabled: boolean
  hintUsed: boolean
  errorCopy: string
  onComplete: (outcome: HandwritingOutcome) => void
}

export function RoundDraw({ character, disabled, hintUsed, errorCopy, onComplete }: DrawProps) {
  const { targetRef, status, mistakeCount, error, retry, showAnimation, giveUp } = useHandwritingQuiz({
    character, disabled, externalHintUsed: hintUsed, onComplete,
    colors: SHEET_INK, size: SLATE,
  })
  const shut = disabled || status !== 'ready'
  return (
    <div className="rd-draw">
      <div
        ref={targetRef}
        className="rd-slate"
        role="application"
        aria-label="Handwriting canvas"
        aria-describedby="rd-draw-note"
      />
      <p className="rd-draw-note" id="rd-draw-note">
        {`ONE STROKE AT A TIME · ${HANDWRITING_MISS_THRESHOLD} MISSES SHOWS THE PATH`}
      </p>
      <p className="rd-draw-state" role="status" aria-live="polite">
        {status === 'loading' ? 'LOADING STROKE DATA…' : null}
        {status === 'ready' ? `${mistakeCount} ${mistakeCount === 1 ? 'MISTAKE' : 'MISTAKES'}` : null}
        {status === 'complete' ? 'DONE' : null}
        {status === 'error' ? (error ?? errorCopy) : null}
      </p>
      <div className="rd-marks" role="group" aria-label="Handwriting controls">
        {status === 'error' ? (
          <button type="button" onClick={retry} disabled={disabled}>RETRY</button>
        ) : (
          <>
            <button type="button" onClick={retry} disabled={shut}>START OVER</button>
            <button type="button" onClick={showAnimation} disabled={shut}>SHOW ORDER</button>
            <button type="button" className="give" onClick={giveUp} disabled={shut}>GIVE UP</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ==================================================================================================
   SPEAK — speech recall. A stamp you press, and one line saying what it is doing.

   WHAT IT HEARD IS WHAT YOU ANSWERED, so it is written on the rule the typed fill writes on rather
   than quoted inside a status message. The typed answer's escape hatch is kept: a microphone the
   machine cannot open is a dead round, and the way out has to be on the screen. */
export interface SpeakProps {
  expected: string
  disabled: boolean
  maxDurationMs?: number
  onResult: (result: { transcript: string; confidence: number; assessment: TypedAnswerState }) => void
  onFallback: () => void
}

export function RoundSpeak({
  expected, disabled, maxDurationMs = 8000, onResult, onFallback,
}: SpeakProps) {
  const [failure, setFailure] = useState<string | null>(null)
  const [heard, setHeard] = useState<string | null>(null)

  const onRecorded = useCallback(async ({ blob, mimeType }: { blob: Blob; mimeType: string }) => {
    setFailure(null)
    const transcribe = window.jplearnDesktop?.transcribeSpeech
    if (!transcribe) { setFailure('Speech recognition is unavailable in this build.'); return }
    try {
      const audioBase64 = await blobToBase64(blob)
      const result = await transcribe({
        audioBase64, mimeType: normalizeSpeechMimeType(mimeType), language: 'ja',
      })
      setHeard(result.text)
      const assessment = assessTypedAnswer(expected, result.text)
      /* a beat to read what it heard before the verdict lands on top of it */
      await new Promise((resolve) => { setTimeout(resolve, 900) })
      onResult({ transcript: result.text, confidence: result.confidence, assessment })
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }, [expected, onResult])

  const { state, errorReason, elapsedMs, start, stop } = useMicRecorder({
    maxDurationMs, onComplete: (result) => { void onRecorded(result) },
  })
  const recording = state === 'recording'
  const busy = state === 'requesting-permission' || state === 'processing'
  const left = Math.max(0, Math.ceil((maxDurationMs - elapsedMs) / 1000))

  const line = failure ? failure
    : state === 'requesting-permission' ? 'ASKING FOR THE MICROPHONE…'
      : recording ? `LISTENING · ${left}S LEFT`
        : state === 'processing' ? 'WRITING DOWN WHAT YOU SAID…'
          : state === 'error' && errorReason === 'permission' ? 'THE MICROPHONE WAS REFUSED'
            : state === 'error' && errorReason === 'no-device' ? 'NO MICROPHONE ON THIS MACHINE'
              : state === 'error' && errorReason === 'unsupported' ? 'THIS BUILD CANNOT RECORD'
                : state === 'error' ? 'THE RECORDING FAILED'
                  : 'PRESS AND SAY THE ANSWER ALOUD'
  const stuck = Boolean(failure) || state === 'error'

  return (
    <div className="rd-speak">
      <button
        type="button"
        className={recording ? 'rd-mic on' : 'rd-mic'}
        onClick={() => { if (recording) stop(); else void start() }}
        disabled={disabled || busy}
        aria-pressed={recording}
        aria-label={recording ? 'Stop recording' : 'Start recording your spoken answer'}
      >
        {recording
          ? <Square size={26} strokeWidth={2.25} aria-hidden="true" />
          : <Mic size={26} strokeWidth={2.25} aria-hidden="true" />}
        <em>{recording ? 'STOP' : 'SPEAK'}</em>
      </button>
      <p className={stuck ? 'rd-speak-line is-bad' : 'rd-speak-line'} aria-live="polite">{line}</p>
      {heard && !failure ? <p className="rd-heard" lang="ja">{heard}</p> : null}
      {stuck ? (
        <button type="button" className="rd-instead" onClick={onFallback}>
          TYPE IT INSTEAD
        </button>
      ) : null}
    </div>
  )
}
