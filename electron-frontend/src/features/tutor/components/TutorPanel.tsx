import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Languages, Trash2, Type, Volume2, VolumeX } from 'lucide-react'
import type { UseTutorReturn } from '../useTutor'
import type { TutorSettingsFields } from '../types'
import { TUTOR_PANEL_HEADER_COPY } from '../constants'
import { TutorPanelShell } from './TutorPanelShell'
import { TutorMenu } from './TutorMenu'
import { TutorChatPanel } from './TutorChatPanel'
import { OcrWorkbench } from './OcrWorkbench'
import { ScenarioActivity } from '../../scenario-tutor/components/ScenarioActivity'
import type { UseScenarioTutorReturn } from '../../scenario-tutor/useScenarioTutor'

interface TutorPanelProps {
  tutor: UseTutorReturn
  scenarioTutor: UseScenarioTutorReturn
  settings: TutorSettingsFields
  setSettings: Dispatch<SetStateAction<TutorSettingsFields>>
  cancelAssistantSpeech: () => void
}

const PANEL_ARIA_LABEL: Record<string, string> = {
  menu: 'Tutor menu',
  chat: 'Tutor chat panel',
  scenarios: 'Scenario practice panel',
  ocr: 'OCR translator panel',
}

/**
 * Mode-to-body router for the shared Tutor popup. A switch, not a
 * controller: it selects the body component and header config for the
 * active mode and hands both to TutorPanelShell. No fetching, no evaluation,
 * no session logic lives here — that stays inside each activity's own
 * feature (tutor chat in useTutor, scenarios in useScenarioTutor).
 */
export function TutorPanel({ tutor, scenarioTutor, settings, setSettings, cancelAssistantSpeech }: TutorPanelProps) {
  const { tutorPanelMode } = tutor
  const headerCopy = TUTOR_PANEL_HEADER_COPY[tutorPanelMode]
  const catalog = tutorPanelMode === 'chat' && tutor.assistantChatLoading ? 'TYPING…' : headerCopy.catalog

  let body: ReactNode
  let headerActions: ReactNode = null

  // One coach-audio toggle for the whole popup: chat replies and Scenario
  // Practice NPC lines play through the same voice runtime, so they share the
  // same switch rather than each owning a separate setting.
  const audioToggle = (
    <button
      type="button"
      className={`panel-action-button ${settings.assistantChatAudioEnabled ? 'is-active' : ''}`}
      onClick={() => {
        if (settings.assistantChatAudioEnabled) {
          cancelAssistantSpeech()
        }
        setSettings((previous) => ({
          ...previous,
          assistantChatAudioEnabled: !previous.assistantChatAudioEnabled,
        }))
      }}
      aria-label={settings.assistantChatAudioEnabled ? 'Turn coach audio off' : 'Turn coach audio on'}
      aria-pressed={settings.assistantChatAudioEnabled}
      title={settings.assistantChatAudioEnabled ? 'Coach audio on' : 'Coach audio off'}
    >
      {settings.assistantChatAudioEnabled ? (
        <Volume2 size={16} strokeWidth={2.2} aria-hidden="true" />
      ) : (
        <VolumeX size={16} strokeWidth={2.2} aria-hidden="true" />
      )}
    </button>
  )

  // One romaji→kana toggle for both typed surfaces: Tutor chat and Scenario
  // Practice share the same input convention, so they share the same switch.
  const romajiToggle = (
    <button
      type="button"
      className={`panel-action-button ${settings.romajiConversionEnabled ? 'is-active' : ''}`}
      onClick={() => setSettings((previous) => ({
        ...previous,
        romajiConversionEnabled: !previous.romajiConversionEnabled,
      }))}
      aria-label={settings.romajiConversionEnabled ? 'Turn off romaji-to-kana conversion' : 'Turn on romaji-to-kana conversion'}
      aria-pressed={settings.romajiConversionEnabled}
      title={settings.romajiConversionEnabled ? 'Romaji → kana on' : 'Romaji → kana off'}
    >
      {settings.romajiConversionEnabled ? (
        <Languages size={16} strokeWidth={2.2} aria-hidden="true" />
      ) : (
        <Type size={16} strokeWidth={2.2} aria-hidden="true" />
      )}
    </button>
  )

  if (tutorPanelMode === 'menu') {
    body = (
      <TutorMenu
        assistantChatEnabled={settings.assistantChatEnabled}
        returnFocusMode={tutor.tutorPanelReturnFocusMode}
        onSelect={tutor.setTutorPanelMode}
      />
    )
  } else if (tutorPanelMode === 'chat') {
    body = <TutorChatPanel tutor={tutor} settings={settings} cancelAssistantSpeech={cancelAssistantSpeech} />
    headerActions = (
      <>
        {romajiToggle}
        {audioToggle}
        <button
          type="button"
          className="panel-action-button is-danger"
          onClick={() => void tutor.clearAssistantChat()}
          disabled={tutor.assistantChatMessages.length <= 0 || tutor.assistantChatLoading}
          aria-label="Clear chat history"
          title="Clear chat"
        >
          <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </>
    )
  } else if (tutorPanelMode === 'ocr') {
    body = <OcrWorkbench tutor={tutor} settings={settings} setSettings={setSettings} />
    headerActions = (
      <button
        type="button"
        className="panel-action-button is-danger"
        onClick={() => tutor.clearOcrWorkbenchResult()}
        disabled={tutor.ocrWorkbenchBusy || (!tutor.ocrWorkbenchResult && !tutor.ocrWorkbenchError)}
        aria-label="Clear OCR result"
        title="Clear"
      >
        <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
    )
  } else {
    body = (
      <ScenarioActivity
        scenarioTutor={scenarioTutor}
        onExitToTutorMenu={tutor.returnToTutorMenu}
        romajiConversionEnabled={settings.romajiConversionEnabled}
      />
    )
    headerActions = (
      <>
        {romajiToggle}
        {audioToggle}
      </>
    )
  }

  return (
    <TutorPanelShell
      mode={tutorPanelMode}
      title={headerCopy.title}
      catalog={catalog}
      ariaLabel={PANEL_ARIA_LABEL[tutorPanelMode]}
      panelId="tutor-panel"
      onBack={tutorPanelMode === 'menu' ? undefined : tutor.returnToTutorMenu}
      onClose={tutor.closeTutorPanel}
      headerActions={headerActions}
    >
      {body}
    </TutorPanelShell>
  )
}
