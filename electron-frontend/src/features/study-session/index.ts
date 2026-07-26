// Study-session feature module (issue #69).
//
// Two halves:
//   - round construction: pure builders that turn a card + minigame into a
//     RoundState (`roundBuilder`, `grammarRound`);
//   - the session state machine itself (`useStudySession`) — live round, session
//     counters, lives, combo/streak, confidence capture, the round queue cycle,
//     explicit (missed-word) review, and session persistence/resume.
//
// App.tsx supplies the hook's collaborators through `StudySessionDeps` and
// merges `StudySessionSlice` with voice + blockSessionComplete at the
// SessionProvider call site.

export { buildBridgeGrammarRound } from './grammarRound'
export { buildRound, buildRoundWithBridge } from './roundBuilder'
export { buildConjugationPool, isConjugationDrillCandidate } from './conjugationRound'
export { useStudySession } from './useStudySession'
export type { StudySessionApi, StudySessionDeps, StudySessionSlice } from './types'
