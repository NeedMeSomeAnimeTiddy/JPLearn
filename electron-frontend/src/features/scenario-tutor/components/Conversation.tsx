import { useEffect, useRef, useState } from 'react'
import { Round } from '../../round'
import { screenHead } from '../../menu'
import type { UseScenarioTutorReturn } from '../useScenarioTutor'
import { useSheetKeys } from '../useSheetKeys'
import { heldAnswer } from '../utils'
import { ConversationFinished } from './ConversationFinished'
import { ConversationHistory } from './ConversationHistory'
import { ConversationLevel } from './ConversationLevel'
import { ConversationTalk } from './ConversationTalk'
import '../conversation.css'

export interface ConversationProps {
  scenarioTutor: UseScenarioTutorReturn
  /** how many times the chosen scene has been finished, when the menu has asked */
  played?: number | null
  romajiEnabled: boolean
  onToggleRomaji: () => void
  audioEnabled: boolean
  onToggleAudio: () => void
  /** back to The World's scenes. A conversation in progress is kept; picking it again resumes it. */
  onLeave: () => void
}

/* ==================================================================================================
   CONVERSATION PRACTICE, AS ITS OWN SCREEN — the round's session sheet with a character on it,
   started from The World's scenes. `useScenarioTutor` keeps the session and does every piece of the
   work; this only decides which of the four boards is drawn, and holds the one thing the hook does
   not: the answer you have just given, until you press ENTER past it.
   ================================================================================================== */
export function Conversation({
  scenarioTutor: tutor, played = null, romajiEnabled, onToggleRomaji, audioEnabled, onToggleAudio, onLeave,
}: ConversationProps) {
  /* how long the transcript was when the reply went, while the sheet is holding its answer */
  const [held, setHeld] = useState<number | null>(null)
  const sessionId = tutor.session?.sessionId ?? null
  useEffect(() => { setHeld(null) }, [sessionId])

  /* THE PICKER IS THE SCENES SCREEN NOW. When the tutor goes back to its own list -- a leave that
     was confirmed, or a finished session put away -- the screen goes back to the scenes. */
  const leave = useRef(onLeave)
  leave.current = onLeave
  useEffect(() => { if (tutor.screen === 'select') leave.current() }, [tutor.screen])

  const scenario = tutor.selectedScenario
  const session = tutor.session
  const answer = held !== null && session && scenario ? heldAnswer(scenario, session.transcript, held) : null

  const send = () => {
    if (!session || session.status !== 'active' || tutor.evaluatingResponse) return
    if (tutor.learnerInputValue.trim().length === 0) return
    setHeld(session.transcript.length)
    tutor.submitResponse()
  }

  const backFromHistory = () => {
    if (scenario) tutor.selectScenario(scenario.id)
    else tutor.closeHistory()
  }

  let body = null
  if (tutor.error) {
    body = <ConversationError message={tutor.error} onLeave={tutor.returnToSelect} />
  } else if (tutor.screen === 'history') {
    body = <ConversationHistory tutor={tutor} onBack={backFromHistory} />
  } else if (scenario && tutor.screen === 'intro') {
    body = <ConversationLevel tutor={tutor} scenario={scenario} played={played} onLeave={onLeave} />
  } else if (scenario && session && (tutor.screen === 'session' || answer)) {
    body = (
      <ConversationTalk
        tutor={tutor}
        scenario={scenario}
        session={session}
        answer={answer}
        onSend={send}
        onNext={() => setHeld(null)}
        romajiEnabled={romajiEnabled}
        onToggleRomaji={onToggleRomaji}
        audioEnabled={audioEnabled}
        onToggleAudio={onToggleAudio}
      />
    )
  } else if (scenario && session && tutor.summary && (tutor.screen === 'summary' || tutor.screen === 'srs-review')) {
    body = <ConversationFinished tutor={tutor} scenario={scenario} session={session} summary={tutor.summary} />
  }

  return <div className="cv-root">{body}</div>
}

function ConversationError({ message, onLeave }: { message: string; onLeave: () => void }) {
  useSheetKeys((event) => {
    if (event.key === 'Escape') { event.preventDefault(); onLeave() }
  })
  return (
    <Round
      head={screenHead('READING', 'scenes')}
      cap="THE WORLD · SCENES"
      run={[]}
      foot={{ at: 0, target: 0, trail: [], note: 'NOT STARTED' }}
      onBack={onLeave}
      backLabel="Back"
      backJp="戻る"
      backAria="Back to the scenes"
      hints={[{ cap: 'ESC', en: 'Back', jp: '戻る' }]}
      ask={
        <div className="rd-ask">
          <div className="rd-kick"><span>NO SCENE</span><em>無</em></div>
        </div>
      }
      work={
        <div className="rd-work">
          <div className="rd-kick"><span>THE CONVERSATION</span><em>会話</em></div>
          <div className="rd-plain">
            <h2>That scene could not be opened</h2>
            <p className="rd-err" role="alert">{message}</p>
          </div>
          <button type="button" className="rd-slab calm go" onClick={onLeave}>BACK TO THE SCENES<em>戻る</em></button>
        </div>
      }
    />
  )
}
