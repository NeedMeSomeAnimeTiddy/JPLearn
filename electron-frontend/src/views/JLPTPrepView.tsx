import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle, Clock, XCircle } from 'lucide-react'
import { JLPT_MODE_META } from '../constants'

type JLPTLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1'
type JLPTExamMode = 'mock_exam' | 'diagnostic' | 'adaptive_review' | 'weak_area_drill'
type SubView = 'building' | 'exam' | 'results'

const LEVEL_LABELS: Record<JLPTLevel, string> = {
  n5: 'JLPT N5', n4: 'JLPT N4', n3: 'JLPT N3', n2: 'JLPT N2', n1: 'JLPT N1',
}

// the menu's level-three screen shows the same four; see the note in constants.tsx
const MODE_META = JLPT_MODE_META

const MOCK_EXAM_SECONDS = 30 * 60   // 30 minutes for mock exam

/* ==================================================================================================
   THIS VIEW USED TO OPEN ON A DASHBOARD, AND THE MENU ALREADY IS ONE.

   It had three sub-views: a readiness dashboard, the exam runner, and the results panel. The
   dashboard drew the five levels with their kanji and vocabulary bars and a lock line, and offered
   four modes on each -- which is, card for card, what the menu's ASCENT and EXAM LEVEL screens draw.
   Pressing "Diagnostic" on the menu's screen navigated here and showed you the same five cards
   again, with the same four buttons, and you pressed the same one a second time.

   So the dashboard is gone and the entry point moved: this view is now only the two things the menu
   has no answer for -- running an exam and reporting it -- and it is entered with the level and the
   mode already decided. There is no way in that does not name both.
   ================================================================================================== */
interface JLPTPrepViewProps {
  /** which ladder rung the menu was standing on when it started this */
  level: JLPTLevel
  /** which of the four the menu pressed */
  mode: JLPTExamMode
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Exam runner sub-component
// ---------------------------------------------------------------------------

interface ExamQuestion {
  card_id: number
  deck: string
  question_type: string
  level: JLPTLevel
  card: { id: number; character: string; romaji: string; meaning: string; tags: string[]; example_sentence: string | null }
  distractor_meanings: string[]
  distractor_card_ids: number[]
}

interface ExamRunnerProps {
  level: JLPTLevel
  mode: JLPTExamMode
  questions: ExamQuestion[]
  onComplete: (correct: number, total: number) => void
  onAbort: () => void
}

function buildChoices(question: ExamQuestion): string[] {
  const choices = [question.card.meaning, ...question.distractor_meanings.slice(0, 3)]
  // Deterministic sort so correct answer isn't always first: sort by meaning string
  return [...choices].sort()
}

function ExamRunner({ mode, questions, onComplete, onAbort }: ExamRunnerProps) {
  const isMock = mode === 'mock_exam'
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(isMock ? MOCK_EXAM_SECONDS : null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isMock || timeLeft === null) return
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t === null || t <= 1) {
          clearInterval(timerRef.current!)
          onComplete(correct, questions.length)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMock])

  const question = questions[index]
  if (!question) return null

  const choices = buildChoices(question)
  const isLastQuestion = index === questions.length - 1

  function handleChoice(choice: string) {
    if (revealed) return
    setSelected(choice)
    setRevealed(true)
    const isCorrect = choice === question.card.meaning
    const newCorrect = isCorrect ? correct + 1 : correct

    // Record result via SRS (fire-and-forget — exam scoring is independent of SRS)
    void window.jplearnDesktop.recordGameResult?.({
      slug: question.deck as Parameters<typeof window.jplearnDesktop.recordGameResult>[0]['slug'],
      cardId: question.card_id,
      isCorrect,
      minigame: 'meaning_match',
    }).catch(() => undefined)

    setTimeout(() => {
      if (isLastQuestion) {
        if (timerRef.current) clearInterval(timerRef.current)
        onComplete(newCorrect, questions.length)
      } else {
        setIndex((i) => i + 1)
        setSelected(null)
        setRevealed(false)
        setCorrect(newCorrect)
      }
    }, 800)
  }

  const minutes = timeLeft !== null ? Math.floor(timeLeft / 60) : null
  const seconds = timeLeft !== null ? timeLeft % 60 : null

  return (
    /* CENTRED, LIKE EVERY OTHER SHORT PANEL IN THIS VIEW. A twenty-question diagnostic is a card and
       four buttons -- about 350px of a 985px box -- and top-aligned it read as the top of a page
       that had not finished loading. `view-center` is the same opt-in the level ladder uses. */
    <div className="view-shell view-center">
      <div className="jlpt-exam-runner">
      <div className="jlpt-exam-header">
        <button type="button" className="jlpt-back-btn" onClick={onAbort} aria-label="Abort exam">
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" /> Abort
        </button>
        <span className="jlpt-question-counter">{index + 1} / {questions.length}</span>
        {isMock && minutes !== null && seconds !== null ? (
          <span className={`jlpt-timer ${timeLeft! < 60 ? 'is-urgent' : ''}`}>
            <Clock size={14} strokeWidth={2.2} aria-hidden="true" />
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        ) : (
          <span className="jlpt-mode-label">{MODE_META[mode].label}</span>
        )}
      </div>

      {isMock && timeLeft !== null ? (
        <div
          className="jlpt-timer-bar"
          role="progressbar"
          aria-valuenow={timeLeft}
          aria-valuemin={0}
          aria-valuemax={MOCK_EXAM_SECONDS}
        >
          <div className="jlpt-timer-fill" style={{ width: `${(timeLeft / MOCK_EXAM_SECONDS) * 100}%` }} />
        </div>
      ) : null}

      <div className="jlpt-exam-card">
        <div className="jlpt-card-level-tag">{LEVEL_LABELS[question.level]}</div>
        <div className="jlpt-card-character">{question.card.character}</div>
        <div className="jlpt-card-romaji">{question.card.romaji}</div>
      </div>

      <div className="jlpt-choices" role="group" aria-label="Answer choices">
        {choices.map((choice) => {
          const isThis = selected === choice
          const isCorrectChoice = choice === question.card.meaning
          let choiceClass = 'jlpt-choice'
          if (revealed) {
            if (isCorrectChoice) choiceClass += ' is-correct'
            else if (isThis) choiceClass += ' is-wrong'
            else choiceClass += ' is-dim'
          }
          return (
            <button
              key={choice}
              type="button"
              className={choiceClass}
              onClick={() => handleChoice(choice)}
              disabled={revealed}
            >
              {choice}
            </button>
          )
        })}
      </div>

      {revealed && question.card.example_sentence ? (
        <div className="jlpt-example-sentence">{question.card.example_sentence}</div>
      ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results sub-component
// ---------------------------------------------------------------------------

interface ResultsProps {
  level: JLPTLevel
  mode: JLPTExamMode
  correct: number
  total: number
  projectedScore: number | null
  readiness: JLPTLevelReadinessData | null
  onRetry: () => void
  onDrillWeakAreas: () => void
  onBack: () => void
}

interface JLPTLevelReadinessData {
  readiness_pct: number
  is_ready: boolean
  vocab_grammar_section_max: number
  vocab_grammar_pass_mark: number
  pass_mark: number
}

function ResultsPanel({ level, mode, correct, total, projectedScore, readiness, onRetry, onDrillWeakAreas, onBack }: ResultsProps) {
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
  const sectionMax = readiness?.vocab_grammar_section_max ?? null
  const sectionPassMark = readiness?.vocab_grammar_pass_mark ?? null
  const sectionPasses = projectedScore !== null && sectionPassMark !== null ? projectedScore >= sectionPassMark : null

  return (
    <div className="view-shell view-center">
      <div className="jlpt-results-panel">
      <header className="jlpt-results-header">
        <button type="button" className="jlpt-back-btn" onClick={onBack} aria-label="Back to JLPT Prep">
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" /> JLPT Prep
        </button>
        <h2 className="jlpt-results-title">{LEVEL_LABELS[level]} — {MODE_META[mode].label}</h2>
      </header>

      <div className="jlpt-results-stats">
        <div className="jlpt-stat-chip">
          <span className="jlpt-stat-value">{correct}/{total}</span>
          <span className="jlpt-stat-label">Correct</span>
        </div>
        <div className="jlpt-stat-chip">
          <span className="jlpt-stat-value">{accuracy}%</span>
          <span className="jlpt-stat-label">Accuracy</span>
        </div>
      </div>

      {mode === 'mock_exam' && projectedScore !== null && sectionMax !== null ? (
        <div className={`jlpt-score-section ${sectionPasses ? 'is-pass' : 'is-fail'}`}>
          <div className="jlpt-score-label">Language Knowledge (Vocab) Projected Score</div>
          <div className="jlpt-score-value">{projectedScore} / {sectionMax}</div>
          <div className="jlpt-score-passmark">
            {sectionPasses
              ? <><CheckCircle size={14} aria-hidden="true" /> Clears sectional pass mark ({sectionPassMark})</>
              : <><XCircle size={14} aria-hidden="true" /> Below sectional pass mark ({sectionPassMark})</>
            }
          </div>
          <div className="jlpt-score-listening">
            Listening: <em>N/A — not assessed in this app</em>
          </div>
          <div className="jlpt-score-note">
            Projection is vocab/kanji only and does not reflect actual JLPT performance.
          </div>
        </div>
      ) : null}

      {mode === 'diagnostic' ? (
        <div className="jlpt-diagnostic-note">
          Based on your answers, continue studying{' '}
          <strong>{LEVEL_LABELS[level]}</strong> before moving up.
        </div>
      ) : null}

      <div className="jlpt-results-actions">
        <button type="button" className="jlpt-action-btn jlpt-action-primary" onClick={onRetry}>
          Try Again
        </button>
        {mode !== 'weak_area_drill' ? (
          <button type="button" className="jlpt-action-btn" onClick={onDrillWeakAreas}>
            Drill Weak Areas
          </button>
        ) : null}
        <button type="button" className="jlpt-action-btn" onClick={onBack}>
          Back to JLPT Prep
        </button>
      </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function JLPTPrepView({ level: startLevel, mode: startMode, onBack }: JLPTPrepViewProps) {
  const [subView, setSubView] = useState<SubView>('building')
  const [readiness, setReadiness] = useState<JLPTReadinessPayload | null>(null)
  const [readinessError, setReadinessError] = useState<string | null>(null)

  const [activeLevel, setActiveLevel] = useState<JLPTLevel>(startLevel)
  const [activeMode, setActiveMode] = useState<JLPTExamMode>(startMode)
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [examLoading, setExamLoading] = useState(false)
  const [examError, setExamError] = useState<string | null>(null)

  const [lastCorrect, setLastCorrect] = useState(0)
  const [lastTotal, setLastTotal] = useState(0)
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

  const startExam = useCallback(async (level: JLPTLevel, mode: JLPTExamMode) => {
    setActiveLevel(level)
    setActiveMode(mode)
    setExamLoading(true)
    setExamError(null)
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

  const handleExamComplete = useCallback(async (correct: number, total: number) => {
    setLastCorrect(correct)
    setLastTotal(total)

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
        correct={lastCorrect}
        total={lastTotal}
        projectedScore={lastProjectedScore}
        readiness={readiness?.levels[activeLevel] ?? null}
        onRetry={handleRetry}
        onDrillWeakAreas={handleDrillWeakAreas}
        onBack={onBack}
      />
    )
  }

  /* NOT A SCREEN, A WAIT. Building a queue takes one bridge round trip, and the only other thing
     that can happen is that the level has too few cards to ask thirty questions about -- which is
     a sentence, not a dashboard. Either way there is one way out and it goes back to the menu. */
  return (
    <div className="view-shell view-center">
      <section className="jlpt-prep-view panel-glass">
        <header className="jlpt-prep-header">
          <button type="button" className="jlpt-back-btn" onClick={onBack} aria-label="Back to the exam ladder">
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" /> Back
          </button>
          <div className="jlpt-prep-title-row">
            <h1 className="jlpt-prep-title">{LEVEL_LABELS[activeLevel]}</h1>
            <span className="jlpt-prep-subtitle">{MODE_META[activeMode]?.label ?? activeMode}</span>
          </div>
        </header>

        {examError ? <div className="jlpt-error-banner" role="alert">{examError}</div> : null}
        {readinessError ? <div className="jlpt-error-banner" role="alert">{readinessError}</div> : null}
        {!examError && !readinessError ? (
          <p className="jlpt-building" aria-live="polite">
            {examLoading ? 'Building your questions…' : 'Ready.'}
          </p>
        ) : null}
      </section>
    </div>
  )
}
