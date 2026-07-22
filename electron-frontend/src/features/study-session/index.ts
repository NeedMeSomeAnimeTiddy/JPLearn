// Study-session feature module (issue #69).
//
// Currently holds the round-construction half: pure builders that turn a card +
// minigame into a RoundState. The session *state* (round/lives/combo/confidence)
// still lives in App.tsx and is the remaining work on #69 -- a `useStudySession`
// hook producing SessionContextValue belongs here next.

export { buildBridgeGrammarRound } from './grammarRound'
export { buildRound, buildRoundWithBridge } from './roundBuilder'
