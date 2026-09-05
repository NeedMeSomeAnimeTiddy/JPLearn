import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EXAM_MODES, screenHead, unscored } from '../features/menu'
import { Round, RoundAsk, RoundSlips, RoundWork, promptSize } from '../features/round'
import type { RunChip } from '../features/round'
import { JLPT_LEVEL_LABELS } from '../constants'
import type { JlptExamMode, JlptLevel, RoundOption } from '../types'

/* ==================================================================================================
   THE EXAM RUN — the second of the six screens past level three, and the second onto the SHEET.

   IT WAS THE LAST DARK PANEL YOU COULD REACH FROM THE LADDER. You walked the valley, climbed the
   ascent, picked a level and pressed one of four modes on a paper card — and then the app handed you
   a rounded, sepia, phone-scale exam with a green progress bar in it. The seam was one press wide.

   ONE OBJECT, SIX FILLS, AND THIS IS THE THIRD ONE BUILT. `design-system/components/past-three.html`
   draws a drill, a crossword, an exam question, a passage, settings and the key sheet on the same
   washi plate; the round built the shell (`features/round/Round.tsx`) and this reuses it whole. The
   prompt cell asks, the work cell holds four slips, the slab is bled to the sheet's own floor and
   the foot band carries the whole paper as a tick per question. Nothing here is a new layout — the
   only thing this file decides is which words go in which slot.

   WHAT THE MOCKUP HAS THAT THE APP DOES NOT. The design draws a grammar cloze — a sentence with a
   hole in it, four particles, three sections and a mark-for-review key — and widens the prompt cell
   to 392 for the stem, which the card calls "the only dimension any of these six change". This app's
   exam asks one question type: what does this character mean, out of four. That is a SPECIMEN, not a
   stem, so the cell stays at 322 and the widening waits for the question type that needs it. Drawing
   sections and a mark key over data that does not exist would be a mockup, not a screen.

   THE COUNTDOWN IS THE ONLY VERMILION IN THE CROWN, which is the design card's own rule and the
   reason it is stated there: on every other screen in this app vermilion is what you owe, and a
   clock running out is the only fact any of these six screens carries that is against you.
   ================================================================================================== */

type SubView = 'building' | 'exam' | 'results'

const MOCK_EXAM_SECONDS = 30 * 60

/** how long the slips hold the verdict before the next question is dealt */
const REVEAL_MS = 800

/* the ladder's own words for the four modes — the English name, the Japanese mark it wears on the
   card you pressed, and what it is FOR. Reusing them is what makes the two screens one place. */
const MODES = new Map(EXAM_MODES.map((mode) => [mode.key, mode]))

function examHead(mode: JlptExamMode) {
  const meta = MODES.get(mode)
  return screenHead('JLPT', 'level', {
    en: (meta?.label ?? 'EXAM').toUpperCase(),
    jp: meta?.mark ?? '検定',
  })
}

/** mm:ss, and the chip that prints it sets tabular figures so a second does not move the crown */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface ExamQuestion {
  card_id: number
  deck: string
  question_type: string
  level: JlptLevel
  card: {
    id: number; character: string; romaji: string; meaning: string
    tags: string[]; example_sentence: string | null
  }
  distractor_meanings: string[]
  distractor_card_ids: number[]
}

interface JLPTLevelReadinessData {
  readiness_pct: number
  is_ready: boolean
  vocab_grammar_section_max: number
  vocab_grammar_pass_mark: number
  pass_mark: number
}

/* THE ORDER IS THE ALPHABET'S, not the deck's, which is how the answer stops being first every
   time. Ids carry the index because two cards in a level may share a meaning and a duplicate key
   would collapse two slips into one. */
function buildChoices(question: ExamQuestion): RoundOption[] {
  const labels = [question.card.meaning, ...question.distractor_meanings.slice(0, 3)]
  return [...labels].sort().map((label, index) => ({ id: `${index}-${label}`, label }))
}

// ---------------------------------------------------------------------------
// The paper itself
// ---------------------------------------------------------------------------

interface ExamRunnerProps {
  level: JlptLevel
  mode: JlptExamMode
  questions: ExamQuestion[]
  /** every answer in order, right or wrong — the results panel draws the same strip from it */
  onComplete: (trail: boolean[]) => void
  onAbort: () => void
}

function ExamRunner({ level, mode, questions, onComplete, onAbort }: ExamRunnerProps) {
  const isMock = mode === 'mock_exam'
  const [index, setIndex] = useState(0)
  const [trail, setTrail] = useState<boolean[]>([])
  const [chose, setChose] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(isMock ? MOCK_EXAM_SECONDS : null)

  const total = questions.length
  const question = questions[index]
  const revealed = chose !== null
  const choices = useMemo(() => (question ? buildChoices(question) : []), [question])

  /* WHAT THE CLOCK REPORTS WHEN IT RUNS OUT. The old interval closed over `correct` at mount and
     handed that to `onComplete`, so a mock exam that timed out was scored zero however many you
     had got right. A ref reads the answers as they stand rather than as they were. */
  const finish = useRef<(trail: boolean[]) => void>(onComplete)
  finish.current = onComplete
  const trailRef = useRef(trail)
  trailRef.current = trail

  useEffect(() => {
    if (!isMock) return
    const id = setInterval(() => setTimeLeft((t) => (t === null ? null : Math.max(0, t - 1))), 1000)
    return () => clearInterval(id)
  }, [isMock])

  useEffect(() => {
    if (timeLeft === 0) finish.current(trailRef.current)
  }, [timeLeft])

  /* the reveal's timer, held so that abandoning a paper mid-verdict does not set state on a
     component that has left */
  const dealt = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (dealt.current) clearTimeout(dealt.current) }, [])

  const answer = useCallback((label: string) => {
    if (chose !== null || !question) return
    const right = label === question.card.meaning
    const next = [...trail, right]
    setChose(label)
    setTrail(next)

    /* exam scoring is its own thing, but an answer is still a review — fire and forget, the way
       it always has been */
    void window.jplearnDesktop.recordGameResult?.({
      slug: question.deck as Parameters<typeof window.jplearnDesktop.recordGameResult>[0]['slug'],
      cardId: question.card_id,
      isCorrect: right,
      minigame: 'meaning_match',
    }).catch(() => undefined)

    dealt.current = setTimeout(() => {
      if (next.length >= total) { finish.current(next); return }
      setIndex((i) => i + 1)
      setChose(null)
      setActive(0)
    }, REVEAL_MS)
  }, [chose, question, trail, total])

  /* 1–4 ANSWERS AND ESCAPE ABANDONS, which is what the hint row has always said and what nothing
     was listening for: the old runner drew the numbers on the buttons and bound no keys at all. */
  const answerRef = useRef(answer)
  answerRef.current = answer
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onAbort(); return }
      const picked = Number(event.key)
      if (!Number.isInteger(picked) || picked < 1 || picked > choices.length) return
      event.preventDefault()
      answerRef.current(choices[picked - 1].label)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choices, onAbort])

  if (!question) return null

  const meta = MODES.get(mode)
  const chips: RunChip[] = [
    {
      key: 'q',
      value: String(index + 1).padStart(2, '0'),
      of: `/ ${total}`,
      label: 'QUESTION',
    },
  ]
  if (timeLeft !== null) {
    chips.push({ key: 'clock', value: clock(timeLeft), label: 'LEFT', duty: true })
  }

  const last = trail.length >= total

  return (
    <Round
      head={examHead(mode)}
      cap={`${meta?.purpose ?? 'THE EXAM'} · ${total} QUESTIONS`}
      run={chips}
      said={revealed}
      foot={{
        at: trail.length,
        target: total,
        trail,
        note: JLPT_LEVEL_LABELS[level].toUpperCase(),
      }}
      onBack={onAbort}
      backLabel="Abandon"
      backJp="中止"
      backAria="Abort exam"
      hints={[
        { cap: '1–4', en: 'Answer', jp: '回答' },
        { cap: 'ESC', en: 'Abandon', jp: '中止' },
      ]}
      ask={
        <RoundAsk
          kick={`QUESTION ${String(index + 1).padStart(2, '0')}`}
          kickJp="問題"
          size={promptSize(question.card.character)}
          src={{ label: 'READING', value: question.card.romaji }}
        >
          <span lang="ja">{question.card.character}</span>
        </RoundAsk>
      }
      work={
        <RoundWork
          kick="WHAT DOES IT MEAN"
          kickJp="四択"
          slab={
            revealed
              ? { text: last ? 'SCORING THE PAPER' : 'NEXT QUESTION', jp: last ? '採点' : '次へ', tone: 'calm' }
              : { text: '1–4 TO ANSWER', jp: '回答' }
          }
        >
          <RoundSlips
            options={choices}
            activeIndex={active}
            disabled={revealed}
            answer={revealed ? question.card.meaning : null}
            chose={chose}
            onActiveIndexChange={setActive}
            onSelect={answer}
          />
        </RoundWork>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// What the paper came to
// ---------------------------------------------------------------------------

interface ResultsProps {
  level: JlptLevel
  mode: JlptExamMode
  trail: boolean[]
  projectedScore: number | null
  readiness: JLPTLevelReadinessData | null
  onRetry: () => void
  onDrillWeakAreas: () => void
  onBack: () => void
}

function ResultsPanel({
  level, mode, trail, projectedScore, readiness, onRetry, onDrillWeakAreas, onBack,
}: ResultsProps) {
  const total = trail.length
  const correct = trail.filter(Boolean).length
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
  const meta = MODES.get(mode)

  /* THE SECTIONAL GATE, IN THE WORDS THE LADDER ALREADY USES. The JLPT does not add the papers up:
     vocabulary-and-grammar is a separate pass mark, and this app can only ever project that one
     section — `unscored()` is the same function the EXAM LEVEL screen prints its hatched line from.
     The old panel said "Listening: N/A — not assessed in this app" and left the number it could not
     speak for unexplained. */
  const sectionMax = readiness?.vocab_grammar_section_max ?? null
  const passMark = readiness?.vocab_grammar_pass_mark ?? null
  const projected = mode === 'mock_exam' ? projectedScore : null
  const short = projected !== null && passMark !== null && projected < passMark
  const gap = sectionMax !== null ? unscored(sectionMax) : null

  /* THE ONE SENTENCE THE FIGURES CANNOT SAY. A diagnostic's whole output is advice, and a mock's
     projection is only worth reading next to what it does not cover. Everything else on this cell
     is a number with a label, which is what a ledger row is for. */
  const note = mode === 'diagnostic'
    ? `KEEP WORKING AT ${JLPT_LEVEL_LABELS[level].toUpperCase()} BEFORE MOVING UP.`
    : projected !== null ? 'THE PROJECTION IS VOCABULARY AND KANJI ONLY.' : null

  return (
    <Round
      head={examHead(mode)}
      cap={`${JLPT_LEVEL_LABELS[level].toUpperCase()} · ${meta?.label.toUpperCase() ?? 'EXAM'}`}
      /* NO CHIPS, BECAUSE THE PAPER IS OVER. The crown's chips are a running paper's live state --
         which question, how long is left -- and the two facts that would survive it are the per-cent
         and the fraction, which are the two biggest things on the sheet a hand's width below. */
      run={[]}
      foot={{ at: total, target: total, trail, note: 'PAPER COMPLETE' }}
      onBack={onBack}
      backLabel="Back"
      backJp="戻る"
      backAria="Back to the exam ladder"
      hints={[{ cap: 'ESC', en: 'Back', jp: '戻る' }]}
      ask={
        <div className="rd-ask">
          <div className="rd-kick"><span>HOW IT WENT</span><em>結果</em></div>
          <div className="rd-score">
            <b>{accuracy}<sup>%</sup></b>
            <i>{correct} OF {total} RIGHT</i>
          </div>
          <div className="rd-src">
            {projected !== null && sectionMax !== null
              ? <>PROJECTED <i>{projected} / {sectionMax}</i></>
              : <>LEVEL <i>{JLPT_LEVEL_LABELS[level]}</i></>}
          </div>
        </div>
      }
      work={
        /* NOT `RoundWork`: the two actions ARE the slab here, side by side and bled to the same
           floor, so there is no single slab for it to draw. The round's own report cell hand-writes
           the cell for the same reason. */
        <div className="rd-work">
          <div className="rd-kick"><span>THE PAPER</span><em>記録</em></div>
          {note ? <p className="rd-note">{note}</p> : null}
          <div className="rd-body">
            <div className="rd-tally">
              <div className="rd-tally-row">Answered right<s>OF {total}</s><b>{correct}</b></div>
              <div className="rd-tally-row">Missed<s /><b>{total - correct}</b></div>
              {projected !== null && sectionMax !== null ? (
                <div className={short ? 'rd-tally-row is-short' : 'rd-tally-row'}>
                  Section score<s>OF {sectionMax}</s><b>{projected}</b>
                </div>
              ) : null}
              {projected !== null && passMark !== null ? (
                <div className="rd-tally-row">
                  Sectional pass mark<s>{short ? 'SHORT BY ' + (passMark - projected) : 'CLEARED'}</s>
                  <b>{passMark}</b>
                </div>
              ) : null}
              {projected !== null && gap ? (
                <div className="rd-tally-row">Not scored here<s>{gap.papers}</s><b>{gap.points}</b></div>
              ) : null}
            </div>
            <div className="rd-acts">
              <button type="button" className="rd-slab go" onClick={onRetry}>
                SIT IT AGAIN<em>再開</em>
              </button>
              {mode !== 'weak_area_drill' ? (
                <button type="button" className="rd-slab calm go" onClick={onDrillWeakAreas}>
                  DRILL THE WEAK AREAS<em>弱点</em>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

interface JLPTPrepViewProps {
  /** which ladder rung the menu was standing on when it started this */
  level: JlptLevel
  /** which of the four the menu pressed */
  mode: JlptExamMode
  onBack: () => void
}

export function JLPTPrepView({ level: startLevel, mode: startMode, onBack }: JLPTPrepViewProps) {
  const [subView, setSubView] = useState<SubView>('building')
  const [readiness, setReadiness] = useState<JLPTReadinessPayload | null>(null)
  const [readinessError, setReadinessError] = useState<string | null>(null)

  const [activeLevel, setActiveLevel] = useState<JlptLevel>(startLevel)
  const [activeMode, setActiveMode] = useState<JlptExamMode>(startMode)
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [examLoading, setExamLoading] = useState(false)
  const [examError, setExamError] = useState<string | null>(null)

  const [lastTrail, setLastTrail] = useState<boolean[]>([])
  const [lastProjectedScore, setLastProjectedScore] = useState<number | null>(null)

  type JLPTReadinessPayload = NonNullable<Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getJLPTReadiness>>>>

  const loadReadiness = useCallback(async () => {
    setReadinessError(null)
    try {
      const data = await window.jplearnDesktop.getJLPTReadiness?.()
      if (data) setReadiness(data)
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'Failed to load readiness data')
    }
  }, [])

  useEffect(() => {
    void loadReadiness()
  }, [loadReadiness])

  const startExam = useCallback(async (level: JlptLevel, mode: JlptExamMode) => {
    setActiveLevel(level)
    setActiveMode(mode)
    setExamLoading(true)
    setExamError(null)
    setSubView('building')
    try {
      const count = mode === 'diagnostic' ? 20 : 30
      const data = await window.jplearnDesktop.buildJLPTExamQueue?.(level, mode, count)
      if (!data || data.questions.length === 0) {
        setExamError('No questions available for this level. Add more cards first.')
        setExamLoading(false)
        return
      }
      setExamQuestions(data.questions as ExamQuestion[])
      setSubView('exam')
    } catch (err) {
      setExamError(err instanceof Error ? err.message : 'Failed to load exam questions')
    } finally {
      setExamLoading(false)
    }
  }, [])

  const handleExamComplete = useCallback(async (trail: boolean[]) => {
    const total = trail.length
    const correct = trail.filter(Boolean).length
    setLastTrail(trail)

    let projected: number | null = null
    if (activeMode === 'mock_exam' && total > 0) {
      const levelData = readiness?.levels[activeLevel]
      if (levelData) {
        projected = Math.round((correct / total) * levelData.vocab_grammar_section_max)
      }
    }
    setLastProjectedScore(projected)

    const accuracy = total > 0 ? correct / total : 0
    try {
      await window.jplearnDesktop.saveJLPTExamResult?.({
        level: activeLevel,
        mode: activeMode,
        questionsAnswered: total,
        correct,
        accuracy,
        projectedScore: projected,
      })
    } catch {
      // non-critical
    }

    setSubView('results')
  }, [activeLevel, activeMode, readiness])

  /* THE EXAM IS BUILT ON ARRIVAL, because the choosing already happened on the screen that sent
     you here. `startedRef` rather than a dependency list: `startExam` is stable, but a retry
     changes `activeLevel`/`activeMode` and this must not fire a second time when it does. */
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void startExam(startLevel, startMode)
  }, [startExam, startLevel, startMode])

  const handleRetry = useCallback(() => {
    void startExam(activeLevel, activeMode)
  }, [startExam, activeLevel, activeMode])

  const handleDrillWeakAreas = useCallback(() => {
    void startExam(activeLevel, 'weak_area_drill')
  }, [startExam, activeLevel])

  if (subView === 'exam' && examQuestions.length > 0) {
    return (
      <ExamRunner
        level={activeLevel}
        mode={activeMode}
        questions={examQuestions}
        onComplete={handleExamComplete}
        onAbort={onBack}
      />
    )
  }

  if (subView === 'results') {
    return (
      <ResultsPanel
        level={activeLevel}
        mode={activeMode}
        trail={lastTrail}
        projectedScore={lastProjectedScore}
        readiness={readiness?.levels[activeLevel] ?? null}
        onRetry={handleRetry}
        onDrillWeakAreas={handleDrillWeakAreas}
        onBack={onBack}
      />
    )
  }

  /* NOT A SCREEN, A WAIT — and it is the same sheet, because a screen that changes shape between
     its own states is two screens sharing a route. Building a queue takes one bridge round trip,
     and the only other thing that can happen is that the level has too few cards to ask thirty
     questions about, which is a sentence. Either way there is one way out and it is the ladder. */
  const meta = MODES.get(activeMode)
  const expected = activeMode === 'diagnostic' ? 20 : 30
  const failed = examError !== null

  return (
    <Round
      head={examHead(activeMode)}
      cap={`${JLPT_LEVEL_LABELS[activeLevel].toUpperCase()} · ${meta?.purpose ?? 'THE EXAM'}`}
      run={[{ key: 'q', value: '00', of: `/ ${expected}`, label: 'QUESTION' }]}
      foot={{ at: 0, target: expected, trail: [], note: 'NOT STARTED' }}
      onBack={onBack}
      backLabel="Back"
      backJp="戻る"
      backAria="Back to the exam ladder"
      hints={[{ cap: 'ESC', en: 'Back', jp: '戻る' }]}
      ask={
        <RoundAsk
          kick={failed ? 'NO PAPER' : 'ONE MOMENT'}
          kickJp="準備"
          size={132}
          src={{ label: 'LEVEL', value: JLPT_LEVEL_LABELS[activeLevel] }}
        >
          <span lang="ja">{failed ? '無' : '試'}</span>
        </RoundAsk>
      }
      work={
        <RoundWork
          kick="THE PAPER"
          kickJp="演習"
          slab={
            failed
              ? { text: 'BACK TO THE LADDER', jp: '戻る', tone: 'calm', onClick: onBack }
              : { text: 'BUILDING', jp: '準備', tone: 'calm' }
          }
        >
          <div className="rd-plain">
            <h2>{meta?.label ?? 'Exam'}</h2>
            {examError ? <p className="rd-err" role="alert">{examError}</p> : null}
            {readinessError ? <p className="rd-err" role="alert">{readinessError}</p> : null}
            {!examError ? (
              <p aria-live="polite">
                {examLoading ? 'Building your questions…' : 'Ready.'}
              </p>
            ) : null}
          </div>
        </RoundWork>
      }
    />
  )
}
