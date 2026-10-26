import { useEffect } from 'react'
import { Round } from '../../round'
import { screenHead } from '../../menu'
import {
  CONVERSATION_OBJECTIVE_ROWS, SCENARIO_COPY, SCENARIO_LEVEL_DESCRIPTIONS, SCENARIO_LEVEL_LABELS,
  SCENARIO_TTS_SPEED_SCALE,
} from '../constants'
import type { LearnerLevel, ScenarioDefinition } from '../types'
import type { UseScenarioTutorReturn } from '../useScenarioTutor'
import { pressesItself, useSheetKeys } from '../useSheetKeys'
import { objectiveFoot, objectiveTally, objectiveTickClass } from '../utils'

const LEVELS: LearnerLevel[] = ['beginner', 'intermediate']

export interface ConversationLevelProps {
  tutor: UseScenarioTutorReturn
  scenario: ScenarioDefinition
  /** how many times this scene has been finished, when the menu knows */
  played: number | null
  onLeave: () => void
}

/* ==================================================================================================
   BEFORE IT STARTS (board ConvLevel). The prompt cell is the scene -- who you are talking to, what
   it is called in both languages, and the objectives you will be marked on; the work cell is the
   one choice there is, how much help, with the two notes the old intro carried about grading and
   privacy kept word for word. ENTER starts on whichever level is lit.
   ================================================================================================== */
export function ConversationLevel({ tutor, scenario, played, onLeave }: ConversationLevelProps) {
  const level = tutor.selectedLevel ?? 'beginner'
  const { selectedLevel, selectLevel } = tutor

  /* a level is always lit, so ENTER always has something to start */
  useEffect(() => { if (!selectedLevel) selectLevel('beginner') }, [selectedLevel, selectLevel])

  useSheetKeys((event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const at = LEVELS.indexOf(level) + (event.key === 'ArrowRight' ? 1 : -1)
      selectLevel(LEVELS[(at + LEVELS.length) % LEVELS.length])
      return
    }
    if (event.key === 'Enter') {
      /* a level button starts its own level; any other button is a press already */
      const lvl = (event.target as HTMLElement | null)?.closest?.('[data-level]')?.getAttribute('data-level') as LearnerLevel | null
      if (!lvl && pressesItself(event.target)) return
      event.preventDefault()
      tutor.startScenario(lvl ?? level)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onLeave()
    }
  })

  const tally = objectiveTally(scenario, null)
  const rows = tally.ticks.slice(0, CONVERSATION_OBJECTIVE_ROWS)
  const index = tutor.scenarios.findIndex((entry) => entry.id === scenario.id)
  const playedNote = played === null ? 'CHOOSE HOW MUCH HELP'
    : played === 0 ? 'NOT PLAYED' : `PLAYED ${played} TIME${played === 1 ? '' : 'S'}`

  return (
    <Round
      head={screenHead('READING', 'scenes')}
      cap={`${scenario.title.toUpperCase()} · ${scenario.titleJa} · ${playedNote}`}
      run={[{
        key: 'scene',
        value: String(index + 1).padStart(2, '0'),
        of: `/ ${String(tutor.scenarios.length).padStart(2, '0')}`,
        label: 'SCENE',
      }]}
      foot={{
        at: 0, target: 0, trail: [], note: 'OBJECTIVES',
        marks: tally.ticks.map(objectiveTickClass),
        right: objectiveFoot(tally, 'before'),
      }}
      onBack={onLeave}
      backLabel="Back"
      backJp="戻る"
      backAria="Back to the scenes"
      onRestart={tutor.openHistory}
      restart={{ en: 'Past sessions', jp: '履歴', aria: 'Past sessions' }}
      hints={[
        { cap: '←→', en: 'Level', jp: '選択' },
        { cap: 'ENTER', en: 'Start', jp: '開始' },
        { cap: 'ESC', en: 'Back', jp: '戻る' },
      ]}
      ask={
        <div className="rd-ask">
          <div className="rd-kick">
            <span>{`${scenario.npc.name} · ${scenario.npc.role}`.toUpperCase()}</span><em>相手</em>
          </div>
          <div className="cv-title-jp" lang="ja">{scenario.titleJa}</div>
          <div className="cv-title-en">{scenario.title}</div>
          <p className="cv-small cv-desc">{scenario.description}</p>
          <div className="rd-kick cv-q cv-need">
            <span>WHAT YOU NEED TO DO</span>
            <span>{tally.needed} NEEDED{tally.optional ? ` · ${tally.optional} OPTIONAL` : ''}</span>
          </div>
          <div className="cv-rows">
            {rows.map((tick) => (
              <div className="cv-row" key={tick.id}>
                <i className={tick.required ? undefined : 'opt'} aria-hidden="true" />
                {tick.label}
                {tick.required ? null : <s>OPTIONAL</s>}
              </div>
            ))}
          </div>
          {tally.ticks.length > rows.length ? (
            <div className="cv-fold">+ {tally.ticks.length - rows.length} MORE</div>
          ) : null}
        </div>
      }
      work={
        <div className="rd-work">
          <div className="rd-kick"><span>HOW MUCH HELP</span><span>←→ CHOOSE · <em>難易度</em></span></div>
          <div className="cv-lvls" role="group" aria-label="Choose a learner level">
            {LEVELS.map((entry) => (
              <button
                key={entry}
                type="button"
                data-level={entry}
                className={entry === level ? 'cv-lvl hot' : 'cv-lvl'}
                aria-pressed={entry === level}
                aria-label={SCENARIO_LEVEL_LABELS[entry]}
                aria-describedby={`cv-level-${entry}`}
                onClick={() => selectLevel(entry)}
              >
                <b aria-hidden="true">{SCENARIO_LEVEL_LABELS[entry]}</b>
                <span className="p" id={`cv-level-${entry}`}>{SCENARIO_LEVEL_DESCRIPTIONS[entry]}</span>
                <span className="cv-spec" aria-hidden="true"><span>AUDIO {SCENARIO_TTS_SPEED_SCALE[entry]}×</span></span>
              </button>
            ))}
          </div>
          <div className="cv-notes">
            <p className="cv-note-sm" role="note">
              <b>GRADING</b>
              {tutor.aiEvaluationActive ? SCENARIO_COPY.evaluationAiMode : SCENARIO_COPY.evaluationDeterministicMode}
            </p>
            <p className="cv-note-sm" role="note"><b>PRIVACY</b>{SCENARIO_COPY.privacyDisclosure}</p>
          </div>
          <button
            type="button"
            className="rd-slab go"
            onClick={() => tutor.startScenario(level)}
            aria-label="Start scenario"
          >
            ENTER TO START THE CONVERSATION<em>開始</em>
          </button>
        </div>
      }
    />
  )
}
