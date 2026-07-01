import { useState } from 'react'
import type { NavDirection } from '../types'
import { ArrowRight, BookOpen, Check, Volume2, VolumeX } from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────────────────

const BEGINNER_PATH_STEPS = [
  { label: 'Hiragana', note: 'The foundational Japanese syllabary' },
  { label: 'Katakana', note: 'For foreign words and emphasis' },
  { label: 'N5 Vocabulary', note: 'Core 800-word beginner vocabulary' },
  { label: 'N5 Grammar', note: 'Essential sentence patterns' },
]

const LEARNING_GOALS = [
  { key: 'travel',  label: 'Travel to Japan',    emoji: '✈️' },
  { key: 'anime',   label: 'Watch anime / read manga', emoji: '🎌' },
  { key: 'jlpt',    label: 'Pass the JLPT',       emoji: '📜' },
  { key: 'general', label: 'General interest',    emoji: '🌸' },
]

const DAILY_TIMES = [
  { value: 5,  label: '5 min',  note: 'Light practice' },
  { value: 10, label: '10 min', note: 'Regular habit' },
  { value: 20, label: '20 min', note: 'Solid progress' },
  { value: 30, label: '30+ min', note: 'Deep study' },
]

const TARGET_LEVELS = [
  { key: 'unsure', label: 'Not sure yet' },
  { key: 'n5',     label: 'JLPT N5' },
  { key: 'n4',     label: 'JLPT N4' },
  { key: 'n3',     label: 'JLPT N3' },
  { key: 'n2',     label: 'JLPT N2' },
  { key: 'n1',     label: 'JLPT N1' },
]

// Shortened checklist — enough to derive an ExpertiseLevel
const FAMILIARITY_ITEMS = [
  { key: 'hiragana', label: 'Hiragana',     description: 'All 46 basic phonetic characters' },
  { key: 'katakana', label: 'Katakana',     description: 'The script for foreign words' },
  { key: 'kanji_n5', label: 'N5 Kanji',     description: '~100 basic Chinese-origin characters' },
  { key: 'vocab_n5', label: 'N5 Vocabulary', description: '~800 essential beginner words' },
  { key: 'kanji_n4', label: 'N4 Kanji',     description: '~300 intermediate kanji' },
  { key: 'vocab_n4', label: 'N4 Vocabulary', description: '~1,500 everyday conversation words' },
  { key: 'kanji_n3', label: 'N3+',          description: 'Intermediate / advanced Japanese' },
]

// ── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingAnswers {
  goal?: string
  dailyMinutes?: number
  targetLevel?: string
}

interface VoiceOption {
  id: number
  name: string
  jp: string
}

interface OnboardingViewProps {
  navDirection: NavDirection
  showChatbotSection: boolean
  assistantChatEnabled: boolean
  onAssistantChatToggle: () => void
  showVoiceSection: boolean
  voiceOptions: VoiceOption[]
  voiceEnabled: boolean
  voiceSpeaker: number
  voiceBusy: boolean
  onVoiceToggle: () => void
  onVoiceSelect: (id: number) => void
  showFontSection: boolean
  appFont: string
  fontOptions: Array<{ key: string; label: string }>
  onAppFontSelect: (key: string) => void
  fontSize: 'small' | 'medium' | 'large'
  fontSizeOptions: Array<{ key: 'small' | 'medium' | 'large'; label: string }>
  onFontSizeSelect: (key: 'small' | 'medium' | 'large') => void
  onSelectPath: (pathId: string, checkedItems: Set<string>, answers: OnboardingAnswers) => void
  onSkip: (checkedItems: Set<string>, answers: OnboardingAnswers) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function OnboardingView({
  navDirection,
  showChatbotSection,
  assistantChatEnabled,
  onAssistantChatToggle,
  showVoiceSection,
  voiceOptions,
  voiceEnabled,
  voiceSpeaker,
  voiceBusy,
  onVoiceToggle,
  onVoiceSelect,
  showFontSection,
  appFont,
  fontOptions,
  onAppFontSelect,
  fontSize,
  fontSizeOptions,
  onFontSizeSelect,
  onSelectPath,
  onSkip,
}: OnboardingViewProps) {
  const [goal, setGoal] = useState<string | undefined>(undefined)
  const [dailyMinutes, setDailyMinutes] = useState<number | undefined>(undefined)
  const [targetLevel, setTargetLevel] = useState<string | undefined>(undefined)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  function toggleItem(key: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function buildAnswers(): OnboardingAnswers {
    return { goal, dailyMinutes, targetLevel }
  }

  async function handleStart() {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSelectPath('complete_beginner', checkedItems, buildAnswers())
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSkip() {
    if (submitting) return
    setSubmitting(true)
    try {
      await onSkip(checkedItems, buildAnswers())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`view-shell view-${navDirection}`}>
      <div className="onb-page panel-glass">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <header className="onb-hero">
          <div className="onb-hero-badge">日本語</div>
          <h1 className="onb-hero-title">Welcome to JPLearn</h1>
          <p className="onb-hero-subtitle">
            Let's take two minutes to personalise your learning journey.
            Every answer is optional — you can always change things later.
          </p>
        </header>

        <div className="onb-body">
          {/* ── Goal ──────────────────────────────────────────────────── */}
          <section className="onb-section" aria-labelledby="onb-goal-label">
            <h2 id="onb-goal-label" className="onb-section-title">
              What's your main goal?
            </h2>
            <div className="onb-goal-grid" role="radiogroup" aria-label="Learning goal">
              {LEARNING_GOALS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`onb-goal-card${goal === g.key ? ' is-selected' : ''}`}
                  aria-pressed={goal === g.key}
                  onClick={() => setGoal(goal === g.key ? undefined : g.key)}
                  disabled={submitting}
                >
                  <span className="onb-goal-emoji" aria-hidden="true">{g.emoji}</span>
                  <span className="onb-goal-label">{g.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Daily time ────────────────────────────────────────────── */}
          <section className="onb-section" aria-labelledby="onb-time-label">
            <h2 id="onb-time-label" className="onb-section-title">
              How much time can you study each day?
            </h2>
            <div className="onb-time-grid" role="radiogroup" aria-label="Daily study time">
              {DAILY_TIMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`onb-time-card${dailyMinutes === t.value ? ' is-selected' : ''}`}
                  aria-pressed={dailyMinutes === t.value}
                  onClick={() => setDailyMinutes(dailyMinutes === t.value ? undefined : t.value)}
                  disabled={submitting}
                >
                  <span className="onb-time-value">{t.label}</span>
                  <span className="onb-time-note">{t.note}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Target level ──────────────────────────────────────────── */}
          <section className="onb-section" aria-labelledby="onb-level-label">
            <h2 id="onb-level-label" className="onb-section-title">
              Do you have a target JLPT level in mind?
            </h2>
            <div className="onb-level-grid" role="radiogroup" aria-label="Target JLPT level">
              {TARGET_LEVELS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className={`onb-level-chip${targetLevel === l.key ? ' is-selected' : ''}`}
                  aria-pressed={targetLevel === l.key}
                  onClick={() => setTargetLevel(targetLevel === l.key ? undefined : l.key)}
                  disabled={submitting}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </section>

          {/* ── Prior knowledge ───────────────────────────────────────── */}
          <section className="onb-section" aria-labelledby="onb-know-label">
            <h2 id="onb-know-label" className="onb-section-title">
              What do you already know?
            </h2>
            <p className="onb-section-hint">
              Tick anything you're already confident with. We'll skip those so you start where it counts.
            </p>
            <div className="onb-check-list" role="group" aria-label="Prior knowledge checklist">
              {FAMILIARITY_ITEMS.map((item) => {
                const checked = checkedItems.has(item.key)
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`onb-check-item${checked ? ' is-checked' : ''}`}
                    aria-pressed={checked}
                    onClick={() => toggleItem(item.key)}
                    disabled={submitting}
                  >
                    <span className="onb-check-box" aria-hidden="true" />
                    <span className="onb-check-text">
                      <span className="onb-check-title">{item.label}</span>
                      <span className="onb-check-desc">{item.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {showChatbotSection ? (
            <section className="onb-section" aria-labelledby="onb-chatbot-label">
              <h2 id="onb-chatbot-label" className="onb-section-title">
                Would you like the study coach chat?
              </h2>
              <p className="onb-section-hint">
                Enable an in-app coach that can answer study questions and suggest next steps.
              </p>
              <button
                type="button"
                className={`onb-voice-toggle${assistantChatEnabled ? ' is-on' : ''}`}
                aria-pressed={assistantChatEnabled}
                onClick={onAssistantChatToggle}
                disabled={submitting}
              >
                {assistantChatEnabled ? 'Coach chat on' : 'Coach chat off'}
              </button>
            </section>
          ) : null}

          {showVoiceSection ? (
            <section className="onb-section" aria-labelledby="onb-voice-label">
              <h2 id="onb-voice-label" className="onb-section-title">
                Would you like prompts read aloud?
              </h2>
              <p className="onb-section-hint">
                A Japanese voice will read study prompts during games. Tap a voice to hear a sample.
              </p>
              <button
                type="button"
                className={`onb-voice-toggle${voiceEnabled ? ' is-on' : ''}`}
                aria-pressed={voiceEnabled}
                onClick={onVoiceToggle}
                disabled={submitting}
              >
                {voiceEnabled
                  ? <><Volume2 size={15} strokeWidth={2.2} aria-hidden="true" /> Voice on</>
                  : <><VolumeX size={15} strokeWidth={2.2} aria-hidden="true" /> Voice off</>
                }
              </button>
              {voiceEnabled && (
                <div className="onb-voice-grid" role="radiogroup" aria-label="Choose a reading voice">
                  {voiceOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`onb-voice-card${voiceSpeaker === opt.id ? ' is-active' : ''}`}
                      aria-pressed={voiceSpeaker === opt.id}
                      onClick={() => onVoiceSelect(opt.id)}
                      disabled={submitting || voiceBusy}
                    >
                      <span className="onb-voice-name">{opt.name}</span>
                      <span className="onb-voice-jp">{opt.jp}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {showFontSection ? (
            <section className="onb-section" aria-labelledby="onb-font-label">
              <h2 id="onb-font-label" className="onb-section-title">
                Pick a study font
              </h2>
              <p className="onb-section-hint">
                Choose the reading style that feels best now. You can change this later in settings.
              </p>
              <div className="onb-level-grid" role="radiogroup" aria-label="App font">
                {fontOptions.map((font) => (
                  <button
                    key={font.key}
                    type="button"
                    className={`onb-level-chip${appFont === font.key ? ' is-selected' : ''}`}
                    aria-pressed={appFont === font.key}
                    onClick={() => onAppFontSelect(font.key)}
                    disabled={submitting}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
              <p className="onb-section-hint" style={{ marginTop: '0.9rem' }}>
                Choose a comfortable font size for menus and study screens.
              </p>
              <div className="onb-level-grid" role="radiogroup" aria-label="App font size">
                {fontSizeOptions.map((size) => (
                  <button
                    key={size.key}
                    type="button"
                    className={`onb-level-chip${fontSize === size.key ? ' is-selected' : ''}`}
                    aria-pressed={fontSize === size.key}
                    onClick={() => onFontSizeSelect(size.key)}
                    disabled={submitting}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── Path card + CTA ───────────────────────────────────────── */}
          <section className="onb-section onb-path-section" aria-labelledby="onb-path-label">
            <h2 id="onb-path-label" className="onb-section-title">
              Ready to start?
            </h2>
            <div className="onboarding-path-card onboarding-path-card--featured">
              <div className="onboarding-path-card-header">
                <BookOpen size={20} strokeWidth={2} aria-hidden="true" className="onboarding-path-icon" />
                <div>
                  <strong className="onboarding-path-name">Complete Beginner</strong>
                  <span className="onboarding-path-badge">Recommended</span>
                </div>
              </div>
              <p className="onboarding-path-desc">
                Start from scratch and build a solid foundation. The app will guide you step by step — no guesswork needed.
              </p>
              <ol className="onboarding-path-steps">
                {BEGINNER_PATH_STEPS.map((step, i) => (
                  <li key={step.label} className="onboarding-path-step">
                    <span className="onboarding-step-num">{i + 1}</span>
                    <span className="onboarding-step-label">{step.label}</span>
                    <span className="onboarding-step-note">{step.note}</span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="onboarding-start-btn btn-primary"
                onClick={() => void handleStart()}
                disabled={submitting}
              >
                {submitting ? 'Starting…' : 'Start Complete Beginner Path'}
                {!submitting && <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />}
              </button>
            </div>
          </section>
        </div>

        {/* ── Footer skip ───────────────────────────────────────────────── */}
        <footer className="onboarding-footer">
          <button
            type="button"
            className="onboarding-skip-link"
            onClick={() => void handleSkip()}
            disabled={submitting}
          >
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
            I know what I want — skip setup
          </button>
        </footer>
      </div>
    </div>
  )
}

