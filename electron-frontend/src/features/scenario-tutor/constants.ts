import type { LearnerLevel } from './types'

export const SCENARIO_CORRECT_CONFIDENCE_THRESHOLD = 0.75
export const SCENARIO_FUZZY_CONFIDENCE = 0.75
export const SCENARIO_SLOTS_COMPLETE_CONFIDENCE = 0.9
export const SCENARIO_MISTAKE_CONFIDENCE = 0.9
export const SCENARIO_EXACT_CONFIDENCE = 1

export const SCENARIO_AI_MIN_CONFIDENCE = 0.6
export const SCENARIO_AI_TIMEOUT_MS = 15000

export const SCENARIO_STT_MIN_CONFIDENCE = 0.4

export const SCENARIO_DEFAULT_MAX_ATTEMPTS = 3

export const SCENARIO_LEVEL_LABELS: Record<LearnerLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
}

export const SCENARIO_LEVEL_DESCRIPTIONS: Record<LearnerLevel, string> = {
  beginner: 'Simpler phrasing, more generous hints, slower audio, and kana/romaji reading aids.',
  intermediate: 'Natural phrasing at a normal pace with lighter hints.',
}

export const SCENARIO_MIC_MAX_DURATION_MS = 8000

/** Multiplies the learner's global voice speed for NPC playback so beginner
 * lines are easier to follow. Applied by useScenarioTutor via
 * playVoiceRuntimeAudio's speedScale argument. */
export const SCENARIO_TTS_SPEED_SCALE: Record<LearnerLevel, number> = {
  beginner: 0.85,
  intermediate: 1,
}

export const SCENARIO_COPY = {
  selectTitle: 'Scenario Practice',
  selectEmpty: 'No scenarios available yet.',
  resumeBanner: 'You have a scenario in progress.',
  resumeAction: 'Resume',
  historyAction: 'Past sessions',
  leaveAction: 'Leave scenario',
  restartAction: 'Restart',
  leaveConfirm: 'Leave this scenario? Your progress in this session will be discarded.',
  restartConfirm: 'Restart this scenario? Your current progress will be discarded.',
  confirmYes: 'Yes, discard',
  confirmNo: 'Keep going',
  // Voice input — typed input stays available in every one of these states.
  micStart: 'Start recording your response',
  micStop: 'Stop recording',
  micRequesting: 'Requesting microphone access…',
  micTranscribing: 'Transcribing…',
  micPermissionDenied: 'Microphone permission was denied. Enable it in your system settings, or type your response instead.',
  micNoDevice: 'No microphone was found on this device. Type your response instead.',
  micUnsupported: "Speech recording isn't supported in this build. Type your response instead.",
  micFailed: 'Recording failed. Please try again, or type your response instead.',
  sttUnavailable: 'Speech recognition is unavailable in this build. Type your response instead.',
  sttUnusable: "Didn't catch that — record again or type your response. This attempt wasn't counted.",
  sttFallbackSuffix: 'You can type your response instead.',
  heardPrefix: 'Heard',
  heardHint: 'Edit it if you need to, then submit.',
  replayAudio: 'Replay this line',
  // Hints — asking for one never counts as an attempt.
  hintReveal: 'Need a hint?',
  hintRevealMore: 'Show another hint',
  hintAllRevealed: 'All hints shown',
  correctionLabel: 'Try saying it like this',
  assistLabel: 'You could also say',
  // Evaluation mode — shown on the intro only, never inside the active player.
  evaluationDeterministicMode:
    'Responses are graded entirely by deterministic rules on this device. Anything the rules can’t place falls back to the scenario’s own recovery line.',
  evaluationAiMode:
    'Responses are graded by deterministic rules first. Only answers the rules can’t place confidently are passed to an installed local model, which just labels the answer — the scenario script always decides what happens next.',
  evaluatingResponse: 'Checking your answer…',
  privacyDisclosure:
    'Speech recognition runs locally on this device. Responses are graded with deterministic rules first; ' +
    'a local AI model may help judge unclear answers only if one is installed and enabled in Settings. ' +
    'Raw audio recordings are never saved. Transcripts are stored on this device only after you complete a scenario.',
} as const

/* ==================================================================================================
   THE CONVERSATION SCREEN — the round's sheet with a character on it (canvas-kanji-conversation,
   boards ConvLevel / ConvAsking / ConvAnswered / ConvFinished / ConvStates). English leads every
   label and the Japanese stands beside it as texture; nothing on the sheet scrolls, so each list
   below has a row budget and what does not fit is counted instead.
   ================================================================================================== */

/** what the answered line is stamped with, by how the engine graded it */
export const CONVERSATION_OUTCOME: Record<'correct' | 'partial' | 'incorrect' | 'unclear', { en: string; jp: string }> = {
  correct: { en: 'RIGHT', jp: '正解' },
  partial: { en: 'PARTIAL', jp: '部分' },
  incorrect: { en: 'NOT QUITE', jp: '誤り' },
  unclear: { en: 'NOT UNDERSTOOD', jp: '不明' },
}

/** the drafted cards on show at once: the open one and the one-line cards under it */
export const CONVERSATION_CARD_ROWS = 4
/** the hints on the sheet at once; earlier ones are counted */
export const CONVERSATION_HINT_ROWS = 2
/** the lines on one page of a finished session's details and transcript */
export const CONVERSATION_DETAIL_ROWS = 8
/** the objectives the level screen lists before it counts the rest */
export const CONVERSATION_OBJECTIVE_ROWS = 7
/** past sessions on one page of the history */
export const CONVERSATION_HISTORY_ROWS = 6

export const CONVERSATION_COPY = {
  leaveAsk: 'LEAVE THIS SCENARIO?',
  restartAsk: 'START OVER?',
  leaveNote: 'Your progress in this session will be discarded.',
  restartNote: 'Your current progress will be discarded.',
  yes: 'YES, DISCARD',
  no: 'KEEP GOING',
  placeholder: 'type your reply in Japanese',
  saving: 'SAVING THE SESSION…',
  endedEarly: 'A CONVERSATION THAT ENDED EARLY IS NOT SAVED, SO IT DRAFTS NO CARDS.',
  noCards: 'NO CARDS LEFT TO REVIEW',
  historyEmpty: 'No completed sessions yet.',
} as const
