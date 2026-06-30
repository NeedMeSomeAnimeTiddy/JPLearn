import type { NavDirection } from '../types'
import { ArrowRight, BookOpen, Check } from 'lucide-react'

interface OnboardingViewProps {
  navDirection: NavDirection
  onSelectPath: (pathId: string) => void
  onSkip: () => void
}

const BEGINNER_PATH_STEPS = [
  { label: 'Hiragana', note: 'The foundational Japanese syllabary' },
  { label: 'Katakana', note: 'For foreign words and emphasis' },
  { label: 'N5 Vocabulary', note: 'Core 800-word beginner vocabulary' },
  { label: 'N5 Grammar', note: 'Essential sentence patterns' },
]

export function OnboardingView({ navDirection, onSelectPath, onSkip }: OnboardingViewProps) {
  return (
    <div className={`view-shell view-${navDirection}`}>
      <section className="home-menu panel-glass">
        <header className="home-header-row">
          <h1 className="home-logo">JPLearn</h1>
        </header>

        <div>
          <p className="hero-kicker">Getting started</p>
          <p className="home-copy" style={{ margin: 0 }}>Choose a learning path — the app will guide you each session so you never wonder what to study next.</p>
        </div>

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
            onClick={() => onSelectPath('complete_beginner')}
          >
            Start Complete Beginner Path
            <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <footer className="onboarding-footer">
          <button type="button" className="onboarding-skip-link" onClick={onSkip}>
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
            I know what I want — skip setup
          </button>
        </footer>
      </section>
    </div>
  )
}
