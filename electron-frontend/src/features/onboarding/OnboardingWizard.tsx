import type { OnboardingWizardProps } from './types'
import { useOnboarding } from './useOnboarding'
import { WizardShell, StepLayout } from '../../components/wizard'
import { WelcomeStep } from './components/WelcomeStep'
import { GoalStep } from './components/GoalStep'
import { HabitsStep } from './components/HabitsStep'
import { KnowledgeStep } from './components/KnowledgeStep'
import { FeaturesStep } from './components/FeaturesStep'
import { ReadyStep } from './components/ReadyStep'

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
    <WizardShell
      title="Onboarding"
      totalSteps={o.totalSteps}
      currentStep={o.actualSteps.indexOf(o.page) + 1}
      onMinimize={() => void window.jplearnDesktop?.minimizeWindow()}
      onMaximize={() => void window.jplearnDesktop?.toggleMaximizeWindow()}
      onClose={() => void window.jplearnDesktop?.closeWindow()}
    >
      <StepLayout
        title={STEP_TITLES[o.page]}
        subtitle={STEP_SUBTITLES[o.page]}
        enableTypewriter={true}
        revealed={o.revealed}
        onReveal={() => o.setRevealed(true)}
        onNext={o.isLastStep ? undefined : o.goNext}
        onBack={o.goBack}
        onSkip={o.handleSkip}
        nextLabel="Next"
        skipLabel="Skip setup"
        nextDisabled={o.submitting}
        hideBack={o.isFirstStep}
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
    </WizardShell>
  )
}
