import type { OnboardingWizardProps } from './types'
import { useOnboarding } from './useOnboarding'
import { StepLayout } from './components/StepLayout'
import { StepDots } from './components/StepDots'
import { WelcomeStep } from './components/WelcomeStep'
import { GoalStep } from './components/GoalStep'
import { HabitsStep } from './components/HabitsStep'
import { KnowledgeStep } from './components/KnowledgeStep'
import { FeaturesStep } from './components/FeaturesStep'
import { ReadyStep } from './components/ReadyStep'
import { Minus, Square, X } from 'lucide-react'

const STEP_TITLES: Record<number, string> = {
  1: '',
  2: "What's your main goal?",
  3: 'Your study habits',
  4: 'What do you already know?',
  5: 'Optional features',
  6: 'Ready to start?',
}

const STEP_SUBTITLES: Record<number, string | undefined> = {
  1: undefined,
  2: 'Choose one — you can change this later.',
  3: undefined,
  4: 'Tick anything you\'re already confident with. We\'ll skip those so you start where it counts.',
  5: 'Set up your preferred study environment. Everything here can be adjusted later in settings.',
  6: undefined,
}

export function OnboardingWizard(props: OnboardingWizardProps) {
  const o = useOnboarding(props)
  const showAction = STEP_TITLES[o.page] !== '' ? true : o.revealed

  return (
    <div className="obn-wizard">
      <div style={{
        height: '34px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>
        <span style={{
          fontSize: '0.76rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.68,
          fontWeight: 700,
          userSelect: 'none',
          pointerEvents: 'none',
          paddingLeft: '0.9rem',
        }}>
          Onboarding
        </span>
        <div className="window-controls" role="group" aria-label="Window actions">
          <button type="button" className="window-control-button"
            onClick={() => void window.jplearnDesktop?.minimizeWindow()}
            aria-label="Minimize window">
            <Minus className="window-control-icon" strokeWidth={2.2} />
          </button>
          <button type="button" className="window-control-button window-control-button-maximize"
            onClick={() => void window.jplearnDesktop?.toggleMaximizeWindow()}
            aria-label="Maximize window">
            <Square className="window-control-icon window-control-icon-maximize" strokeWidth={2} />
          </button>
          <button type="button" className="window-control-button window-control-close"
            onClick={() => void window.jplearnDesktop?.closeWindow()}
            aria-label="Close window">
            <X className="window-control-icon" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <StepDots total={o.totalSteps} current={o.actualSteps.indexOf(o.page) + 1} />

      <div className="obn-wizard-viewport">
        <div className="obn-card">
          <StepLayout
            title={STEP_TITLES[o.page]}
            subtitle={STEP_SUBTITLES[o.page]}
            onNext={o.isLastStep ? undefined : o.goNext}
            onBack={o.goBack}
            onSkip={o.handleSkip}
            nextLabel="Next"
            skipLabel="Skip setup"
            nextDisabled={o.submitting}
            hideBack={o.isFirstStep}
            revealed={o.revealed}
            onReveal={() => o.setRevealed(true)}
          >
            {o.page === 1 && <WelcomeStep onReveal={() => o.setRevealed(true)} />}
            {o.page === 2 && (
              showAction ? <GoalStep goal={o.goal} onChange={o.setGoal} disabled={o.submitting} /> : null
            )}
            {o.page === 3 && (
              showAction ? (
                <HabitsStep
                  dailyMinutes={o.dailyMinutes}
                  onDailyMinutes={o.setDailyMinutes}
                  targetLevel={o.targetLevel}
                  onTargetLevel={o.setTargetLevel}
                  disabled={o.submitting}
                />
              ) : null
            )}
            {o.page === 4 && (
              showAction ? (
                <KnowledgeStep
                  checkedItems={o.checkedItems}
                  onToggle={o.toggleItem}
                  disabled={o.submitting}
                />
              ) : null
            )}
            {o.page === 5 && (
              showAction ? (
                <FeaturesStep
                  showChatbotSection={props.showChatbotSection}
                  assistantChatEnabled={props.assistantChatEnabled}
                  onAssistantChatToggle={props.onAssistantChatToggle}
                  showVoiceSection={props.showVoiceSection}
                  voiceOptions={props.voiceOptions}
                  voiceEnabled={props.voiceEnabled}
                  voiceSpeaker={props.voiceSpeaker}
                  voiceBusy={props.voiceBusy}
                  onVoiceToggle={props.onVoiceToggle}
                  onVoiceSelect={props.onVoiceSelect}
                  showFontSection={props.showFontSection}
                  appFont={props.appFont}
                  fontOptions={props.fontOptions}
                  onAppFontSelect={props.onAppFontSelect}
                  fontSize={props.fontSize}
                  fontSizeOptions={props.fontSizeOptions}
                  onFontSizeSelect={props.onFontSizeSelect}
                  disabled={o.submitting}
                />
              ) : null
            )}
            {o.page === 6 && (
              showAction ? <ReadyStep submitting={o.submitting} onStart={o.handleStart} /> : null
            )}
          </StepLayout>
        </div>
      </div>

      <div className="hub-crt-surface" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--tl" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--tr" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--bl" aria-hidden="true" />
      <div className="hub-glitch-corner hub-glitch-corner--br" aria-hidden="true" />
    </div>
  )
}
