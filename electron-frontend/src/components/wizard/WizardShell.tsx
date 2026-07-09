import './wizard.css'
import { StepDots } from './StepDots'
import { Minus, Square, X } from 'lucide-react'

interface WizardShellProps {
  title: string
  totalSteps: number
  currentStep: number
  children: React.ReactNode
  onMinimize?: () => void
  onMaximize?: () => void
  onClose?: () => void
}

export function WizardShell({
  title,
  totalSteps,
  currentStep,
  children,
  onMinimize,
  onMaximize,
  onClose,
}: WizardShellProps) {
  return (
    <div className="wiz-shell" data-wizard={title.toLowerCase()}>
      <div className="wiz-shell-dragbar">
        <span className="wiz-shell-title">{title}</span>
        <div className="window-controls" role="group" aria-label="Window actions">
          <button type="button" className="window-control-button"
            onClick={() => void onMinimize?.()}
            aria-label="Minimize window">
            <Minus className="window-control-icon" strokeWidth={2.2} />
          </button>
          <button type="button" className="window-control-button window-control-button-maximize"
            onClick={() => void onMaximize?.()}
            aria-label="Maximize window">
            <Square className="window-control-icon window-control-icon-maximize" strokeWidth={2} />
          </button>
          <button type="button" className="window-control-button window-control-close"
            onClick={() => void onClose?.()}
            aria-label="Close window">
            <X className="window-control-icon" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <StepDots total={totalSteps} current={currentStep} />

      <div className="wiz-viewport">
        <div className="wiz-card">
          {children}
        </div>
      </div>

      <div className="crt-scanlines" aria-hidden="true" />
      <div className="crt-vhs-line" aria-hidden="true" />
    </div>
  )
}
