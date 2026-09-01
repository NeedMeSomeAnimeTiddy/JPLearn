import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle, Clock, Lock, Target, XCircle } from 'lucide-react'
import { JLPT_UNLOCK_PCT } from '../constants'

type JLPTLevel = 'n5' | 'n4' | 'n3' | 'n2' | 'n1'
type JLPTExamMode = 'mock_exam' | 'diagnostic' | 'adaptive_review' | 'weak_area_drill'
type SubView = 'dashboard' | 'exam' | 'results'

const LEVEL_LABELS: Record<JLPTLevel, string> = {
  n5: 'JLPT N5', n4: 'JLPT N4', n3: 'JLPT N3', n2: 'JLPT N2', n1: 'JLPT N1',
}
const LEVEL_ORDER: JLPTLevel[] = ['n5', 'n4', 'n3', 'n2', 'n1']

const MODE_META: Record<JLPTExamMode, { label: string; description: string }> = {
  diagnostic:      { label: 'Diagnostic',     description: 'Identifies your target level (20 questions across all levels)' },
  mock_exam:       { label: 'Mock Exam',       description: 'Timed single-level exam with projected score' },
  adaptive_review: { label: 'Adaptive Review', description: 'SRS-due cards for this level' },
  weak_area_drill: { label: 'Weak Areas',      description: 'Leeches and lowest-accuracy cards first' },
}

const MOCK_EXAM_SECONDS = 30 * 60   // 30 minutes for mock exam
// % readiness on the previous level required to unlock the next. Shared with the menu's ascent,
// which draws this same gate as a line across all five levels — see the note in constants.tsx.
const JLPT_UNLOCK_THRESHOLD = JLPT_UNLOCK_PCT

interface JLPTPrepViewProps {
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
  )
}

// ---------------------------------------------------------------------------
// Readiness card sub-component
// ---------------------------------------------------------------------------

interface ReadinessCardProps {
  level: JLPTLevel
  data: JLPTLevelReadinessData & { mastered_vocab: number; total_vocab: number; mastered_kanji: number; total_kanji: number }
  onStartMode: (level: JLPTLevel, mode: JLPTExamMode) => void
  loading: boolean
  isLocked: boolean
  lockHint: string
}

function ReadinessCard({ level, data, onStartMode, loading, isLocked, lockHint }: ReadinessCardProps) {
  const totalCards = data.total_vocab + data.total_kanji
  const kanjiPct = data.total_kanji > 0 ? Math.round((data.mastered_kanji / data.total_kanji) * 100) : null
  const vocabPct = data.total_vocab > 0 ? Math.round((data.mastered_vocab / data.total_vocab) * 100) : null

  return (
    <div className={`jlpt-readiness-card${data.is_ready && !isLocked ? ' is-ready' : ''}${isLocked ? ' is-locked' : ''}`}>
      <div className="jlpt-readiness-card-header">
        <span className="jlpt-readiness-level">{LEVEL_LABELS[level]}</span>
        {isLocked ? (
          <span className="jlpt-locked-badge"><Lock size={12} aria-hidden="true" /> Locked</span>
        ) : data.is_ready ? (
          <span className="jlpt-ready-badge"><CheckCircle size={12} aria-hidden="true" /> Ready</span>
        ) : null}
      </div>

      <div
        className="jlpt-readiness-bar"
        role="progressbar"
        aria-valuenow={data.readiness_pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${data.readiness_pct}% mastered`}
      >
        <div className="jlpt-readiness-fill" style={{ width: `${data.readiness_pct}%` }} />
      </div>

      <div className="jlpt-level-breakdown">
        <div className="jlpt-breakdown-row">
          <span className="jlpt-breakdown-label">Kanji</span>
          <div
            className="jlpt-breakdown-bar"
            role="progressbar"
            aria-valuenow={kanjiPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${kanjiPct ?? 0}% kanji mastered`}
          >
            <div className="jlpt-breakdown-fill" style={{ width: `${kanjiPct ?? 0}%` }} />
          </div>
          <span className="jlpt-breakdown-count">
            {kanjiPct !== null ? `${kanjiPct}%` : '—'} · {data.mastered_kanji}/{data.total_kanji > 0 ? data.total_kanji : '—'}
          </span>
        </div>
        <div className="jlpt-breakdown-row">
          <span className="jlpt-breakdown-label">Vocab</span>
          <div
            className="jlpt-breakdown-bar"
            role="progressbar"
            aria-valuenow={vocabPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${vocabPct ?? 0}% vocabulary mastered`}
          >
            <div className="jlpt-breakdown-fill" style={{ width: `${vocabPct ?? 0}%` }} />
          </div>
          <span className="jlpt-breakdown-count">
            {vocabPct !== null ? `${vocabPct}%` : '—'} · {data.mastered_vocab}/{data.total_vocab > 0 ? data.total_vocab : '—'}
          </span>
        </div>
      </div>

      {isLocked ? (
        <div className="jlpt-card-lock-notice" aria-label={lockHint}>
          <Lock size={13} strokeWidth={2.2} aria-hidden="true" />
          <span>{lockHint}</span>
        </div>
      ) : (
        <div className="jlpt-mode-buttons" role="group" aria-label={`Start ${LEVEL_LABELS[level]} session`}>
          {(['diagnostic', 'mock_exam', 'adaptive_review', 'weak_area_drill'] as JLPTExamMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className="jlpt-mode-btn"
              onClick={() => onStartMode(level, mode)}
              disabled={loading || totalCards === 0}
              title={MODE_META[mode].description}
            >
              {MODE_META[mode].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function JLPTPrepView({ onBack }: JLPTPrepViewProps) {
  const [subView, setSubView] = useState<SubView>('dashboard')
  const [readiness, setReadiness] = useState<JLPTReadinessPayload | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(true)
  const [readinessError, setReadinessError] = useState<string | null>(null)

  const [activeLevel, setActiveLevel] = useState<JLPTLevel>('n5')
  const [activeMode, setActiveMode] = useState<JLPTExamMode>('mock_exam')
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [examLoading, setExamLoading] = useState(false)
  const [examError, setExamError] = useState<string | null>(null)

  const [lastCorrect, setLastCorrect] = useState(0)
  const [lastTotal, setLastTotal] = useState(0)
  const [lastProjectedScore, setLastProjectedScore] = useState<number | null>(null)

  const [history, setHistory] = useState<JLPTExamResultRecord[]>([])

  type JLPTReadinessPayload = NonNullable<Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getJLPTReadiness>>>>
  type JLPTExamResultRecord = NonNullable<Awaited<ReturnType<NonNullable<typeof window.jplearnDesktop.getJLPTExamHistory>>>>['results'][number]

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true)
    setReadinessError(null)
    try {
      const data = await window.jplearnDesktop.getJLPTReadiness?.()
      if (data) setReadiness(data)
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'Failed to load readiness data')
    } finally {
      setReadinessLoading(false)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const data = await window.jplearnDesktop.getJLPTExamHistory?.()
      if (data) setHistory(data.results)
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    void loadReadiness()
    void loadHistory()
  }, [loadReadiness, loadHistory])

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
      void loadHistory()
    } catch {
      // non-critical
    }

    setSubView('results')
  }, [activeLevel, activeMode, readiness, loadHistory])

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
        onAbort={() => setSubView('dashboard')}
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
        onBack={() => {
          setSubView('dashboard')
          void loadReadiness()
        }}
      />
    )
  }

  return (
    <div className="view-shell">
      <section className="jlpt-prep-view panel-glass">
      <header className="jlpt-prep-header">
        <button type="button" className="jlpt-back-btn" onClick={onBack} aria-label="Back to home">
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden="true" /> Home
        </button>
        <div className="jlpt-prep-title-row">
          <h1 className="jlpt-prep-title">JLPT Preparation</h1>
          {readiness ? (
            <span className="jlpt-prep-subtitle">
              Target: <strong>{readiness.recommended_target.toUpperCase()}</strong>
            </span>
          ) : null}
        </div>
      </header>

      {readinessError ? (
        <div className="jlpt-error-banner" role="alert">{readinessError}</div>
      ) : null}

      {examError ? (
        <div className="jlpt-error-banner" role="alert">{examError}</div>
      ) : null}

      <section className="jlpt-levels-grid" aria-label="JLPT level readiness">
        {LEVEL_ORDER.map((level, idx) => {
          const data = readiness?.levels[level]
          if (readinessLoading || !data) {
            return (
              <div key={level} className="jlpt-readiness-card jlpt-readiness-card-skeleton" aria-busy="true">
                <div className="jlpt-readiness-card-header">
                  <span className="jlpt-readiness-level">{LEVEL_LABELS[level]}</span>
                </div>
              </div>
            )
          }
          const prevLevel = idx > 0 ? LEVEL_ORDER[idx - 1] : null
          const prevData = prevLevel ? (readiness?.levels[prevLevel] ?? null) : null
          const isLocked = prevLevel !== null && (prevData === null || prevData.readiness_pct < JLPT_UNLOCK_THRESHOLD)
          const lockHint = prevLevel
            ? `Reach ${JLPT_UNLOCK_THRESHOLD}% readiness in ${LEVEL_LABELS[prevLevel]} to unlock`
            : ''
          return (
            <ReadinessCard
              key={level}
              level={level}
              data={data}
              onStartMode={startExam}
              loading={examLoading}
              isLocked={isLocked}
              lockHint={lockHint}
            />
          )
        })}
      </section>

      {history.length > 0 ? (
        <section className="jlpt-history-section" aria-label="Recent exam history">
          <h2 className="jlpt-section-title">Recent Exams</h2>
          <ul className="jlpt-history-list">
            {history.slice(0, 8).map((record) => (
              <li key={record.id} className="jlpt-history-item">
                <span className="jlpt-history-level">{record.level.toUpperCase()}</span>
                <span className="jlpt-history-mode">{MODE_META[record.mode as JLPTExamMode]?.label ?? record.mode}</span>
                <span className="jlpt-history-accuracy">{Math.round(record.accuracy * 100)}%</span>
                {record.projected_score !== null ? (
                  <span className="jlpt-history-projected">
                    <Target size={11} aria-hidden="true" /> {record.projected_score}
                  </span>
                ) : null}
                <span className="jlpt-history-date">
                  {new Date(record.completed_at_utc).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </section>
    </div>
  )
}
